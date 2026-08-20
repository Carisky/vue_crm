import assert from "node:assert/strict";
import test from "node:test";

import { createWorkspaceMemberClient } from "../lib/workspace-member-client.ts";

test("sends an explicit destination role to the member update endpoint", async () => {
  const requests: Array<{ url: string; options: unknown }> = [];
  const client = createWorkspaceMemberClient(async (url, options) => {
    requests.push({ url, options });
    return { ok: true, role: "ADMIN" };
  });

  const response = await client.updateRole("membership-1", "ADMIN");

  assert.deepEqual(response, { ok: true, role: "ADMIN" });
  assert.deepEqual(requests, [
    {
      url: "/api/workspaces/update-member",
      options: {
        method: "PATCH",
        body: { membershipId: "membership-1", role: "ADMIN" },
      },
    },
  ]);
});

test("sends the membership id to the removal endpoint", async () => {
  const requests: Array<{ url: string; options: unknown }> = [];
  const client = createWorkspaceMemberClient(async (url, options) => {
    requests.push({ url, options });
    return { ok: true };
  });

  const response = await client.remove("membership-1");

  assert.deepEqual(response, { ok: true });
  assert.deepEqual(requests, [
    {
      url: "/api/workspaces/remove-member",
      options: {
        method: "DELETE",
        body: { membershipId: "membership-1" },
      },
    },
  ]);
});
