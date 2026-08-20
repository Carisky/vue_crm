import assert from "node:assert/strict";
import test from "node:test";

import { canChangeWorkspaceMemberRole } from "../server/lib/member-role-policy.ts";

test("allows an administrator to promote another regular member", () => {
  assert.equal(
    canChangeWorkspaceMemberRole({
      actorUserId: "admin",
      actorRole: "ADMIN",
      targetUserId: "member",
      targetRole: "MEMBER",
      nextRole: "ADMIN",
      ownerId: "owner",
    }),
    true,
  );
});

test("allows a non-owner administrator to demote themselves", () => {
  assert.equal(
    canChangeWorkspaceMemberRole({
      actorUserId: "admin",
      actorRole: "ADMIN",
      targetUserId: "admin",
      targetRole: "ADMIN",
      nextRole: "MEMBER",
      ownerId: "owner",
    }),
    true,
  );
});

test("does not allow a non-owner administrator to demote another administrator", () => {
  assert.equal(
    canChangeWorkspaceMemberRole({
      actorUserId: "admin-1",
      actorRole: "ADMIN",
      targetUserId: "admin-2",
      targetRole: "ADMIN",
      nextRole: "MEMBER",
      ownerId: "owner",
    }),
    false,
  );
});

test("allows the owner to change another member's role", () => {
  assert.equal(
    canChangeWorkspaceMemberRole({
      actorUserId: "owner",
      actorRole: "MEMBER",
      targetUserId: "admin",
      targetRole: "ADMIN",
      nextRole: "MEMBER",
      ownerId: "owner",
    }),
    true,
  );
});

test("does not allow changing the owner's role", () => {
  assert.equal(
    canChangeWorkspaceMemberRole({
      actorUserId: "admin",
      actorRole: "ADMIN",
      targetUserId: "owner",
      targetRole: "ADMIN",
      nextRole: "MEMBER",
      ownerId: "owner",
    }),
    false,
  );
});

test("does not allow a regular member to change another role", () => {
  assert.equal(
    canChangeWorkspaceMemberRole({
      actorUserId: "member-1",
      actorRole: "MEMBER",
      targetUserId: "member-2",
      targetRole: "MEMBER",
      nextRole: "ADMIN",
      ownerId: "owner",
    }),
    false,
  );
});

test("rejects no-op role changes", () => {
  assert.equal(
    canChangeWorkspaceMemberRole({
      actorUserId: "owner",
      actorRole: "ADMIN",
      targetUserId: "member",
      targetRole: "MEMBER",
      nextRole: "MEMBER",
      ownerId: "owner",
    }),
    false,
  );
});
