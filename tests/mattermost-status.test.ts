import assert from "node:assert/strict";
import test from "node:test";
import { getMattermostStatus } from "../server/lib/mattermost/status.ts";

test("reports operational state without secrets, URLs, bodies, or raw errors", async () => {
  const status = await getMattermostStatus(
    { enabled: true, configured: true },
    {
      load: async () => ({
        paused: true,
        pauseReason: "bootstrap-failed\nsecret detail",
        lastBootstrapState: "FAILED",
        lastReconciledAt: new Date("2026-09-04T10:00:00Z"),
        links: { users: 3, workspaces: 1, conversations: 2, messages: 8 },
        outbox: { PENDING: 2, PROCESSING: 0, COMPLETED: 7, FAILED: 1 },
        oldestPendingAt: new Date("2026-09-04T09:00:00Z"),
      }),
    },
    {
      ping: async () => ({ status: "OK", token: "must-not-leak" }),
      pluginHealth: async () => ({
        id: "com.tsl-silesia.crm-sync",
        version: "0.1.0",
        secret: "must-not-leak",
      }),
    },
  );

  assert.deepEqual(status, {
    enabled: true,
    configured: true,
    paused: true,
    pauseReason: "bootstrap-failed",
    lastBootstrapState: "FAILED",
    mattermost: { healthy: true },
    plugin: { healthy: true, version: "0.1.0" },
    links: { users: 3, workspaces: 1, conversations: 2, messages: 8 },
    outbox: { PENDING: 2, PROCESSING: 0, COMPLETED: 7, FAILED: 1 },
    oldestPendingAt: "2026-09-04T09:00:00.000Z",
    failedCount: 1,
    lastReconciledAt: "2026-09-04T10:00:00.000Z",
  });
  const serialized = JSON.stringify(status);
  assert.equal(serialized.includes("must-not-leak"), false);
  assert.equal(serialized.includes("http"), false);
});

test("health failures are reduced to booleans", async () => {
  const status = await getMattermostStatus(
    { enabled: false, configured: false },
    {
      load: async () => ({
        paused: false,
        pauseReason: null,
        lastBootstrapState: null,
        lastReconciledAt: null,
        links: { users: 0, workspaces: 0, conversations: 0, messages: 0 },
        outbox: { PENDING: 0, PROCESSING: 0, COMPLETED: 0, FAILED: 0 },
        oldestPendingAt: null,
      }),
    },
    {
      ping: async () => {
        throw new Error("token secret");
      },
      pluginHealth: async () => {
        throw new Error("url secret");
      },
    },
  );
  assert.deepEqual(status.mattermost, { healthy: false });
  assert.deepEqual(status.plugin, { healthy: false, version: null });
});
