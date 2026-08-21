import assert from "node:assert/strict";
import test from "node:test";

import {
  deleteTaskMediaObjects,
  deleteTaskMediaById,
  MediaDeleteForbiddenError,
} from "../server/lib/task-media-delete.ts";

const row = {
  id: "media-1",
  taskId: "task-1",
  workspaceId: "workspace-1",
  uploadedById: "user-1",
  storageKey: "task-media/one",
  variants: [{ storageKey: "task-media-variant/one" }],
};

function dependencies(member = true) {
  const removed: string[] = [];
  let deleted = false;
  return {
    deleted: () => deleted,
    removed,
    deps: {
      media: {
        findById: async () => row,
        deleteById: async () => { deleted = true; },
      },
      membership: { exists: async () => member },
      storage: { remove: async (key: string) => { removed.push(key); return true; } },
    },
  };
}

test("removes attached metadata and every private object for a member", async () => {
  const state = dependencies();
  assert.deepEqual(
    await deleteTaskMediaById({ mediaId: "media-1", userId: "user-2" }, state.deps),
    { taskId: "task-1", workspaceId: "workspace-1" },
  );
  assert.deepEqual(state.removed, ["task-media/one", "task-media-variant/one"]);
  assert.equal(state.deleted(), true);
});

test("rejects a nonmember before deleting a private object", async () => {
  const state = dependencies(false);
  await assert.rejects(
    deleteTaskMediaById({ mediaId: "media-1", userId: "user-2" }, state.deps),
    MediaDeleteForbiddenError,
  );
  assert.deepEqual(state.removed, []);
  assert.equal(state.deleted(), false);
});

test("removes all task media objects before task metadata is deleted", async () => {
  const state = dependencies();
  await deleteTaskMediaObjects([row], state.deps.storage);
  assert.deepEqual(state.removed, ["task-media/one", "task-media-variant/one"]);
});
