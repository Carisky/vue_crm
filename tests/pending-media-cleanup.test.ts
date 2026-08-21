import assert from "node:assert/strict";
import test from "node:test";
import { removeExpiredPendingMedia } from "../server/lib/pending-media-cleanup.ts";

test("removes only expired pending media in a bounded batch", async () => {
  const removed: string[] = [];
  const deleted: string[] = [];
  const result = await removeExpiredPendingMedia({ now: new Date("2026-01-02T00:00:00Z"), batchSize: 2 }, {
    media: { findExpiredPending: async () => [{ id: "old", storageKey: "task-media/old" }], deleteById: async (id: string) => { deleted.push(id); } },
    storage: { remove: async (key: string) => { removed.push(key); return true; } },
  });
  assert.deepEqual(result, { removed: 1, failed: 0 });
  assert.deepEqual(removed, ["task-media/old"]);
  assert.deepEqual(deleted, ["old"]);
});
