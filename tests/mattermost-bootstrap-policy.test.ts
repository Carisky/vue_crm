import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  assertCrmReachable,
  runBootstrapWorkflow,
  validateBootstrapEnvironment,
  validateComposeProject,
  validateVolumeInspections,
  writeRuntimeEnvironment,
} from "../server/lib/mattermost/bootstrap-policy.ts";

const env = {
  MATTERMOST_COMPOSE_DIR: "/srv/mattermost",
  MATTERMOST_IMPORT_DIR: "/srv/mattermost/imports",
  MATTERMOST_RUNTIME_ENV_FILE: "/srv/crm/.mattermost.runtime.env",
  MATTERMOST_PLUGIN_SECRET: "plugin-secret",
  MATTERMOST_CALLBACK_URL:
    "http://host.docker.internal:3000/api/integrations/mattermost/events",
  MATTERMOST_CALLBACK_HEALTH_URL:
    "http://127.0.0.1:3000/api/integrations/mattermost/events",
  MATTERMOST_INTERNAL_URL: "http://127.0.0.1:8066",
};

test("requires resolved paths and every bootstrap secret setting", () => {
  assert.throws(
    () =>
      validateBootstrapEnvironment({ ...env, MATTERMOST_PLUGIN_SECRET: "" }),
    /MATTERMOST_PLUGIN_SECRET/,
  );
  assert.throws(
    () =>
      validateBootstrapEnvironment({
        ...env,
        MATTERMOST_COMPOSE_DIR: "relative",
      }),
    /absolute/,
  );
});

test("refuses an unreachable CRM callback", async () => {
  await assert.rejects(
    assertCrmReachable(env.MATTERMOST_CALLBACK_HEALTH_URL, async () => {
      throw new Error("offline");
    }),
    /unreachable/,
  );
});

test("accepts only the mattermost project and its exact volume set", () => {
  const expected = ["mattermost_data", "mattermost_postgres_data"];
  assert.throws(
    () => validateComposeProject({ name: "other", volumes: {} }),
    /project name/,
  );
  assert.throws(
    () =>
      validateVolumeInspections(expected, [
        {
          Name: "mattermost_data",
          Labels: { "com.docker.compose.project": "other" },
        },
      ]),
    /project label/,
  );
  assert.throws(
    () =>
      validateVolumeInspections(expected, [
        {
          Name: "mattermost_unexpected",
          Labels: { "com.docker.compose.project": "mattermost" },
        },
      ]),
    /unexpected volume/,
  );
  assert.deepEqual(
    validateVolumeInspections(expected, [
      {
        Name: "mattermost_data",
        Labels: { "com.docker.compose.project": "mattermost" },
      },
      {
        Name: "mattermost_postgres_data",
        Labels: { "com.docker.compose.project": "mattermost" },
      },
    ]),
    expected,
  );
  assert.deepEqual(validateVolumeInspections(expected, []), []);
});

test("dry run performs preflight only", async () => {
  const calls: string[] = [];
  await runBootstrapWorkflow(false, {
    preflight: async () => calls.push("preflight"),
    pause: async () => calls.push("pause"),
    reset: async () => calls.push("reset"),
    start: async () => calls.push("start"),
    provision: async () => calls.push("provision"),
    installPlugin: async () => calls.push("plugin"),
    importSnapshot: async () => calls.push("import"),
    resolveAndReconcile: async () => calls.push("resolve"),
    recordSuccess: async () => calls.push("success"),
    recordFailure: async () => calls.push("failure"),
    resume: async () => calls.push("resume"),
  });
  assert.deepEqual(calls, ["preflight"]);
});

test("confirmed failure pauses before reset and never resumes", async () => {
  const calls: string[] = [];
  await assert.rejects(
    runBootstrapWorkflow(true, {
      preflight: async () => calls.push("preflight"),
      pause: async () => calls.push("pause"),
      reset: async () => {
        calls.push("reset");
        throw new Error("reset failed");
      },
      start: async () => calls.push("start"),
      provision: async () => calls.push("provision"),
      installPlugin: async () => calls.push("plugin"),
      importSnapshot: async () => calls.push("import"),
      resolveAndReconcile: async () => calls.push("resolve"),
      recordSuccess: async () => calls.push("success"),
      recordFailure: async () => calls.push("failure"),
      resume: async () => calls.push("resume"),
    }),
    /reset failed/,
  );
  assert.deepEqual(calls, ["preflight", "pause", "reset", "failure"]);
});

test("confirmed success resumes only after every phase", async () => {
  const calls: string[] = [];
  const phase = (name: string) => async () => {
    calls.push(name);
  };
  await runBootstrapWorkflow(true, {
    preflight: phase("preflight"),
    pause: phase("pause"),
    reset: phase("reset"),
    start: phase("start"),
    provision: phase("provision"),
    installPlugin: phase("plugin"),
    importSnapshot: phase("import"),
    resolveAndReconcile: phase("resolve"),
    recordSuccess: phase("success"),
    recordFailure: phase("failure"),
    resume: phase("resume"),
  });
  assert.deepEqual(calls, [
    "preflight",
    "pause",
    "reset",
    "start",
    "provision",
    "plugin",
    "import",
    "resolve",
    "success",
    "resume",
  ]);
});

test("runtime secrets are atomically replaced with owner-only permissions", async () => {
  const root = await mkdtemp(join(tmpdir(), "mattermost-runtime-"));
  const target = join(root, "runtime.env");
  try {
    await writeRuntimeEnvironment(target, {
      adminToken: "admin-token-value",
      bootstrapPassword: "bootstrap-password-value",
    });
    const contents = await readFile(target, "utf8");
    assert.match(contents, /^MATTERMOST_ADMIN_TOKEN=admin-token-value$/m);
    assert.match(
      contents,
      /^MATTERMOST_BOOTSTRAP_PASSWORD=bootstrap-password-value$/m,
    );
    if (process.platform !== "win32") {
      assert.equal((await stat(target)).mode & 0o777, 0o600);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
