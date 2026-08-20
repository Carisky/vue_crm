import assert from "node:assert/strict";
import test from "node:test";

import { canRemoveWorkspaceMember } from "../server/lib/member-removal-policy.ts";

test("allows an administrator to remove a regular member", () => {
  assert.equal(
    canRemoveWorkspaceMember({
      actorUserId: "admin",
      actorRole: "ADMIN",
      targetUserId: "member",
      targetRole: "MEMBER",
      ownerId: "owner",
    }),
    true,
  );
});

test("does not allow a non-owner administrator to remove another administrator", () => {
  assert.equal(
    canRemoveWorkspaceMember({
      actorUserId: "admin-1",
      actorRole: "ADMIN",
      targetUserId: "admin-2",
      targetRole: "ADMIN",
      ownerId: "owner",
    }),
    false,
  );
});

test("allows the workspace owner to remove another administrator", () => {
  assert.equal(
    canRemoveWorkspaceMember({
      actorUserId: "owner",
      actorRole: "ADMIN",
      targetUserId: "admin",
      targetRole: "ADMIN",
      ownerId: "owner",
    }),
    true,
  );
});

test("allows a member to remove only their own membership", () => {
  const base = {
    actorUserId: "member-1",
    actorRole: "MEMBER" as const,
    targetRole: "MEMBER" as const,
    ownerId: "owner",
  };

  assert.equal(
    canRemoveWorkspaceMember({ ...base, targetUserId: "member-1" }),
    true,
  );
  assert.equal(
    canRemoveWorkspaceMember({ ...base, targetUserId: "member-2" }),
    false,
  );
});
