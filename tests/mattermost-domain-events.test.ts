import assert from "node:assert/strict";
import test from "node:test";
import {
  conversationKey,
  enqueueConversationDelete,
  enqueueMembershipDelete,
  enqueueWorkspaceDelete,
  membershipKey,
  workspaceUpsertKey,
} from "../server/lib/mattermost/domain-events.ts";

function transactionRecorder() {
  const writes: Array<Record<string, unknown>> = [];
  return {
    writes,
    transaction: {
      mattermostOutboxEvent: {
        updateMany: async () => ({ count: 0 }),
        upsert: async (input: Record<string, unknown>) => {
          writes.push(input);
          return input;
        },
      },
    },
  };
}

test("domain event keys are stable", () => {
  assert.equal(
    workspaceUpsertKey("ws-1", 3),
    "workspace.upsert:ws-1:3",
  );
  assert.equal(
    membershipKey("ws-1", "user-1", "upsert"),
    "membership.upsert:ws-1:user-1",
  );
  assert.equal(
    conversationKey("conv-1", "upsert"),
    "conversation.upsert:conv-1",
  );
});

test("deletion events retain remote identifiers before domain cascade", async () => {
  const { transaction, writes } = transactionRecorder();
  await enqueueWorkspaceDelete(transaction, {
    workspaceId: "workspace-1",
    mattermostTeamId: "team-1",
  });
  await enqueueMembershipDelete(transaction, {
    workspaceId: "workspace-1",
    userId: "user-1",
    mattermostTeamId: "team-1",
    mattermostUserId: "remote-user-1",
  });
  await enqueueConversationDelete(transaction, {
    conversationId: "conversation-1",
    mattermostChannelId: "channel-1",
  });

  assert.deepEqual(
    writes.map((write) => (write.create as { payload: unknown }).payload),
    [
      { workspace_id: "workspace-1", mattermost_team_id: "team-1" },
      {
        workspace_id: "workspace-1",
        user_id: "user-1",
        mattermost_team_id: "team-1",
        mattermost_user_id: "remote-user-1",
      },
      {
        conversation_id: "conversation-1",
        mattermost_channel_id: "channel-1",
      },
    ],
  );
});

test("a completed mutable event is rearmed without creating a second row", async () => {
  const log: unknown[] = [];
  const transaction = {
    mattermostOutboxEvent: {
      updateMany: async (input: unknown) => {
        log.push(["rearm", input]);
        return { count: 1 };
      },
      upsert: async (input: unknown) => {
        log.push(["upsert", input]);
        return input;
      },
    },
  };

  await enqueueMembershipDelete(transaction, {
    workspaceId: "workspace-1",
    userId: "user-1",
    mattermostTeamId: "team-1",
    mattermostUserId: "remote-user-1",
  });

  assert.equal(log.length, 2);
  assert.deepEqual(
    (log[0] as [{}, { where: { state: { in: string[] } } }])[1].where.state.in,
    ["COMPLETED", "FAILED"],
  );
});
