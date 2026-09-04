import type { PrismaClient } from "@prisma/client";
import type {
  MattermostChannel,
  MattermostClient,
  MattermostPost,
  MattermostTeam,
  MattermostUser,
} from "./client.ts";
import {
  mattermostChannelName,
  mattermostTeamName,
  mattermostUsername,
} from "./identifiers.ts";

export type MattermostLinkSource = {
  users: Array<{ id: string; email: string }>;
  workspaces: Array<{ id: string; name: string }>;
  conversations: Array<{
    id: string;
    workspaceId: string;
    type: "DIRECT" | "WORKSPACE" | "GROUP";
    name: string | null;
  }>;
  messages: Array<{ id: string; conversationId: string }>;
};

export type MattermostResolvedLinks = {
  users: Array<{ userId: string; mattermostUserId: string; username: string }>;
  workspaces: Array<{
    workspaceId: string;
    mattermostTeamId: string;
    teamName: string;
  }>;
  conversations: Array<{
    conversationId: string;
    mattermostChannelId: string;
    channelName: string;
  }>;
  messages: Array<{ messageId: string; mattermostPostId: string }>;
};

export type MattermostResolutionClient = Pick<
  MattermostClient,
  "listUsers" | "listTeams" | "listChannelsForTeam" | "listChannelPosts"
>;

type ResolutionStore = {
  save(links: MattermostResolvedLinks): Promise<void>;
};

const PAGE_SIZE = 200;

async function collectPages<T>(
  load: (page: number, perPage: number) => Promise<T[]>,
) {
  const rows: T[] = [];
  for (let page = 0; ; page += 1) {
    const next = await load(page, PAGE_SIZE);
    rows.push(...next);
    if (next.length < PAGE_SIZE) return rows;
  }
}

function channelName(
  conversation: MattermostLinkSource["conversations"][number],
) {
  return mattermostChannelName(
    conversation.id,
    conversation.type === "WORKSPACE"
      ? "WORKSPACE"
      : conversation.name || conversation.type,
  );
}

function uniqueRemoteIds(
  kind: string,
  links: Array<{ remoteId: string; crmId: string }>,
) {
  const claimed = new Map<string, string>();
  for (const link of links) {
    const owner = claimed.get(link.remoteId);
    if (owner && owner !== link.crmId) {
      throw new Error(`Found duplicate remote ${kind} ID ${link.remoteId}`);
    }
    claimed.set(link.remoteId, link.crmId);
  }
}

function required<T>(value: T | undefined, description: string): T {
  if (value === undefined) throw new Error(`Could not resolve ${description}`);
  return value;
}

