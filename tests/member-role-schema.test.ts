import assert from "node:assert/strict";
import test from "node:test";

import { UpdateMemberRoleSchema } from "../lib/schema/updateRole.ts";

test("accepts an explicit membership and destination role", () => {
  assert.deepEqual(
    UpdateMemberRoleSchema.parse({
      membershipId: "membership-1",
      role: "ADMIN",
    }),
    {
      membershipId: "membership-1",
      role: "ADMIN",
    },
  );
});

test("rejects a role-toggle request without a destination role", () => {
  assert.equal(
    UpdateMemberRoleSchema.safeParse({ membershipId: "membership-1" })
      .success,
    false,
  );
});

test("rejects unknown workspace roles", () => {
  assert.equal(
    UpdateMemberRoleSchema.safeParse({
      membershipId: "membership-1",
      role: "OWNER",
    }).success,
    false,
  );
});
