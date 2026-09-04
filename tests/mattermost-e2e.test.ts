import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";

type E2EEnvironment = Record<string, string | undefined>;

export function validateMattermostE2EEnvironment(source: E2EEnvironment) {
  if (source.MATTERMOST_E2E !== "true") return { enabled: false as const };
  const databaseUrl = source.MATTERMOST_E2E_DATABASE_URL?.trim();
  const composeDirectory = source.MATTERMOST_E2E_COMPOSE_DIR?.trim();
  const internalUrl = source.MATTERMOST_E2E_INTERNAL_URL?.trim();
  const publicUrl = source.MATTERMOST_E2E_PUBLIC_URL?.trim();
  if (!databaseUrl || !composeDirectory || !internalUrl || !publicUrl) {
    throw new Error("Mattermost E2E requires its four MATTERMOST_E2E_* targets");
  }
  const parsedDatabase = new URL(databaseUrl);
  if (!parsedDatabase.pathname.toLowerCase().includes("mattermost_e2e")) {
    throw new Error("Mattermost E2E database name must contain mattermost_e2e");
  }
  const parsedInternal = new URL(internalUrl);
  const parsedPublic = new URL(publicUrl);
  for (const target of [parsedInternal, parsedPublic]) {
    if (!["127.0.0.1", "localhost", "::1"].includes(target.hostname)) {
      throw new Error("Mattermost E2E endpoints must be loopback-only");
    }
    if (target.port === "8065" || target.port === "8066") {
      throw new Error("Mattermost E2E cannot use production Mattermost ports");
    }
  }
  const resolvedCompose = resolve(composeDirectory);
  if (!/(fixture|e2e)/i.test(resolvedCompose)) {
    throw new Error("Mattermost E2E compose path must identify a fixture");
  }
  return {
    enabled: true as const,
    databaseUrl,
    composeDirectory: resolvedCompose,
    internalUrl: parsedInternal.origin,
    publicUrl: parsedPublic.origin,
  };
}

test("Mattermost destructive E2E has fixture-only safety gates", () => {
  assert.deepEqual(validateMattermostE2EEnvironment({}), { enabled: false });
  assert.throws(
    () =>
      validateMattermostE2EEnvironment({
        MATTERMOST_E2E: "true",
        MATTERMOST_E2E_DATABASE_URL: "mysql://user:pass@127.0.0.1/crm",
        MATTERMOST_E2E_COMPOSE_DIR: "C:/mattermost",
        MATTERMOST_E2E_INTERNAL_URL: "http://192.168.1.222:8066",
        MATTERMOST_E2E_PUBLIC_URL: "http://192.168.1.222:8065",
      }),
    /mattermost_e2e/,
  );
});

test(
  "Mattermost full-history and bidirectional fixture acceptance",
  { skip: process.env.MATTERMOST_E2E !== "true" },
  async () => {
    const environment = validateMattermostE2EEnvironment(process.env);
    assert.equal(environment.enabled, true);

    // The fixture runner is intentionally supplied by the operator together
    // with the isolated Compose override. Keeping it outside the production
    // tree prevents this test from acquiring production reset semantics.
    const runner = process.env.MATTERMOST_E2E_RUNNER?.trim();
    assert.ok(runner, "MATTERMOST_E2E_RUNNER is required for destructive E2E");
    const { spawn } = await import("node:child_process");
    const result = await new Promise<number>((done, reject) => {
      const child = spawn(runner, [], {
        cwd: environment.composeDirectory,
        env: {
          ...process.env,
          DATABASE_URL: environment.databaseUrl,
          MATTERMOST_INTERNAL_URL: environment.internalUrl,
          MATTERMOST_PUBLIC_URL: environment.publicUrl,
        },
        shell: false,
        stdio: "inherit",
        windowsHide: true,
      });
      child.once("error", reject);
      child.once("exit", (code) => done(code ?? 1));
    });
    assert.equal(
      result,
      0,
      "fixture runner must verify users (including unverified activation), workspace and General/group/private-pair channels, full history authors/timestamps, same-password login, both message directions, replay idempotency, membership removal, and callback-queue recovery",
    );
  },
);
