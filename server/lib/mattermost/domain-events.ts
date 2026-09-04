import type { MattermostEventKind } from "./contracts.ts";

export type MattermostEventTransaction = {
  mattermostOutboxEvent: {
    updateMany(input: unknown): Promise<{ count: number }>;
    upsert(input: unknown): Promise<unknown>;
  };
};

type Mutation = "upsert" | "delete";

export function workspaceUpsertKey(
  workspaceId: string,
  revision: string | number | Date,
) {
  const value = revision instanceof Date ? revision.getTime() : revision;
  return `workspace.upsert:${workspaceId}:${value}`;
}

export function membershipKey(
  workspaceId: string,
  userId: string,
  mutation: Mutation,
) {
  return `membership.${mutation}:${workspaceId}:${userId}`;
}

export function conversationKey(conversationId: string, mutation: Mutation) {
  return `conversation.${mutation}:${conversationId}`;
}

function userStateKey(userId: string, active: boolean) {
  return `user.${active ? "activate" : "deactivate"}:${userId}`;
}

async function enqueueMutable(
  transaction: MattermostEventTransaction,
  input: {
    kind: MattermostEventKind;
    aggregateType: string;
    aggregateId: string;
    idempotencyKey: string;
    payload: Record<string, string>;
  },
) {
  const now = new Date();
  await transaction.mattermostOutboxEvent.updateMany({
    where: {
      idempotencyKey: input.idempotencyKey,
      state: { in: ["COMPLETED", "FAILED"] },
    },
    data: {
      payload: input.payload,
      state: "PENDING",
      attempts: 0,
      nextAttemptAt: now,
      lockedAt: null,
      lastError: null,
      completedAt: null,
    },
  });
  return transaction.mattermostOutboxEvent.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: { ...input, nextAttemptAt: now },
    update: {},
  });
}

export function enqueueWorkspaceUpsert(
  transaction: MattermostEventTransaction,
  input: { workspaceId: string; revision: string | number | Date },
) {
  return enqueueMutable(transaction, {
    kind: "workspace.upsert",
    aggregateType: "workspace",
    aggregateId: input.workspaceId,
    idempotencyKey: workspaceUpsertKey(input.workspaceId, input.revision),
    payload: { workspace_id: input.workspaceId },
  });
}

export function enqueueWorkspaceDelete(
  transaction: MattermostEventTransaction,
  input: { workspaceId: string; mattermostTeamId: string },
) {
  return enqueueMutable(transaction, {
    kind: "workspace.delete",
    aggregateType: "workspace",
    aggregateId: input.workspaceId,
    idempotencyKey: `workspace.delete:${input.workspaceId}`,
    payload: {
      workspace_id: input.workspaceId,
      mattermost_team_id: input.mattermostTeamId,
    },
  });
}

export function enqueueMembershipUpsert(
  transaction: MattermostEventTransaction,
  input: { workspaceId: string; userId: string },
) {
  return enqueueMutable(transaction, {
    kind: "membership.upsert",
    aggregateType: "membership",
    aggregateId: `${input.workspaceId}:${input.userId}`,
    idempotencyKey: membershipKey(input.workspaceId, input.userId, "upsert"),
    payload: { workspace_id: input.workspaceId, user_id: input.userId },
  });
}

export function enqueueMembershipDelete(
  transaction: MattermostEventTransaction,
  input: {
    workspaceId: string;
    userId: string;
    mattermostTeamId: string;
    mattermostUserId: string;
  },
) {
  return enqueueMutable(transaction, {
    kind: "membership.delete",
    aggregateType: "membership",
    aggregateId: `${input.workspaceId}:${input.userId}`,
    idempotencyKey: membershipKey(input.workspaceId, input.userId, "delete"),
    payload: {
      workspace_id: input.workspaceId,
      user_id: input.userId,
      mattermost_team_id: input.mattermostTeamId,
      mattermost_user_id: input.mattermostUserId,
    },
  });
}

export function enqueueConversationUpsert(
  transaction: MattermostEventTransaction,
  input: { conversationId: string },
) {
  return enqueueMutable(transaction, {
    kind: "conversation.upsert",
    aggregateType: "conversation",
    aggregateId: input.conversationId,
    idempotencyKey: conversationKey(input.conversationId, "upsert"),
    payload: { conversation_id: input.conversationId },
  });
}

export function enqueueConversationDelete(
  transaction: MattermostEventTransaction,
  input: { conversationId: string; mattermostChannelId: string },
) {
  return enqueueMutable(transaction, {
    kind: "conversation.delete",
    aggregateType: "conversation",
    aggregateId: input.conversationId,
    idempotencyKey: conversationKey(input.conversationId, "delete"),
    payload: {
      conversation_id: input.conversationId,
      mattermost_channel_id: input.mattermostChannelId,
    },
  });
}

export function enqueueUserActivate(
  transaction: MattermostEventTransaction,
  input: { userId: string },
) {
  return enqueueMutable(transaction, {
    kind: "user.activate",
    aggregateType: "user",
    aggregateId: input.userId,
    idempotencyKey: userStateKey(input.userId, true),
    payload: { user_id: input.userId },
  });
}

export function enqueueUserDeactivate(
  transaction: MattermostEventTransaction,
  input: { userId: string; mattermostUserId: string },
) {
  return enqueueMutable(transaction, {
    kind: "user.deactivate",
    aggregateType: "user",
    aggregateId: input.userId,
    idempotencyKey: userStateKey(input.userId, false),
    payload: {
      user_id: input.userId,
      mattermost_user_id: input.mattermostUserId,
    },
  });
}
