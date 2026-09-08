import assert from "node:assert/strict";
import test from "node:test";

import {
  parseForceAdminEmails,
  planForceAdminMembershipChanges,
} from "../server/lib/force-admins.ts";

test("normalizes and deduplicates a JSON array of force-admin emails", () => {
  assert.deepEqual(
    parseForceAdminEmails(
      '[" Boss@Example.com ", "audit@example.com", "boss@example.com"]',
    ),
    ["boss@example.com", "audit@example.com"],
  );
});

test("rejects malformed force-admin configuration and non-email values", () => {
  for (const raw of ['"boss@example.com"', '["not-an-email"]', "not-json"]) {
    assert.throws(
      () => parseForceAdminEmails(raw),
      /FORCE_ADMINS must be a JSON array of email addresses/,
    );
  }
});

test("plans missing memberships and promotions for every forced user and workspace", () => {
  assert.deepEqual(
    planForceAdminMembershipChanges({
      forceAdminEmails: ["boss@example.com", "audit@example.com"],
      users: [
        { id: "boss", email: "boss@example.com" },
        { id: "audit", email: "audit@example.com" },
        { id: "regular", email: "regular@example.com" },
      ],
      workspaceIds: ["one", "two"],
      memberships: [
        { userId: "boss", workspaceId: "one", role: "ADMIN" },
        { userId: "boss", workspaceId: "two", role: "MEMBER" },
        { userId: "regular", workspaceId: "one", role: "MEMBER" },
      ],
    }),
    [
      { userId: "boss", workspaceId: "two", kind: "promote" },
      { userId: "audit", workspaceId: "one", kind: "create" },
      { userId: "audit", workspaceId: "two", kind: "create" },
    ],
  );
});

test("reconciliation persists admin roles, general-chat access, and sync events", async () => {
  process.env.DATABASE_URL ??= "mysql://test:test@127.0.0.1:3306/test";
  const { reconcileForceAdminMemberships } = await import(
    "../server/lib/force-admin-reconciliation.ts"
  );
  const memberships: Array<{
    userId: string;
    workspaceId: string;
    role: "ADMIN" | "MEMBER";
  }> = [{ userId: "boss", workspaceId: "workspace", role: "MEMBER" }];
  const participants: Array<{ conversationId: string; userId: string }> = [];
  const events: Array<{ kind: string; payload: Record<string, string> }> = [];
  const transaction = {
    user: {
      findMany: async () => [
        { id: "boss", email: "boss@example.com" },
        { id: "audit", email: "audit@example.com" },
      ],
    },
    workspace: { findMany: async () => [{ id: "workspace" }] },
    member: {
      findMany: async () => memberships,
      upsert: async (input: any) => {
        const key = input.where.workspaceId_userId;
        const existing = memberships.find(
          (membership) =>
            membership.userId === key.userId &&
            membership.workspaceId === key.workspaceId,
        );
        if (existing) existing.role = "ADMIN";
        else memberships.push({ ...input.create, role: "ADMIN" });
      },
    },
    conversation: {
      upsert: async () => ({ id: "general" }),
    },
    conversationParticipant: {
      createMany: async (input: any) => {
        participants.push(...input.data);
        return { count: input.data.length };
      },
    },
    mattermostOutboxEvent: {
      updateMany: async () => ({ count: 0 }),
      upsert: async (input: any) => {
        events.push(input.create);
        return input.create;
      },
    },
  };

  const changes = await reconcileForceAdminMemberships(transaction as never, {
    forceAdminEmails: ["boss@example.com", "audit@example.com"],
  });

  assert.deepEqual(changes, [
    { userId: "boss", workspaceId: "workspace", kind: "promote" },
    { userId: "audit", workspaceId: "workspace", kind: "create" },
  ]);
  assert.deepEqual(memberships, [
    { userId: "boss", workspaceId: "workspace", role: "ADMIN" },
    { userId: "audit", workspaceId: "workspace", role: "ADMIN" },
  ]);
  assert.deepEqual(
    participants.map(({ userId }) => userId),
    ["boss", "audit"],
  );
  assert.deepEqual(
    events.map(({ kind }) => kind),
    ["membership.upsert", "membership.upsert", "conversation.upsert"],
  );
});
