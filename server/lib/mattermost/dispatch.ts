import type { PrismaClient } from "@prisma/client";
import {
  MattermostClient,
  MattermostRequestError,
  type MattermostClientConfig,
} from "./client.ts";
import type { MattermostSyncResult } from "./contracts.ts";
import {
  mattermostChannelName,
  mattermostTeamName,
} from "./identifiers.ts";
import type { MattermostOutboxRecord } from "./outbox.ts";

type LinkedUser = { userId: string; mattermostUserId: string | null };
type WorkspaceState = {
  id: string;
  name: string;
  mattermostTeamId: string | null;
};
type MembershipState = {
  role: "MEMBER" | "ADMIN";
  user: LinkedUser;
  mattermostTeamId: string | null;
};
type ConversationState = {
  id: string;
  type: "WORKSPACE" | "GROUP" | "DIRECT";
  name: string | null;
  workspaceId: string;
  mattermostTeamId: string | null;
  mattermostChannelId: string | null;
  participants: LinkedUser[];
};
type MessageState = {
  id: string;
  body: string;
  mattermostChannelId: string | null;
  mattermostUserId: string | null;
};

export type MattermostDispatchStore = {
  loadWorkspace(workspaceId: string): Promise<WorkspaceState | null>;
  saveWorkspaceLink(input: {
    workspaceId: string;
    mattermostTeamId: string;
    teamName: string;
  }): Promise<void>;
  loadMembership(workspaceId: string, userId: string): Promise<MembershipState | null>;
  loadConversation(conversationId: string): Promise<ConversationState | null>;
  saveConversationLink(input: {
    conversationId: string;
    mattermostChannelId: string;
    channelName: string;
  }): Promise<void>;
  loadMessage(messageId: string): Promise<MessageState | null>;
  saveMessageLink(input: {
    messageId: string;
    mattermostPostId: string;
  }): Promise<void>;
  loadUserLink(userId: string): Promise<LinkedUser | null>;
};

export type MattermostDispatchDependencies = {
  client: MattermostClient;
  store: MattermostDispatchStore;
};

class MissingMattermostDependency extends Error {
  readonly retryable = true;
}

function payload(record: MattermostOutboxRecord) {
  return typeof record.payload === "object" && record.payload !== null
    ? (record.payload as Record<string, unknown>)
    : {};
}

function requiredPayload(record: MattermostOutboxRecord, key: string) {
  const value = payload(record)[key];
  if (typeof value !== "string" || !value) {
    throw new MissingMattermostDependency(`${record.kind} is missing ${key}`);
  }
  return value;
}

function requireRemoteId(value: string | null | undefined, description: string) {
  if (!value) throw new MissingMattermostDependency(`${description} is not linked yet`);
  return value;
}

async function getOrCreateTeam(
  client: MattermostClient,
  name: string,
  displayName: string,
) {
  let team = await client.getTeamByName(name);
  if (!team) {
    try {
      team = await client.createTeam({ name, display_name: displayName });
    } catch (error) {
      team = await client.getTeamByName(name);
      if (!team) throw error;
    }
  }
  if (team.display_name !== displayName) {
    team = await client.updateTeam(team.id, { display_name: displayName });
  }
  return team;
}

async function getOrCreateChannel(
  client: MattermostClient,
  input: {
    teamId: string;
    name: string;
    displayName: string;
    general: boolean;
  },
) {
  let channel = await client.getChannelByName(input.teamId, input.name);
  if (!channel && input.general) {
    throw new MissingMattermostDependency("Mattermost town-square is unavailable");
  }
  if (!channel) {
    try {
      channel = await client.createChannel({
        team_id: input.teamId,
        name: input.name,
        display_name: input.displayName,
        type: "P",
      });
    } catch (error) {
      channel = await client.getChannelByName(input.teamId, input.name);
      if (!channel) throw error;
    }
  }
  if (channel.display_name !== input.displayName || channel.name !== input.name) {
    channel = await client.patchChannel(channel.id, {
      name: input.name,
      display_name: input.displayName,
    });
  }
  return channel;
}

async function allChannelMemberIds(client: MattermostClient, channelId: string) {
  const result = new Set<string>();
  for (let page = 0; ; page += 1) {
    const members = await client.listChannelMembers(channelId, page, 200);
    for (const member of members) result.add(member.user_id);
    if (members.length < 200) return result;
  }
}

