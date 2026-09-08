import assert from "node:assert/strict";
import test from "node:test";

import { getVisibleProjectIdsForUser } from "../server/lib/project-access.ts";

test("loads only projects visible to a workspace member", async () => {
  const visible = await getVisibleProjectIdsForUser(
    {
      member: {
        findUnique: async () => ({ userId: "member", role: "MEMBER" }),
        findMany: async () => [],
      },
      project: {
        findMany: async () => [
          { id: "public", parentId: null, visibility: "PUBLIC", creatorId: "owner" },
          { id: "private", parentId: "public", visibility: "PRIVATE", creatorId: "owner" },
        ],
      },
      projectAccess: {
        findMany: async () => [{ projectId: "private", userId: "member" }],
      },
    },
    { workspaceId: "workspace", userId: "member" },
  );

  assert.deepEqual([...visible], ["public", "private"]);
});

test("returns no projects for a nonmember", async () => {
  const visible = await getVisibleProjectIdsForUser(
    {
      member: {
        findUnique: async () => null,
        findMany: async () => [],
      },
      project: { findMany: async () => [] },
      projectAccess: { findMany: async () => [] },
    },
    { workspaceId: "workspace", userId: "outsider" },
  );

  assert.deepEqual([...visible], []);
});
