import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGunzip, createGzip } from "node:zlib";
import { spawn } from "node:child_process";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createInterface } from "node:readline/promises";
import { config as loadEnv } from "dotenv";

import {
  compareMigrationSchemas,
  formatBytes,
  hashMigrationNames,
  makeBackupName,
  parseBackupArguments,
  parseRestoreArguments,
  validateManifest,
  type DatabaseBackupManifest,
} from "../lib/database-backup.ts";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: join(ROOT_DIR, ".env"), quiet: true });

function isMysqlUrl(value: string | undefined) {
  if (!value) return false;
  try {
    return new URL(value).protocol === "mysql:";
  } catch {
    return false;
  }
}

if (!isMysqlUrl(process.env.DATABASE_URL)) {
  loadEnv({
    path: join(ROOT_DIR, ".env.development"),
    quiet: true,
    override: true,
  });
}

type DatabaseConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

type ToolCommand = {
  command: string;
  prefix: string[];
  env: NodeJS.ProcessEnv;
  name: string;
  version: string;
};

type DatabaseTools = {
  dump: ToolCommand;
  client: ToolCommand;
  connection: DatabaseConfig;
};

function databaseConfig(): DatabaseConfig {
  const rawUrl = process.env.DATABASE_URL?.trim();
  if (!rawUrl) throw new Error("DATABASE_URL is not configured");
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(
      "DATABASE_URL must be a valid mysql:// URL; percent-encode special characters in credentials",
    );
  }
  if (url.protocol !== "mysql:") {
    throw new Error(`Unsupported DATABASE_URL protocol: ${url.protocol}`);
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database)
    throw new Error("DATABASE_URL does not contain a database name");
  return {
    host: url.hostname,
    port: Number(url.port || "3306"),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
  };
}

function backupDirectory() {
  return resolve(
    process.env.DB_BACKUP_DIR?.trim() || join(ROOT_DIR, ".data", "db-backups"),
  );
}

async function runCapture(
  command:
    | ToolCommand
    | { command: string; prefix?: string[]; env?: NodeJS.ProcessEnv },
  args: string[],
  options: { input?: string; allowFailure?: boolean } = {},
) {
  const child = spawn(command.command, [...(command.prefix ?? []), ...args], {
    cwd: ROOT_DIR,
    env: { ...process.env, ...(command.env ?? {}) },
    stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  if (
    !child.stdout ||
    !child.stderr ||
    (options.input !== undefined && !child.stdin)
  ) {
    child.kill();
    throw new Error(`Could not open standard streams for ${command.command}`);
  }
  const childStdout = child.stdout;
  const childStderr = child.stderr;
  let stdout = "";
  let stderr = "";
  childStdout.setEncoding("utf8");
  childStderr.setEncoding("utf8");
  childStdout.on("data", (chunk) => {
    stdout += chunk;
    if (stdout.length > 16 * 1024 * 1024) child.kill();
  });
  childStderr.on("data", (chunk) => {
    stderr += chunk;
    if (stderr.length > 2 * 1024 * 1024) child.kill();
  });
  if (options.input !== undefined) child.stdin!.end(options.input);

  const exitCode = await new Promise<number>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolveExit(code ?? 1));
  });
  if (exitCode !== 0 && !options.allowFailure) {
    throw new Error(
      `${command.command} exited with code ${exitCode}: ${stderr.trim() || "no error output"}`,
    );
  }
  return { exitCode, stdout, stderr };
}

async function findLocalTool(candidates: string[], configured?: string) {
  for (const command of configured ? [configured] : candidates) {
    try {
      const result = await runCapture(
        { command, env: { MYSQL_PWD: process.env.MYSQL_PWD } },
        ["--version"],
        { allowFailure: true },
      );
      if (result.exitCode === 0) {
        return {
          command,
          prefix: [],
          env: {},
          name: command,
          version:
            (result.stdout || result.stderr).trim().split(/\r?\n/)[0] ??
            command,
        } satisfies ToolCommand;
      }
    } catch {
      // Try the next binary or Docker fallback.
    }
  }
  return null;
}