async function synchronizeChannelMembers(
  client: MattermostClient,
  channelId: string,
  participants: LinkedUser[],
) {
  const desired = new Set(
    participants.map((participant) =>
      requireRemoteId(
        participant.mattermostUserId,
        `CRM user ${participant.userId}`,
      ),
    ),
  );
  const current = await allChannelMemberIds(client, channelId);
  for (const userId of [...desired].sort()) {
    if (!current.has(userId)) await client.addChannelMember(channelId, userId);
  }
  for (const userId of [...current].sort()) {
    if (!desired.has(userId)) await client.removeChannelMember(channelId, userId);
  }
}

async function dispatchKnownEvent(
  record: MattermostOutboxRecord,
  dependencies: MattermostDispatchDependencies,
) {
  const { client, store } = dependencies;
  switch (record.kind) {
    case "workspace.upsert": {
      const workspaceId = requiredPayload(record, "workspace_id");
      const workspace = await store.loadWorkspace(workspaceId);
      if (!workspace) return;
      const name = mattermostTeamName(workspace.id, workspace.name);
      const team = await getOrCreateTeam(client, name, workspace.name);
      await store.saveWorkspaceLink({
        workspaceId,
        mattermostTeamId: team.id,
        teamName: name,
      });
      return;
    }
    case "workspace.delete":
      await client.deleteTeam(requiredPayload(record, "mattermost_team_id"));
      return;
    case "membership.upsert": {
      const workspaceId = requiredPayload(record, "workspace_id");
      const userId = requiredPayload(record, "user_id");
      const membership = await store.loadMembership(workspaceId, userId);
      if (!membership) return;
      const teamId = requireRemoteId(
        membership.mattermostTeamId,
        `CRM workspace ${workspaceId}`,
      );
      const remoteUserId = requireRemoteId(
        membership.user.mattermostUserId,
        `CRM user ${userId}`,
      );
      await client.addTeamMember(teamId, remoteUserId);
      await client.updateTeamMemberRoles(
        teamId,
        remoteUserId,
        membership.role === "ADMIN" ? "team_user team_admin" : "team_user",
      );
      return;
    }
    case "membership.delete":
      await client.removeTeamMember(
        requiredPayload(record, "mattermost_team_id"),
        requiredPayload(record, "mattermost_user_id"),
      );
      return;
    case "conversation.upsert": {
      const conversationId = requiredPayload(record, "conversation_id");
      const conversation = await store.loadConversation(conversationId);
      if (!conversation) return;
      const teamId = requireRemoteId(
        conversation.mattermostTeamId,
        `CRM workspace ${conversation.workspaceId}`,
      );
      const general = conversation.type === "WORKSPACE";
      const name = mattermostChannelName(
        conversation.id,
        general ? "WORKSPACE" : conversation.name || conversation.type,
      );
      const displayName = general ? "Town Square" : conversation.name || "Direct";
      const channel = await getOrCreateChannel(client, {
        teamId,
        name,
        displayName,
        general,
      });
      await synchronizeChannelMembers(client, channel.id, conversation.participants);
      await store.saveConversationLink({
        conversationId,
        mattermostChannelId: channel.id,
        channelName: name,
      });
      return;
    }
    case "conversation.delete":
      await client.deleteChannel(requiredPayload(record, "mattermost_channel_id"));
      return;
    case "message.create": {
      const messageId = requiredPayload(record, "message_id");
      const message = await store.loadMessage(messageId);
      if (!message) return;
      const post = await client.createManagedPost({
        event_id: record.idempotencyKey,
        crm_message_id: message.id,
        mattermost_channel_id: requireRemoteId(
          message.mattermostChannelId,
          `CRM message ${message.id} channel`,
        ),
        mattermost_user_id: requireRemoteId(
          message.mattermostUserId,
          `CRM message ${message.id} sender`,
        ),
        message: message.body,
      });
      await store.saveMessageLink({ messageId, mattermostPostId: post.id });
      return;
    }
    case "user.activate":
    case "user.deactivate": {
      const userId = requiredPayload(record, "user_id");
      const link = await store.loadUserLink(userId);
      if (!link) return;
      await client.setUserActive(
        requireRemoteId(link.mattermostUserId, `CRM user ${userId}`),
        record.kind === "user.activate",
      );
      return;
    }
  }
}

export async function dispatchMattermostEvent(
  record: MattermostOutboxRecord,
  dependencies: MattermostDispatchDependencies,
): Promise<MattermostSyncResult> {
  try {
    await dispatchKnownEvent(record, dependencies);
    return { ok: true };
  } catch (error) {
    if (error instanceof MattermostRequestError) {
      return { ok: false, retryable: error.retryable, message: error.message };
    }
    if (error instanceof MissingMattermostDependency) {
      return { ok: false, retryable: true, message: error.message };
    }
    return {
      ok: false,
      retryable: true,
      message: "Mattermost dispatch failed before a safe response",
    };
  }
}

