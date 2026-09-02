import { createHash } from "node:crypto";
import { basename } from "node:path";

export const DATABASE_BACKUP_FORMAT_VERSION = 1;

export type DatabaseBackupManifest = {
  formatVersion: typeof DATABASE_BACKUP_FORMAT_VERSION;
  name: string;
  kind: "manual" | "pre-restore";
  createdAt: string;
  dumpFile: string;
  sizeBytes: number;
  sha256: string;
  database: {
    name: string;
    host: string;
    port: number;
  };
  schema: {
    prismaSchemaSha256: string;
    migrationsSha256: string;
    appliedMigrations: string[];
  };
  tool: {
    name: string;
    version: string;
  };
  sourceBackup?: string;
};

export type RestoreArguments = {
  name: string | null;
  yes: boolean;
  help: boolean;
};

export function parseRestoreArguments(args: string[]): RestoreArguments {
  let name: string | null = null;
  let yes = false;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--yes" || argument === "-y") {
      yes = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      help = true;
      continue;
    }
    if (argument === "--name" || argument === "-name") {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a backup name`);
      name = validateBackupSelector(value);
      index += 1;
      continue;
    }
    if (argument.startsWith("--name=") || argument.startsWith("-name=")) {
      name = validateBackupSelector(argument.slice(argument.indexOf("=") + 1));
      continue;
    }
    throw new Error(`Unknown restore argument: ${argument}`);
  }

  return { name, yes, help };
}

export function parseBackupArguments(args: string[]) {
  let label: string | null = null;
  let help = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--help" || argument === "-h") {
      help = true;
      continue;
    }
    if (argument === "--name" || argument === "-name") {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a name`);
      label = sanitizeBackupLabel(value);
      index += 1;
      continue;
    }
    if (argument.startsWith("--name=") || argument.startsWith("-name=")) {
      label = sanitizeBackupLabel(argument.slice(argument.indexOf("=") + 1));
      continue;
    }
    throw new Error(`Unknown backup argument: ${argument}`);
  }
  return { label, help };
}

export function sanitizeBackupLabel(value: string) {
  const label = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (!label) throw new Error("Backup name must contain a letter or number");
  return label;
}

export function validateBackupSelector(value: string) {
  const selected = basename(value.trim());
  if (!selected || selected !== value.trim() || /[\\/]/.test(value)) {
    throw new Error("Backup name must not contain a path");
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(selected)) {
    throw new Error("Backup name contains unsupported characters");
  }
  return selected.replace(/\.json$/i, "").replace(/\.sql\.gz$/i, "");
}

export function makeBackupName(
  now: Date,
  options: { label?: string | null; kind?: "manual" | "pre-restore" } = {},
) {
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const kind = options.kind === "pre-restore" ? "pre-restore" : "backup";
  const label = options.label ? `_${sanitizeBackupLabel(options.label)}` : "";
  return `vue-crm_${kind}_${timestamp}${label}`;
}

export function hashMigrationNames(names: string[]) {
  return createHash("sha256").update(names.join("\n")).digest("hex");
}

export function compareMigrationSchemas(current: string[], backup: string[]) {
  const currentSet = new Set(current);
  const backupSet = new Set(backup);
  return {
    matches:
      current.length === backup.length &&
      current.every((migration, index) => migration === backup[index]),
    onlyInCurrent: current.filter((migration) => !backupSet.has(migration)),
    onlyInBackup: backup.filter((migration) => !currentSet.has(migration)),
  };
}

export function validateManifest(value: unknown): DatabaseBackupManifest {
  if (!value || typeof value !== "object") {
    throw new Error("Backup manifest is not an object");
  }
  const manifest = value as Partial<DatabaseBackupManifest>;
  if (manifest.formatVersion !== DATABASE_BACKUP_FORMAT_VERSION) {
    throw new Error(
      `Unsupported backup format: ${String(manifest.formatVersion)}`,
    );
  }
  if (
    !manifest.name ||
    !manifest.createdAt ||
    !manifest.dumpFile ||
    !manifest.sha256 ||
    !manifest.database?.name ||
    !manifest.schema?.prismaSchemaSha256 ||
    !manifest.schema?.migrationsSha256 ||
    !Array.isArray(manifest.schema.appliedMigrations) ||
    !manifest.tool?.name
  ) {
    throw new Error("Backup manifest is incomplete");
  }
  if (manifest.dumpFile !== basename(manifest.dumpFile)) {
    throw new Error("Backup manifest contains an unsafe dump path");
  }
  if (
    manifest.schema.migrationsSha256 !==
    hashMigrationNames(manifest.schema.appliedMigrations)
  ) {
    throw new Error("Backup migration metadata checksum is invalid");
  }
  return manifest as DatabaseBackupManifest;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = units[0]!;
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index]!;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
}
