import assert from "node:assert/strict";
import test from "node:test";
import type { PluginPostEvent } from "../server/lib/mattermost/contracts.ts";
import {
  ingestMattermostPost,
  MattermostInboundError,
  type MattermostInboundDependencies,
} from "../server/lib/mattermost/inbound.ts";

const incoming: PluginPostEvent = {
  event_id: "event-1",
  post_id: "post-1",
  channel_id: "channel-1",
  user_id: "remote-user-1",
  message: "hello from Mattermost",
  create_at: 1_788_523_200_000,
};

function dependencies(options: {
  duplicateEvent?: boolean;
  duplicatePost?: boolean;
  channel?: boolean;
  user?: boolean;
  participant?: boolean;
} = {}) {
  const log: unknown[] = [];
  const deps: MattermostInboundDependencies<object, { id: string }> = {
    transaction: async (callback) => {
      const result = await callback({});
      log.push("transaction.commit");
      return result;
    },
    claimEvent: async () => {
      log.push("event.claim");
      if (options.duplicateEvent) throw Object.assign(new Error("duplicate"), { code: "P2002" });
    },
    resolveConversation: async () =>
      options.channel === false
        ? null
        : { conversationId: "conversation-1", workspaceId: "workspace-1" },
    resolveUser: async () =>
      options.user === false ? null : { userId: "user-1" },
    isParticipant: async () => options.participant !== false,
    createMessage: async (_transaction, input) => {
      log.push(["message.create", input]);
      return { id: "message-1" };
    },
    linkPost: async () => {
      log.push("post.link");
      if (options.duplicatePost) throw Object.assign(new Error("duplicate"), { code: "P2002" });
    },
    touchConversation: async () => {
      log.push("conversation.touch");
    },
    finishEvent: async () => {
      log.push("event.finish");
    },
    isUniqueViolation: (error) =>
      typeof error === "object" && error !== null && "code" in error && error.code === "P2002",
    broadcast: (input) => {
      log.push(["broadcast", input]);
    },
  };
  return { deps, log };
}

test("mapped participant post is created with original time and broadcasts after commit", async () => {
  const { deps, log } = dependencies();
  const result = await ingestMattermostPost(incoming, deps);

  assert.deepEqual(result, { duplicate: false, messageId: "message-1" });
  const create = log.find(
    (entry) => Array.isArray(entry) && entry[0] === "message.create",
  ) as [string, { createdAt: Date; body: string }];
  assert.equal(create[1].createdAt.getTime(), incoming.create_at);
  assert.equal(create[1].body, incoming.message);
  assert.ok(log.indexOf("transaction.commit") < log.findIndex(
    (entry) => Array.isArray(entry) && entry[0] === "broadcast",
  ));
});

test("duplicate event and duplicate post acknowledge without broadcasting", async () => {
  for (const options of [{ duplicateEvent: true }, { duplicatePost: true }]) {
    const { deps, log } = dependencies(options);
    assert.deepEqual(await ingestMattermostPost(incoming, deps), { duplicate: true });
    assert.equal(
      log.some((entry) => Array.isArray(entry) && entry[0] === "broadcast"),
      false,
    );
  }
});

test("unknown channel, unknown user, and revoked participant are rejected", async () => {
  const cases = [
    [{ channel: false }, "channel"],
    [{ user: false }, "user"],
    [{ participant: false }, "participant"],
  ] as const;
  for (const [options, message] of cases) {
    const { deps, log } = dependencies(options);
    await assert.rejects(
      ingestMattermostPost(incoming, deps),
      (error: unknown) =>
        error instanceof MattermostInboundError &&
        error.status === 422 &&
        error.message.includes(message),
    );
    assert.equal(log.some((entry) => Array.isArray(entry) && entry[0] === "broadcast"), false);
  }
});
