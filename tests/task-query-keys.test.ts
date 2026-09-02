import assert from "node:assert/strict";
import test from "node:test";

import { QueryClient } from "@tanstack/vue-query";

test("keeps task detail and editor responses in separate cache entries", async () => {
  const keys = await import("../lib/task-query-keys.ts").catch(() => null);
  assert.ok(keys, "task query keys must be defined");

  const client = new QueryClient();
  const detail = { task: { $id: "task-1" }, subtasks: [] };
  const editor = { $id: "task-1", media: [] };

  client.setQueryData(keys.taskDetailQueryKey("task-1"), detail);
  client.setQueryData(keys.taskEditorQueryKey("task-1"), editor);

  assert.deepEqual(
    client.getQueryData(keys.taskDetailQueryKey("task-1")),
    detail,
  );
  assert.deepEqual(
    client.getQueryData(keys.taskEditorQueryKey("task-1")),
    editor,
  );
});

test("keeps project and member option caches isolated by workspace", async () => {
  const keys = await import("../lib/task-query-keys.ts").catch(() => null);
  assert.ok(keys, "task query keys must be defined");

  const client = new QueryClient();
  client.setQueryData(keys.taskProjectOptionsQueryKey("workspace-1"), ["p1"]);
  client.setQueryData(keys.taskProjectOptionsQueryKey("workspace-2"), ["p2"]);
  client.setQueryData(keys.taskMemberOptionsQueryKey("workspace-1"), ["m1"]);
  client.setQueryData(keys.taskMemberOptionsQueryKey("workspace-2"), ["m2"]);

  assert.deepEqual(
    client.getQueryData(keys.taskProjectOptionsQueryKey("workspace-1")),
    ["p1"],
  );
  assert.deepEqual(
    client.getQueryData(keys.taskProjectOptionsQueryKey("workspace-2")),
    ["p2"],
  );
  assert.deepEqual(
    client.getQueryData(keys.taskMemberOptionsQueryKey("workspace-1")),
    ["m1"],
  );
  assert.deepEqual(
    client.getQueryData(keys.taskMemberOptionsQueryKey("workspace-2")),
    ["m2"],
  );
});

test("invalidates both task detail and editor caches after a task mutation", async () => {
  const keys = await import("../lib/task-query-keys.ts");
  assert.equal(typeof keys.invalidateTaskQueries, "function");
  const client = new QueryClient();
  client.setQueryData(keys.taskDetailQueryKey("task-1"), { task: {} });
  client.setQueryData(keys.taskEditorQueryKey("task-1"), { media: [] });

  await keys.invalidateTaskQueries(client, "task-1");

  assert.equal(
    client.getQueryState(keys.taskDetailQueryKey("task-1"))?.isInvalidated,
    true,
  );
  assert.equal(
    client.getQueryState(keys.taskEditorQueryKey("task-1"))?.isInvalidated,
    true,
  );
});
