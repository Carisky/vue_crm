import assert from "node:assert/strict";
import test from "node:test";
import { inspectLegacyMedia } from "../server/lib/storage/legacy-migration.ts";

test("dry-run inventories referenced legacy media without mutating rows", async () => {
  const report = await inspectLegacyMedia({ rows: [
    { id: "media-1", path: "/uploads/tasks/media/report.pdf", storageKey: null },
    { id: "media-2", path: null, storageKey: null },
  ] });
  assert.deepEqual(report, { referenced: 1, alreadyMigrated: 0, missingPath: 1, invalidPath: 0 });
});
