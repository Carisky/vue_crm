import assert from "node:assert/strict";
import test from "node:test";

import {
  CreateWorkspaceGroupSchema,
  UpdateWorkspaceGroupSchema,
} from "../lib/schema/workspaceGroup.ts";

test("accepts a workspace group made from member ids", () => {
  const result = CreateWorkspaceGroupSchema.safeParse({
    name: "Dispatch",
    description: "Dispatch team",
    color: "#2563eb",
    member_ids: ["user-1", "user-2"],
  });

  assert.equal(result.success, true);
});

test("rejects invalid group colors and empty updates", () => {
  assert.equal(
    CreateWorkspaceGroupSchema.safeParse({
      name: "Dispatch",
      color: "blue",
      member_ids: [],
    }).success,
    false,
  );
  assert.equal(UpdateWorkspaceGroupSchema.safeParse({}).success, false);
});
