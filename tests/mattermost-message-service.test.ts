import assert from "node:assert/strict";
import test from "node:test";
import { createLocalConversationMessage } from "../server/lib/mattermost/message-service.ts";

test("local message and Mattermost event commit in one ordered transaction", async () => {
  const log: string[] = [];
  const result = await createLocalConversationMessage(
    {
      conversationId: "conversation-1",
      senderId: "user-1",
      body: "hello",
      createdAt: new Date("2026-09-04T12:00:00.000Z"),
    },
    {
      transaction: async (callback) => {
        const value = await callback({});
        log.push("transaction.commit");
        return value;
      },
      authorize: async () => ({ workspaceId: "workspace-1" }),
      createMessage: async () => {
        log.push("message.create");
        return { id: "message-1", body: "hello" };
      },
      markRead: async () => {
        log.push("participant.mark-read");
      },
      touchConversation: async () => {
        log.push("conversation.touch");
      },
      enqueue: async (_transaction, input) => {
        log.push(`outbox:${input.kind}`);
        assert.equal(input.idempotencyKey, "message.create:message-1");
        assert.deepEqual(input.payload, { message_id: "message-1" });
      },
    },
  );

  assert.deepEqual(log, [
    "message.create",
    "participant.mark-read",
    "conversation.touch",
    "outbox:message.create",
    "transaction.commit",
  ]);
  assert.equal(result.message.id, "message-1");
  assert.equal(result.workspaceId, "workspace-1");
});

test("authorization failure writes nothing", async () => {
  let writes = 0;
  await assert.rejects(
    createLocalConversationMessage(
      { conversationId: "conversation-1", senderId: "revoked", body: "no" },
      {
        transaction: async (callback) => callback({}),
        authorize: async () => null,
        createMessage: async () => {
          writes += 1;
          return { id: "must-not-exist" };
        },
        markRead: async () => {
          writes += 1;
        },
        touchConversation: async () => {
          writes += 1;
        },
        enqueue: async () => {
          writes += 1;
        },
      },
    ),
    /Conversation not found/,
  );
  assert.equal(writes, 0);
});

test("createdAt defaults once and is shared by all writes", async () => {
  const dates: Date[] = [];
  await createLocalConversationMessage(
    { conversationId: "conversation-1", senderId: "user-1", body: "hello" },
    {
      transaction: async (callback) => callback({}),
      authorize: async () => ({ workspaceId: "workspace-1" }),
      createMessage: async (_transaction, input) => {
        dates.push(input.createdAt);
        return { id: "message-1" };
      },
      markRead: async (_transaction, input) => {
        dates.push(input.createdAt);
      },
      touchConversation: async (_transaction, input) => {
        dates.push(input.createdAt);
      },
      enqueue: async () => {},
    },
  );
  assert.equal(dates.length, 3);
  assert.equal(new Set(dates.map((date) => date.getTime())).size, 1);
});