async function dockerTool(
  container: string,
  binary: "mariadb-dump" | "mariadb",
  password: string,
) {
  const prefix = ["exec", "-i", "-e", "MYSQL_PWD", container, binary];
  const result = await runCapture(
    { command: "docker", prefix, env: { MYSQL_PWD: password } },
    ["--version"],
    { allowFailure: true },
  );
  if (result.exitCode !== 0) return null;
  return {
    command: "docker",
    prefix,
    env: { MYSQL_PWD: password },
    name: `docker:${container}/${binary}`,
    version:
      (result.stdout || result.stderr).trim().split(/\r?\n/)[0] ?? binary,
  } satisfies ToolCommand;
}

async function resolveDatabaseTools(): Promise<DatabaseTools> {
  const connection = databaseConfig();
  const passwordEnv = { MYSQL_PWD: connection.password };
  const dump = await findLocalTool(
    ["mariadb-dump", "mysqldump"],
    process.env.MARIADB_DUMP_BIN?.trim(),
  );
  const client = await findLocalTool(
    ["mariadb", "mysql"],
    process.env.MARIADB_BIN?.trim(),
  );
  if (dump && client) {
    dump.env = passwordEnv;
    client.env = passwordEnv;
    return { dump, client, connection };
  }

  const container = process.env.DB_DOCKER_CONTAINER?.trim() || "vue-crm-dev-db";
  try {
    const [dockerDump, dockerClient] = await Promise.all([
      dockerTool(container, "mariadb-dump", connection.password),
      dockerTool(container, "mariadb", connection.password),
    ]);
    if (dockerDump && dockerClient) {
      return {
        dump: dockerDump,
        client: dockerClient,
        connection: {
          ...connection,
          host: process.env.DB_DOCKER_HOST?.trim() || "127.0.0.1",
          port: Number(process.env.DB_DOCKER_PORT || "3306"),
        },
      };
    }
  } catch {
    // Report a single actionable error below.
  }

  throw new Error(
    "MariaDB client tools were not found. Install mariadb-client, set MARIADB_DUMP_BIN/MARIADB_BIN, or start the vue-crm-dev-db Docker container.",
  );
}

function connectionArgs(connection: DatabaseConfig) {
  return [
    "--protocol=TCP",
    `--host=${connection.host}`,
    `--port=${connection.port}`,
    `--user=${connection.user}`,
    "--default-character-set=utf8mb4",
  ];
}

async function queryRows(tools: DatabaseTools, sql: string) {
  const result = await runCapture(tools.client, [
    ...connectionArgs(tools.connection),
    "--batch",
    "--skip-column-names",
    `--database=${tools.connection.database}`,
    `--execute=${sql}`,
  ]);
  return result.stdout
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean);
}

async function appliedMigrations(tools: DatabaseTools) {
  const exists = await queryRows(
    tools,
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '_prisma_migrations'",
  );
  if (exists[0] !== "1") return [];
  return await queryRows(
    tools,
    "SELECT migration_name FROM `_prisma_migrations` WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY started_at ASC, migration_name ASC",
  );
}

