import "dotenv/config";
import { randomBytes } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { spawn } from "node:child_process";
import { basename, join, resolve } from "node:path";
import { parse as parseDotenv } from "dotenv";
import type { PrismaClient } from "@prisma/client";
import {
  assertCrmReachable,
  runBootstrapWorkflow,
  validateBootstrapEnvironment,
  validateComposeProject,
  validateVolumeInspections,
  writeRuntimeEnvironment,
  type BootstrapEnvironment,
  type DockerVolumeInspection,
} from "../server/lib/mattermost/bootstrap-policy.ts";
import {
  MattermostClient,
  getMattermostConfig,
} from "../server/lib/mattermost/client.ts";
import {
  createPrismaMattermostLinkStore,
  resolveMattermostLinks,
} from "../server/lib/mattermost/link-resolution.ts";
import {
  createPrismaMattermostOutboxRepository,
  processMattermostOutbox,
} from "../server/lib/mattermost/outbox.ts";
import {
  createPrismaMattermostReconcileStore,
  reconcileMattermost,
} from "../server/lib/mattermost/reconcile.ts";
import {
  dispatchMattermostEvent,
  runtimeMattermostDispatchDependencies,
} from "../server/lib/mattermost/dispatch.ts";

type CommandOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

function runCommand(
  file: string,
  args: string[],
  options: CommandOptions = {},
) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(file, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) return resolve(stdout.trim());
      const lines = stderr
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const detail = lines.at(-1) || "command failed";
      reject(
        new Error(
          `${basename(file)} exited ${code}: ${detail.slice(0, 300)}`,
        ),
      );
    });
  });
}

function compose(config: BootstrapEnvironment, ...args: string[]) {
  return runCommand("docker", ["compose", ...args], {
    cwd: config.composeDirectory,
  });
}

function sanitizedError(error: unknown) {
  return (error instanceof Error ? error.message : "Bootstrap failed")
    .split(/\r?\n/, 1)[0]
    .slice(0, 500);
}

async function assertMattermostPluginSecretMatches(config: BootstrapEnvironment) {
  const environment = parseDotenv(
    await readFile(join(config.composeDirectory, ".env"), "utf8"),
  );
  const sharedSecret = environment.MATTERMOST_SHARED_SECRET?.trim();
  if (!sharedSecret) {
    throw new Error("Mattermost .env is missing MATTERMOST_SHARED_SECRET");
  }
  if (sharedSecret !== config.pluginSecret) {
    throw new Error(
      "MATTERMOST_PLUGIN_SECRET must match /opt/mattermost/.env MATTERMOST_SHARED_SECRET",
    );
  }
}