export async function resolveMattermostLinks(
  source: MattermostLinkSource,
  client: MattermostResolutionClient,
  store: ResolutionStore,
) {
  const [remoteUsers, remoteTeams] = await Promise.all([
    collectPages<MattermostUser>((page, size) => client.listUsers(page, size)),
    collectPages<MattermostTeam>((page, size) => client.listTeams(page, size)),
  ]);
  const usersByName = new Map(remoteUsers.map((user) => [user.username, user]));
  const teamsByName = new Map(remoteTeams.map((team) => [team.name, team]));

  const users = [...source.users]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((user) => {
      const username = mattermostUsername(user.id, user.email);
      const remote = required(usersByName.get(username), `CRM user ${user.id}`);
      return { userId: user.id, mattermostUserId: remote.id, username };
    });
  const workspaces = [...source.workspaces]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((workspace) => {
      const teamName = mattermostTeamName(workspace.id, workspace.name);
      const remote = required(
        teamsByName.get(teamName),
        `CRM workspace ${workspace.id}`,
      );
      return {
        workspaceId: workspace.id,
        mattermostTeamId: remote.id,
        teamName,
      };
    });

  uniqueRemoteIds(
    "user",
    users.map((link) => ({
      remoteId: link.mattermostUserId,
      crmId: link.userId,
    })),
  );
  uniqueRemoteIds(
    "team",
    workspaces.map((link) => ({
      remoteId: link.mattermostTeamId,
      crmId: link.workspaceId,
    })),
  );

  const workspaceLinks = new Map(
    workspaces.map((link) => [link.workspaceId, link]),
  );
  const channelsByTeam = new Map<string, MattermostChannel[]>();
  await Promise.all(
    workspaces.map(async (workspace) => {
      channelsByTeam.set(
        workspace.mattermostTeamId,
        await collectPages((page, size) =>
          client.listChannelsForTeam(workspace.mattermostTeamId, page, size),
        ),
      );
    }),
  );

  const conversations = [...source.conversations]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((conversation) => {
      const workspace = required(
        workspaceLinks.get(conversation.workspaceId),
        `workspace link for conversation ${conversation.id}`,
      );
      const expectedName = channelName(conversation);
      const remote = required(
        channelsByTeam
          .get(workspace.mattermostTeamId)
          ?.find((channel) => channel.name === expectedName),
        `CRM conversation ${conversation.id}`,
      );
      return {
        conversationId: conversation.id,
        mattermostChannelId: remote.id,
        channelName: expectedName,
      };
    });
  uniqueRemoteIds(
    "channel",
    conversations.map((link) => ({
      remoteId: link.mattermostChannelId,
      crmId: link.conversationId,
    })),
  );

  const postsByCrmMessage = new Map<string, MattermostPost>();
  await Promise.all(
    conversations.map(async (conversation) => {
      for (let page = 0; ; page += 1) {
        const result = await client.listChannelPosts(
          conversation.mattermostChannelId,
          page,
          PAGE_SIZE,
        );
        for (const post of Object.values(result.posts)) {
          const crmMessageId = post.props?.crm_message_id;
          if (typeof crmMessageId !== "string") continue;
          const existing = postsByCrmMessage.get(crmMessageId);
          if (existing && existing.id !== post.id) {
            throw new Error(
              `Duplicate Mattermost posts for CRM message ${crmMessageId}`,
            );
          }
          postsByCrmMessage.set(crmMessageId, post);
        }
        if (result.order.length < PAGE_SIZE) break;
      }
    }),
  );
  const messages = [...source.messages]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((message) => ({
      messageId: message.id,
      mattermostPostId: required(
        postsByCrmMessage.get(message.id),
        `CRM message ${message.id}`,
      ).id,
    }));
  uniqueRemoteIds(
    "post",
    messages.map((link) => ({
      remoteId: link.mattermostPostId,
      crmId: link.messageId,
    })),
  );

  const links = { users, workspaces, conversations, messages };
  await store.save(links);
  return links;
}

export function createPrismaMattermostLinkStore(database: PrismaClient) {
  return {
    async load(): Promise<MattermostLinkSource> {
      const [users, workspaces, conversations, messages] = await Promise.all([
        database.user.findMany({ select: { id: true, email: true } }),
        database.workspace.findMany({ select: { id: true, name: true } }),
        database.conversation.findMany({
          select: { id: true, workspaceId: true, type: true, name: true },
        }),
        database.conversationMessage.findMany({
          select: { id: true, conversationId: true },
        }),
      ]);
      return { users, workspaces, conversations, messages };
    },
    async save(links: MattermostResolvedLinks) {
      await database.$transaction(async (tx) => {
        await tx.mattermostMessageLink.deleteMany();
        await tx.mattermostConversationLink.deleteMany();
        await tx.mattermostWorkspaceLink.deleteMany();
        await tx.mattermostUserLink.deleteMany();
        const now = new Date();
        if (links.users.length) {
          await tx.mattermostUserLink.createMany({
            data: links.users.map((link) => ({
              ...link,
              syncState: "SYNCED",
              lastSyncedAt: now,
            })),
          });
        }
        if (links.workspaces.length) {
          await tx.mattermostWorkspaceLink.createMany({
            data: links.workspaces.map((link) => ({
              ...link,
              syncState: "SYNCED",
              lastSyncedAt: now,
            })),
          });
        }
        if (links.conversations.length) {
          await tx.mattermostConversationLink.createMany({
            data: links.conversations.map((link) => ({
              ...link,
              syncState: "SYNCED",
              lastSyncedAt: now,
            })),
          });
        }
        if (links.messages.length) {
          await tx.mattermostMessageLink.createMany({
            data: links.messages.map((link) => ({
              ...link,
              origin: "BOOTSTRAP",
              syncState: "SYNCED",
              lastSyncedAt: now,
            })),
          });
        }
      });
    },
  };
}