export function createPrismaMattermostDispatchStore(
  database: PrismaClient,
): MattermostDispatchStore {
  return {
    async loadWorkspace(workspaceId) {
      const workspace = await database.workspace.findUnique({
        where: { id: workspaceId },
        include: { mattermostLink: true },
      });
      return workspace
        ? {
            id: workspace.id,
            name: workspace.name,
            mattermostTeamId: workspace.mattermostLink?.mattermostTeamId ?? null,
          }
        : null;
    },
    async saveWorkspaceLink(input) {
      await database.mattermostWorkspaceLink.upsert({
        where: { workspaceId: input.workspaceId },
        create: { ...input, syncState: "SYNCED", lastSyncedAt: new Date() },
        update: {
          mattermostTeamId: input.mattermostTeamId,
          teamName: input.teamName,
          syncState: "SYNCED",
          lastError: null,
          lastSyncedAt: new Date(),
        },
      });
    },
    async loadMembership(workspaceId, userId) {
      const membership = await database.member.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
        include: {
          user: { include: { mattermostLink: true } },
          workspace: { include: { mattermostLink: true } },
        },
      });
      return membership
        ? {
            role: membership.role,
            user: {
              userId: membership.userId,
              mattermostUserId:
                membership.user.mattermostLink?.mattermostUserId ?? null,
            },
            mattermostTeamId:
              membership.workspace.mattermostLink?.mattermostTeamId ?? null,
          }
        : null;
    },
    async loadConversation(conversationId) {
      const conversation = await database.conversation.findUnique({
        where: { id: conversationId },
        include: {
          mattermostLink: true,
          workspace: { include: { mattermostLink: true } },
          participants: {
            include: { user: { include: { mattermostLink: true } } },
          },
        },
      });
      return conversation
        ? {
            id: conversation.id,
            type: conversation.type,
            name: conversation.name,
            workspaceId: conversation.workspaceId,
            mattermostTeamId:
              conversation.workspace.mattermostLink?.mattermostTeamId ?? null,
            mattermostChannelId:
              conversation.mattermostLink?.mattermostChannelId ?? null,
            participants: conversation.participants.map((participant) => ({
              userId: participant.userId,
              mattermostUserId:
                participant.user.mattermostLink?.mattermostUserId ?? null,
            })),
          }
        : null;
    },
    async saveConversationLink(input) {
      await database.mattermostConversationLink.upsert({
        where: { conversationId: input.conversationId },
        create: { ...input, syncState: "SYNCED", lastSyncedAt: new Date() },
        update: {
          mattermostChannelId: input.mattermostChannelId,
          channelName: input.channelName,
          syncState: "SYNCED",
          lastError: null,
          lastSyncedAt: new Date(),
        },
      });
    },
    async loadMessage(messageId) {
      const message = await database.conversationMessage.findUnique({
        where: { id: messageId },
        include: {
          sender: { include: { mattermostLink: true } },
          conversation: { include: { mattermostLink: true } },
        },
      });
      return message
        ? {
            id: message.id,
            body: message.body,
            mattermostChannelId:
              message.conversation.mattermostLink?.mattermostChannelId ?? null,
            mattermostUserId:
              message.sender.mattermostLink?.mattermostUserId ?? null,
          }
        : null;
    },
    async saveMessageLink(input) {
      await database.mattermostMessageLink.upsert({
        where: { messageId: input.messageId },
        create: {
          ...input,
          origin: "CRM",
          syncState: "SYNCED",
          lastSyncedAt: new Date(),
        },
        update: {
          mattermostPostId: input.mattermostPostId,
          syncState: "SYNCED",
          lastError: null,
          lastSyncedAt: new Date(),
        },
      });
    },
    async loadUserLink(userId) {
      const link = await database.mattermostUserLink.findUnique({
        where: { userId },
      });
      return link
        ? { userId: link.userId, mattermostUserId: link.mattermostUserId }
        : null;
    },
  };
}

export function runtimeMattermostDispatchDependencies(
  prisma: PrismaClient,
  config: MattermostClientConfig,
): MattermostDispatchDependencies {
  return {
    client: new MattermostClient(config),
    store: createPrismaMattermostDispatchStore(prisma),
  };
}
