import { randomUUID } from "node:crypto";
import { chmod, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";

export type BootstrapEnvironment = {
  composeDirectory: string;
  importDirectory: string;
  runtimeEnvFile: string;
  pluginSecret: string;
  callbackUrl: string;
  callbackHealthUrl: string;
  internalUrl: string;
};

type Environment = Record<string, string | undefined>;

function required(source: Environment, name: string) {
  const value = source[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function absolute(source: Environment, name: string) {
  const value = required(source, name);
  if (!isAbsolute(value)) throw new Error(`${name} must be an absolute path`);
  return value;
}

export function validateBootstrapEnvironment(
  source: Environment,
): BootstrapEnvironment {
  const callbackUrl = required(source, "MATTERMOST_CALLBACK_URL");
  const callbackHealthUrl = required(
    source,
    "MATTERMOST_CALLBACK_HEALTH_URL",
  );
  const internalUrl = required(source, "MATTERMOST_INTERNAL_URL");
  const parsedCallback = URL.parse(callbackUrl);
  const parsedCallbackHealth = URL.parse(callbackHealthUrl);
  if (
    !parsedCallback ||
    !["http:", "https:"].includes(parsedCallback.protocol) ||
    !parsedCallback.host
  ) {
    throw new Error("MATTERMOST_CALLBACK_URL must be an absolute HTTP URL");
  }
  if (
    !parsedCallbackHealth ||
    !["http:", "https:"].includes(parsedCallbackHealth.protocol) ||
    !parsedCallbackHealth.host
  ) {
    throw new Error(
      "MATTERMOST_CALLBACK_HEALTH_URL must be an absolute HTTP URL",
    );
  }
  return {
    composeDirectory: absolute(source, "MATTERMOST_COMPOSE_DIR"),
    importDirectory: absolute(source, "MATTERMOST_IMPORT_DIR"),
    runtimeEnvFile: absolute(source, "MATTERMOST_RUNTIME_ENV_FILE"),
    pluginSecret: required(source, "MATTERMOST_PLUGIN_SECRET"),
    callbackUrl,
    callbackHealthUrl,
    internalUrl,
  };
}

export async function assertCrmReachable(
  callbackUrl: string,
  fetcher: typeof fetch = fetch,
) {
  let response: Response;
  try {
    response = await fetcher(callbackUrl, {
      method: "OPTIONS",
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new Error("CRM callback is unreachable");
  }
  if (response.status >= 500) {
    throw new Error(`CRM callback is unhealthy (HTTP ${response.status})`);
  }
}

export type ComposeConfigModel = {
  name?: string;
  volumes?: Record<string, { name?: string } | null>;
};

export function validateComposeProject(model: ComposeConfigModel) {
  if (model.name !== "mattermost") {
    throw new Error("Expected Docker Compose project name mattermost");
  }
  const volumeNames = Object.values(model.volumes ?? {})
    .map((volume) => volume?.name)
    .filter((name): name is string => Boolean(name))
    .sort();
  if (!volumeNames.length)
    throw new Error("Mattermost Compose has no named volumes");
  return volumeNames;
}

export type DockerVolumeInspection = {
  Name?: string;
  Labels?: Record<string, string> | null;
};

export function validateVolumeInspections(
  expectedNames: string[],
  inspections: DockerVolumeInspection[],
) {
  const expected = [...expectedNames].sort();
  const actual = [
    ...new Set(inspections.map((volume) => volume.Name ?? "")),
  ].sort();
  for (const inspection of inspections) {
    if (inspection.Labels?.["com.docker.compose.project"] !== "mattermost") {
      throw new Error(
        `${inspection.Name ?? "unknown"} has an invalid project label`,
      );
    }
    if (!expected.includes(inspection.Name ?? "")) {
      throw new Error(
        `Refusing unexpected volume ${inspection.Name ?? "unknown"}`,
      );
    }
  }
  return actual;
}

function envValue(value: string, name: string) {
  if (/\r|\n/.test(value)) throw new Error(`${name} contains a newline`);
  return value;
}

export async function writeRuntimeEnvironment(
  target: string,
  secrets: { adminToken: string; bootstrapPassword: string },
) {
  if (!isAbsolute(target))
    throw new Error("Runtime environment path must be absolute");
  const temporary = join(dirname(target), `.${randomUUID()}.tmp`);
  const contents = [
    `MATTERMOST_ADMIN_TOKEN=${envValue(secrets.adminToken, "admin token")}`,
    `MATTERMOST_BOOTSTRAP_PASSWORD=${envValue(secrets.bootstrapPassword, "bootstrap password")}`,
    "",
  ].join("\n");
  try {
    await writeFile(temporary, contents, { flag: "wx", mode: 0o600 });
    await chmod(temporary, 0o600);
    await rename(temporary, target);
    await chmod(target, 0o600);
  } finally {
    await rm(temporary, { force: true });
  }
}

export type BootstrapWorkflow = {
  preflight(): Promise<unknown>;
  pause(): Promise<unknown>;
  reset(): Promise<unknown>;
  start(): Promise<unknown>;
  provision(): Promise<unknown>;
  installPlugin(): Promise<unknown>;
  importSnapshot(): Promise<unknown>;
  resolveAndReconcile(): Promise<unknown>;
  recordSuccess(): Promise<unknown>;
  recordFailure(error: unknown): Promise<unknown>;
  resume(): Promise<unknown>;
};

export async function runBootstrapWorkflow(
  confirmed: boolean,
  workflow: BootstrapWorkflow,
) {
  await workflow.preflight();
  if (!confirmed) return { dryRun: true as const };

  await workflow.pause();
  try {
    await workflow.reset();
    await workflow.start();
    await workflow.provision();
    await workflow.installPlugin();
    await workflow.importSnapshot();
    await workflow.resolveAndReconcile();
    await workflow.recordSuccess();
    await workflow.resume();
    return { dryRun: false as const };
  } catch (error) {
    await workflow.recordFailure(error);
    throw error;
  }
}