async function provisionAdministrator(config: BootstrapEnvironment) {
  const username =
    process.env.MATTERMOST_BOOTSTRAP_USERNAME || "crm-bootstrap-admin";
  const email =
    process.env.MATTERMOST_BOOTSTRAP_EMAIL || "crm-bootstrap@localhost.invalid";
  const password = `Crm!${randomBytes(36).toString("base64url")}`;
  const baseUrl = config.internalUrl.replace(/\/+$/, "");
  const createResponse = await fetch(`${baseUrl}/api/v4/users`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, email, password }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!createResponse.ok) {
    throw new Error(
      `Bootstrap administrator creation returned HTTP ${createResponse.status}`,
    );
  }
  await compose(
    config,
    "exec",
    "-T",
    "mattermost",
    "/mattermost/bin/mmctl",
    "roles",
    "system-admin",
    username,
    "--local",
  );

  const loginResponse = await fetch(`${baseUrl}/api/v4/users/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ login_id: email, password }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!loginResponse.ok)
    throw new Error(
      `Bootstrap administrator login returned HTTP ${loginResponse.status}`,
    );
  const sessionToken = loginResponse.headers.get("token");
  const user = (await loginResponse.json()) as { id?: string };
  if (!sessionToken || !user.id)
    throw new Error("Bootstrap administrator login returned no token");

  const tokenResponse = await fetch(
    `${baseUrl}/api/v4/users/${encodeURIComponent(user.id)}/tokens`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${sessionToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ description: "CRM integration" }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!tokenResponse.ok)
    throw new Error(
      `Access token creation returned HTTP ${tokenResponse.status}`,
    );
  const token = (await tokenResponse.json()) as { token?: string };
  if (!token.token) throw new Error("Access token creation returned no token");
  await writeRuntimeEnvironment(config.runtimeEnvFile, {
    adminToken: token.token,
    bootstrapPassword: password,
  });
  await compose(
    config,
    "up",
    "-d",
    "--force-recreate",
    "--wait",
    "--wait-timeout",
    "300",
    "mattermost",
    "gateway",
  );
}

async function inspectMattermostVolumes(expectedVolumes: string[]) {
  const projectVolumes = (
    await runCommand("docker", [
      "volume",
      "ls",
      "--filter",
      "label=com.docker.compose.project=mattermost",
      "--format",
      "{{.Name}}",
    ])
  )
    .split(/\r?\n/)
    .filter(Boolean);
  const candidates = [...new Set([...expectedVolumes, ...projectVolumes])];
  const inspections: DockerVolumeInspection[] = [];
  for (const volume of candidates) {
    try {
      inspections.push(
        ...(JSON.parse(
          await runCommand("docker", ["volume", "inspect", volume]),
        ) as DockerVolumeInspection[]),
      );
    } catch (error) {
      if (
        !/no such volume/i.test(error instanceof Error ? error.message : "")
      ) {
        throw error;
      }
    }
  }
  return inspections;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((argument) => argument !== "--confirm-reset")) {
    throw new Error("Only --confirm-reset is supported");
  }
  const confirmed = args.includes("--confirm-reset");
  const validated = validateBootstrapEnvironment(process.env);
  const config = {
    ...validated,
    composeDirectory: await realpath(validated.composeDirectory),
    importDirectory: resolve(validated.importDirectory),
  };
  const { default: prisma } = await import("../server/lib/prisma.ts");
  database = prisma;
  let expectedVolumes: string[] = [];
  let inspectedVolumes: string[] = [];
  let exportResult: {
    archivePath: string;
    snapshotCutoff: string;
    counts: Record<string, number>;
  } | null = null;

  await runBootstrapWorkflow(confirmed, {
    async preflight() {
      await assertMattermostPluginSecretMatches(config);
      const model = JSON.parse(
        await compose(config, "config", "--format", "json"),
      );
      expectedVolumes = validateComposeProject(model);
      const inspections = await inspectMattermostVolumes(expectedVolumes);
      inspectedVolumes = validateVolumeInspections(
        expectedVolumes,
        inspections,
      );
      const image = model.services?.mattermost?.image;
      if (image !== "mattermost/mattermost-team-edition:11.7.0") {
        throw new Error("Mattermost image must remain pinned to 11.7.0");
      }
      await runCommand("docker", [
        "run",
        "--rm",
        "--entrypoint",
        "/mattermost/bin/mmctl",
        image,
        "import",
        "--help",
      ]);
      await assertCrmReachable(config.callbackHealthUrl);
      const [users, workspaces, conversations, messages] = await Promise.all([
        prisma.user.count(),
        prisma.workspace.count(),
        prisma.conversation.count(),
        prisma.conversationMessage.count(),
      ]);
      process.stdout.write(
        `${confirmed ? "CONFIRMED RESET" : "DRY RUN"}: ${JSON.stringify({
          composeDirectory: config.composeDirectory,
          volumes: inspectedVolumes,
          counts: { users, workspaces, conversations, messages },
        })}\n`,
      );
    },
    async pause() {
      await prisma.mattermostSyncControl.upsert({
        where: { key: "global" },
        create: {
          key: "global",
          pausedAt: new Date(),
          pauseReason: "bootstrap",
        },
        update: {
          pausedAt: new Date(),
          pauseReason: "bootstrap",
          lastBootstrapState: "RUNNING",
        },
      });
    },
    async reset() {
      await compose(config, "down");
      if (inspectedVolumes.length) {
        await runCommand("docker", ["volume", "rm", ...inspectedVolumes]);
      }
    },
    async start() {
      await runCommand(
        "docker",
        ["compose", "up", "-d", "--wait", "--wait-timeout", "300"],
        {
          cwd: config.composeDirectory,
          env: {
            ...process.env,
            MM_BOOTSTRAP_ENABLE_OPEN_SERVER: "true",
            MM_BOOTSTRAP_ENABLE_USER_CREATION: "true",
            MM_BOOTSTRAP_ENABLE_EMAIL_SIGNUP: "true",
          },
        },
      );
    },
    async provision() {
      await provisionAdministrator(config);
    },
    async installPlugin() {
      await runCommand(
        join(config.composeDirectory, "scripts", "install-plugin.sh"),
        [],
        {
          cwd: config.composeDirectory,
          env: {
            ...process.env,
            MATTERMOST_CALLBACK_URL: config.callbackUrl,
            MATTERMOST_SHARED_SECRET: config.pluginSecret,
          },
        },
      );
    },
    async importSnapshot() {
      const npm = process.platform === "win32" ? "npm.cmd" : "npm";
      const output = await runCommand(
        npm,
        ["run", "mattermost:export", "--silent"],
        {
          env: {
            ...process.env,
            MATTERMOST_IMPORT_DIR: config.importDirectory,
          },
        },
      );
      const resultLine = output
        .split(/\r?\n/)
        .findLast((line) => line.startsWith("{"));
      if (!resultLine)
        throw new Error("Mattermost exporter returned no manifest");
      const parsedExport = JSON.parse(resultLine) as NonNullable<
        typeof exportResult
      >;
      exportResult = parsedExport;
      await prisma.mattermostSyncControl.update({
        where: { key: "global" },
        data: { snapshotCutoff: new Date(parsedExport.snapshotCutoff) },
      });
      await runCommand(
        join(config.composeDirectory, "scripts", "import-crm.sh"),
        [parsedExport.archivePath],
        {
          cwd: config.composeDirectory,
          env: {
            ...process.env,
            MATTERMOST_IMPORT_DIR: config.importDirectory,
          },
        },
      );
    },
    async resolveAndReconcile() {
      const store = createPrismaMattermostLinkStore(prisma);
      const clientConfig = getMattermostConfig({
        ...process.env,
        MATTERMOST_INTERNAL_URL: config.internalUrl,
        MATTERMOST_RUNTIME_ENV_FILE: config.runtimeEnvFile,
        MATTERMOST_PLUGIN_SECRET: config.pluginSecret,
      });
      const client = new MattermostClient(clientConfig);
      await resolveMattermostLinks(await store.load(), client, store);
      const reconcileStore = createPrismaMattermostReconcileStore(prisma);
      const reconciliation = await reconcileMattermost(
        await reconcileStore.load(),
        client,
        reconcileStore,
      );
      if (reconciliation.failed) {
        throw new Error(
          `Mattermost reconciliation left ${reconciliation.failed} failed operations`,
        );
      }

      const repository = createPrismaMattermostOutboxRepository(prisma);
      const unpausedRepository = {
        ...repository,
        isPaused: async () => false,
      };
      for (let batch = 0; batch < 1_000; batch += 1) {
        const drained = await processMattermostOutbox({
          enabled: true,
          repository: unpausedRepository,
          dispatch: (record) =>
            dispatchMattermostEvent(
              record,
              runtimeMattermostDispatchDependencies(prisma, clientConfig),
            ),
        });
        if (drained.failed || drained.retried) {
          throw new Error(
            "Mattermost outbox did not drain cleanly after bootstrap",
          );
        }
        if (!drained.claimed) break;
        if (batch === 999)
          throw new Error("Mattermost outbox drain exceeded its limit");
      }
    },
    async recordSuccess() {
      await prisma.mattermostSyncControl.update({
        where: { key: "global" },
        data: {
          lastBootstrapAt: new Date(),
          lastBootstrapState: "SUCCEEDED",
          lastBootstrapSummary: exportResult
            ? {
                snapshotCutoff: exportResult.snapshotCutoff,
                counts: exportResult.counts,
              }
            : {},
        },
      });
    },
    async recordFailure(error) {
      await prisma.mattermostSyncControl.upsert({
        where: { key: "global" },
        create: {
          key: "global",
          pausedAt: new Date(),
          pauseReason: "bootstrap-failed",
          lastBootstrapState: "FAILED",
          lastBootstrapSummary: { error: sanitizedError(error) },
        },
        update: {
          pauseReason: "bootstrap-failed",
          lastBootstrapState: "FAILED",
          lastBootstrapSummary: { error: sanitizedError(error) },
        },
      });
    },
    async resume() {
      await prisma.mattermostSyncControl.update({
        where: { key: "global" },
        data: { pausedAt: null, pauseReason: null },
      });
    },
  });
}

let database: PrismaClient | undefined;

main()
  .catch((error: unknown) => {
    process.stderr.write(
      `Mattermost bootstrap failed: ${sanitizedError(error)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => database?.$disconnect());