async function codeMigrationNames() {
  const entries = await readdir(join(ROOT_DIR, "prisma", "migrations"), {
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function sha256File(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function verifyGzipFile(path: string) {
  await pipeline(
    createReadStream(path),
    createGunzip(),
    new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }),
  );
}

async function prismaSchemaHash() {
  return await sha256File(join(ROOT_DIR, "prisma", "schema.prisma"));
}

async function uniqueBackupName(directory: string, requested: string) {
  let name = requested;
  for (let suffix = 1; ; suffix += 1) {
    try {
      await access(join(directory, `${name}.json`));
      name = `${requested}_${suffix}`;
    } catch {
      return name;
    }
  }
}

async function streamDump(tools: DatabaseTools, targetPath: string) {
  const args = [
    ...connectionArgs(tools.connection),
    "--single-transaction",
    "--quick",
    "--skip-lock-tables",
    "--add-drop-table",
    "--routines",
    "--events",
    "--triggers",
    "--hex-blob",
    "--no-tablespaces",
    tools.connection.database,
  ];
  const child = spawn(tools.dump.command, [...tools.dump.prefix, ...args], {
    cwd: ROOT_DIR,
    env: { ...process.env, ...tools.dump.env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const compression = pipeline(
    child.stdout,
    createGzip({ level: 6 }),
    createWriteStream(targetPath, { flags: "wx" }),
  );
  const completion = new Promise<number>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolveExit(code ?? 1));
  });
  const [streamResult, processResult] = await Promise.allSettled([
    compression,
    completion,
  ]);
  if (streamResult.status === "rejected") throw streamResult.reason;
  if (processResult.status === "rejected") throw processResult.reason;
  if (processResult.value !== 0) {
    throw new Error(
      `${tools.dump.name} exited with code ${processResult.value}: ${stderr.trim() || "no error output"}`,
    );
  }
}

async function createBackup(
  tools: DatabaseTools,
  options: {
    label?: string | null;
    kind?: "manual" | "pre-restore";
    sourceBackup?: string;
  } = {},
) {
  const directory = backupDirectory();
  await mkdir(directory, { recursive: true });
  const createdAt = new Date();
  const requestedName = makeBackupName(createdAt, options);
  const name = await uniqueBackupName(directory, requestedName);
  const dumpFile = `${name}.sql.gz`;
  const dumpPath = join(directory, dumpFile);
  const partialPath = `${dumpPath}.partial`;

  const migrations = await appliedMigrations(tools);
  try {
    await streamDump(tools, partialPath);
    await rename(partialPath, dumpPath);
    const fileStat = await stat(dumpPath);
    const manifest: DatabaseBackupManifest = {
      formatVersion: 1,
      name,
      kind: options.kind ?? "manual",
      createdAt: createdAt.toISOString(),
      dumpFile,
      sizeBytes: fileStat.size,
      sha256: await sha256File(dumpPath),
      database: {
        name: tools.connection.database,
        host: tools.connection.host,
        port: tools.connection.port,
      },
      schema: {
        prismaSchemaSha256: await prismaSchemaHash(),
        migrationsSha256: hashMigrationNames(migrations),
        appliedMigrations: migrations,
      },
      tool: { name: tools.dump.name, version: tools.dump.version },
      ...(options.sourceBackup ? { sourceBackup: options.sourceBackup } : {}),
    };
    await writeFile(
      join(directory, `${name}.json`),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    printBackup(manifest, dumpPath);
    return { manifest, dumpPath };
  } catch (error) {
    await rm(partialPath, { force: true });
    throw error;
  }
}

function printBackup(manifest: DatabaseBackupManifest, dumpPath: string) {
  console.log(`Backup: ${manifest.name}`);
  console.log(`File: ${dumpPath}`);
  console.log(
    `Database: ${manifest.database.name} at ${manifest.database.host}:${manifest.database.port}`,
  );
  console.log(
    `Size: ${formatBytes(manifest.sizeBytes)} | migrations: ${manifest.schema.appliedMigrations.length} | sha256: ${manifest.sha256.slice(0, 12)}…`,
  );
}

async function listManifests(directory: string) {
  let files: string[];
  try {
    files = await readdir(directory);
  } catch {
    return [];
  }
  const manifests: DatabaseBackupManifest[] = [];
  for (const file of files.filter((name) => name.endsWith(".json"))) {
    try {
      const parsed = JSON.parse(await readFile(join(directory, file), "utf8"));
      manifests.push(validateManifest(parsed));
    } catch (error) {
      console.warn(
        `Skipping invalid backup manifest ${file}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
  return manifests.sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
  );
}

async function selectBackup(name: string | null) {
  const directory = backupDirectory();
  const manifests = await listManifests(directory);
  const selected = name
    ? manifests.find(
        (manifest) =>
          manifest.name === name ||
          manifest.dumpFile === name ||
          manifest.dumpFile.replace(/\.sql\.gz$/i, "") === name,
      )
    : manifests[0];
  if (!selected) {
    throw new Error(
      name ? `Backup not found: ${name}` : "No database backups found",
    );
  }
  const dumpPath = resolve(directory, selected.dumpFile);
  if (dirname(dumpPath) !== directory) {
    throw new Error("Backup manifest resolves outside DB_BACKUP_DIR");
  }
  const fileStat = await stat(dumpPath);
  if (fileStat.size !== selected.sizeBytes) {
    throw new Error("Backup size does not match its manifest");
  }
  const checksum = await sha256File(dumpPath);
  if (checksum !== selected.sha256) {
    throw new Error("Backup checksum does not match its manifest");
  }
  await verifyGzipFile(dumpPath);
  return { manifest: selected, dumpPath };
}

function quoteIdentifier(value: string) {
  return `\`${value.replaceAll("`", "``")}\``;
}

async function executeSql(tools: DatabaseTools, sql: string) {
  await runCapture(
    tools.client,
    [
      ...connectionArgs(tools.connection),
      `--database=${tools.connection.database}`,
    ],
    { input: sql },
  );
}

async function clearDatabase(tools: DatabaseTools) {
  const [views, tables, routines, events] = await Promise.all([
    queryRows(
      tools,
      "SELECT TABLE_NAME FROM information_schema.VIEWS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME",
    ),
    queryRows(
      tools,
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
    ),
    queryRows(
      tools,
      "SELECT CONCAT(ROUTINE_TYPE, '\\t', ROUTINE_NAME) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE() ORDER BY ROUTINE_NAME",
    ),
    queryRows(
      tools,
      "SELECT EVENT_NAME FROM information_schema.EVENTS WHERE EVENT_SCHEMA = DATABASE() ORDER BY EVENT_NAME",
    ),
  ]);
  const statements = ["SET FOREIGN_KEY_CHECKS=0;"];
  statements.push(
    ...events.map((name) => `DROP EVENT IF EXISTS ${quoteIdentifier(name)};`),
  );
  for (const routine of routines) {
    const [type, name] = routine.split("\t");
    if ((type === "PROCEDURE" || type === "FUNCTION") && name) {
      statements.push(`DROP ${type} IF EXISTS ${quoteIdentifier(name)};`);
    }
  }
  statements.push(
    ...views.map((name) => `DROP VIEW IF EXISTS ${quoteIdentifier(name)};`),
  );
  statements.push(
    ...tables.map((name) => `DROP TABLE IF EXISTS ${quoteIdentifier(name)};`),
  );
  statements.push("SET FOREIGN_KEY_CHECKS=1;");
  await executeSql(tools, `${statements.join("\n")}\n`);
}

async function importDump(tools: DatabaseTools, dumpPath: string) {
  const child = spawn(
    tools.client.command,
    [
      ...tools.client.prefix,
      ...connectionArgs(tools.connection),
      `--database=${tools.connection.database}`,
    ],
    {
      cwd: ROOT_DIR,
      env: { ...process.env, ...tools.client.env },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.stdout.resume();
  const input = pipeline(
    createReadStream(dumpPath),
    createGunzip(),
    child.stdin,
  );
  const completion = new Promise<number>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolveExit(code ?? 1));
  });
  const [streamResult, processResult] = await Promise.allSettled([
    input,
    completion,
  ]);
  if (streamResult.status === "rejected") throw streamResult.reason;
  if (processResult.status === "rejected") throw processResult.reason;
  if (processResult.value !== 0) {
    throw new Error(
      `${tools.client.name} import exited with code ${processResult.value}: ${stderr.trim() || "no error output"}`,
    );
  }
}

async function confirmRestore(message: string, assumeYes: boolean) {
  if (assumeYes) return true;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      "Restore requires an interactive terminal or the explicit --yes flag",
    );
  }
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = (
      await prompt.question(`${message} Type RESTORE to continue: `)
    ).trim();
    return answer === "RESTORE";
  } finally {
    prompt.close();
  }
}

async function restoreBackup(
  tools: DatabaseTools,
  name: string | null,
  yes: boolean,
) {
  const target = await selectBackup(name);
  if (target.manifest.database.name !== tools.connection.database) {
    throw new Error(
      `Backup belongs to database ${target.manifest.database.name}, current target is ${tools.connection.database}`,
    );
  }

  const [currentMigrations, codeMigrations, currentPrismaHash] =
    await Promise.all([
      appliedMigrations(tools),
      codeMigrationNames(),
      prismaSchemaHash(),
    ]);
  const comparison = compareMigrationSchemas(
    currentMigrations,
    target.manifest.schema.appliedMigrations,
  );
  const missingFromCode = target.manifest.schema.appliedMigrations.filter(
    (migration) => !codeMigrations.includes(migration),
  );
  if (missingFromCode.length) {
    throw new Error(
      `Refusing to restore a schema with migrations missing from this checkout: ${missingFromCode.join(", ")}`,
    );
  }
  const schemaMatches =
    comparison.matches &&
    currentPrismaHash === target.manifest.schema.prismaSchemaSha256;

  console.log(`Selected: ${target.manifest.name}`);
  console.log(
    `Created: ${target.manifest.createdAt} | size: ${formatBytes(target.manifest.sizeBytes)} | migrations: ${target.manifest.schema.appliedMigrations.length}`,
  );
  if (!schemaMatches) {
    console.warn("Schema mismatch detected.");
    if (comparison.onlyInCurrent.length) {
      console.warn(
        `Migrations that will be rolled back: ${comparison.onlyInCurrent.join(", ")}`,
      );
    }
    if (comparison.onlyInBackup.length) {
      console.warn(
        `Migrations present only in backup: ${comparison.onlyInBackup.join(", ")}`,
      );
    }
    if (currentPrismaHash !== target.manifest.schema.prismaSchemaSha256) {
      console.warn(
        "The Prisma schema file hash differs from the backup manifest.",
      );
    }
  }

  console.log("Creating mandatory pre-restore safety backup...");
  const safety = await createBackup(tools, {
    kind: "pre-restore",
    label: target.manifest.name.slice(-32),
    sourceBackup: target.manifest.name,
  });

  const accepted = await confirmRestore(
    schemaMatches
      ? `This will replace every table in ${tools.connection.database}. Safety backup: ${safety.manifest.name}.`
      : `This will replace every table and roll the migration schema back to ${target.manifest.name}. Safety backup: ${safety.manifest.name}.`,
    yes,
  );
  if (!accepted) {
    console.log(
      `Restore cancelled. Safety backup kept: ${safety.manifest.name}`,
    );
    return;
  }

  try {
    await clearDatabase(tools);
    await importDump(tools, target.dumpPath);
    const restoredMigrations = await appliedMigrations(tools);
    const restoredComparison = compareMigrationSchemas(
      restoredMigrations,
      target.manifest.schema.appliedMigrations,
    );
    if (!restoredComparison.matches) {
      throw new Error(
        "Restored migration state does not match the backup manifest",
      );
    }
  } catch (restoreError) {
    console.error(
      `Restore failed: ${restoreError instanceof Error ? restoreError.message : restoreError}`,
    );
    console.error(
      `Attempting automatic recovery from ${safety.manifest.name}...`,
    );
    try {
      await clearDatabase(tools);
      await importDump(tools, safety.dumpPath);
      console.error("Original database restored from the safety backup.");
    } catch (rollbackError) {
      throw new Error(
        `Restore and automatic recovery both failed. Preserve ${safety.dumpPath}. Recovery error: ${rollbackError instanceof Error ? rollbackError.message : rollbackError}`,
      );
    }
    throw restoreError;
  }

  console.log(`Restored: ${target.manifest.name}`);
  console.log(`Safety backup: ${safety.manifest.name}`);
  console.log(
    schemaMatches
      ? "Schema migration state is unchanged."
      : "Database schema now matches the selected backup. Run prisma migrate deploy only when you intentionally want to migrate it forward again.",
  );
}

function printHelp(command: string) {
  if (command === "backup") {
    console.log("Usage: npm run db:backup [-- --name <label>]");
    return;
  }
  console.log("Usage: npm run db:restore [-- -name <backup-name>] [--yes]");
  console.log("Without -name, the newest valid backup is restored.");
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "backup") {
    const parsed = parseBackupArguments(args);
    if (parsed.help) return printHelp(command);
    const tools = await resolveDatabaseTools();
    await createBackup(tools, { label: parsed.label });
    return;
  }
  if (command === "restore") {
    const parsed = parseRestoreArguments(args);
    if (parsed.help) return printHelp(command);
    const tools = await resolveDatabaseTools();
    await restoreBackup(tools, parsed.name, parsed.yes);
    return;
  }
  throw new Error("Usage: tsx scripts/database.ts <backup|restore>");
}

main().catch((error) => {
  console.error(
    `Database command failed: ${error instanceof Error ? error.message : error}`,
  );
  process.exitCode = 1;
});
