import assert from "node:assert/strict";
import test from "node:test";

import { chooseWorkspaceId, rememberWorkspace } from "../lib/last-workspace.ts";

test("uses the remembered workspace when it is still available", () => {
  assert.equal(chooseWorkspaceId(["one", "two"], "two"), "two");
  assert.equal(chooseWorkspaceId(["one", "two"], "missing"), "one");
  assert.equal(chooseWorkspaceId([], "two"), null);
});

test("stores workspace choices independently for each user", () => {
  const first = rememberWorkspace(undefined, "user-1", "workspace-1");
  const second = rememberWorkspace(first, "user-2", "workspace-2");
  assert.deepEqual(second, {
    "user-1": "workspace-1",
    "user-2": "workspace-2",
  });
});
