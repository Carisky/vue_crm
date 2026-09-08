import assert from "node:assert/strict";
import test from "node:test";

import { ProjectAccessSchema } from "../lib/schema/projectAccess.ts";

test("accepts public and private project access settings", () => {
  assert.deepEqual(ProjectAccessSchema.parse({ visibility: "PUBLIC" }), {
    visibility: "PUBLIC",
    user_ids: [],
  });
  assert.equal(ProjectAccessSchema.safeParse({
    visibility: "PRIVATE",
    user_ids: ["member-1"],
  }).success, true);
});

test("rejects unknown visibility and empty member ids", () => {
  assert.equal(ProjectAccessSchema.safeParse({ visibility: "SECRET" }).success, false);
  assert.equal(ProjectAccessSchema.safeParse({
    visibility: "PRIVATE",
    user_ids: [""],
  }).success, false);
});
