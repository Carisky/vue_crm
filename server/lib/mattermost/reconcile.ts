import { randomBytes as cryptoRandomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type {
  MattermostChannel,
  MattermostChannelCreate,
  MattermostChannelMember,
  MattermostChannelPatch,
  MattermostClient,
  MattermostTeam,
  MattermostTeamMember,
  MattermostUser,
} from "./client.ts";
import {
  mattermostChannelName,
  mattermostTeamName,
  mattermostUsername,
} from "./identifiers.ts";

export type MattermostReconcileState = {
  users: Array<{
    id: string;
    email: string;
    emailVerifiedAt: Date | null;
    mattermostUserId: string | null;
  }>;
  workspaces: Array<{
    id: string;
    name: string;
    mattermostTeamId: string | null;
  }>;
  memberships: Array<{
    workspaceId: string;
    userId: string;
    role: "ADMIN" | "MEMBER";
  }>;
  conversations: Array<{
    id: string;
    workspaceId: string;
    type: "WORKSPACE" | "GROUP" | "DIRECT";
    name: string | null;
    mattermostChannelId: string | null;
    participantIds: string[];
  }>;
};

export type MattermostReconcileSummary = {
  checked: number;
  created: number;
  updated: number;
  membershipsAdded: number;
  membershipsRemoved: number;
  failed: number;
  failures: string[];
};

export type MattermostReconcileClient = {
  listUsers(page: number, perPage: number): Promise<MattermostUser[]>;
  createUser(input: {
    email: string;
    username: string;
    password: string;
  }): Promise<MattermostUser>;
  setUserActive(userId: string, active: boolean): Promise<void>;
  listTeams(page: number, perPage: number): Promise<MattermostTeam[]>;
  createTeam(input: {
    name: string;
    display_name: string;
  }): Promise<MattermostTeam>;
  updateTeam(
    teamId: string,
    input: { display_name: string },
  ): Promise<MattermostTeam>;
  listTeamMembers(
    teamId: string,
    page: number,
    perPage: number,
  ): Promise<MattermostTeamMember[]>;
  addTeamMember(teamId: string, userId: string): Promise<void>;
  removeTeamMember(teamId: string, userId: string): Promise<void>;
  updateTeamMemberRoles(
    teamId: string,
    userId: string,
    roles: "team_user" | "team_user team_admin",
  ): Promise<void>;
  listChannelsForTeam(
    teamId: string,
    page: number,
    perPage: number,
  ): Promise<MattermostChannel[]>;
  listPrivateChannelsForTeam(
    teamId: string,
    page: number,
    perPage: number,
  ): Promise<MattermostChannel[]>;
  createChannel(input: MattermostChannelCreate): Promise<MattermostChannel>;
  patchChannel(
    channelId: string,
    input: MattermostChannelPatch,
  ): Promise<MattermostChannel>;
  listChannelMembers(
    channelId: string,
    page: number,
    perPage: number,
  ): Promise<MattermostChannelMember[]>;
  addChannelMember(channelId: string, userId: string): Promise<void>;
  removeChannelMember(channelId: string, userId: string): Promise<void>;
  replaceManagedChannels(channelIds: string[]): Promise<void>;
};

export type MattermostReconcileStore = {
  saveUserLink(
    crmId: string,
    remoteId: string,
    username: string,
  ): Promise<void>;
  saveWorkspaceLink(
    crmId: string,
    remoteId: string,
    teamName: string,
  ): Promise<void>;
  saveConversationLink(
    crmId: string,
    remoteId: string,
    channelName: string,
  ): Promise<void>;
  recordResult(summary: MattermostReconcileSummary): Promise<void>;
};

const PAGE_SIZE = 200;
const CONCURRENCY = 5;

async function collect<T>(load: (page: number) => Promise<T[]>) {
  const values: T[] = [];
  for (let page = 0; ; page += 1) {
    const next = await load(page);
    values.push(...next);
    if (next.length < PAGE_SIZE) return values;
  }
}

async function mapLimit<T>(values: T[], worker: (value: T) => Promise<void>) {
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, values.length) }, async () => {
      while (index < values.length) {
        const current = values[index++];
        if (current !== undefined) await worker(current);
      }
    }),
  );
}

function password(randomBytes: (size: number) => Buffer) {
  return `Crm!${randomBytes(24).toString("base64url")}`;
}

function recordFailure(
  summary: MattermostReconcileSummary,
  operation: string,
  error: unknown,
) {
  summary.failed += 1;
  const reason = error instanceof Error ? error.message : "request failed";
  summary.failures.push(
    `${operation}: ${reason.replace(/[\r\n]+/g, " ").slice(0, 300)}`,
  );
}

function conversationNames(
  conversation: MattermostReconcileState["conversations"][number],
) {
  const seed =
    conversation.type === "WORKSPACE"
      ? "WORKSPACE"
      : conversation.name || conversation.type;
  return {
    name: mattermostChannelName(conversation.id, seed),
    displayName:
      conversation.type === "WORKSPACE"
        ? "Town Square"
        : conversation.name || "Direct",
  };
}

export async function reconcileMattermost(
  state: MattermostReconcileState,
  client: MattermostReconcileClient,
  store: MattermostReconcileStore,
  options: { randomBytes?: (size: number) => Buffer } = {},
) {
  const summary: MattermostReconcileSummary = {
    checked: 0,
    created: 0,
    updated: 0,
    membershipsAdded: 0,
    membershipsRemoved: 0,
    failed: 0,
    failures: [],
  };
  const randomBytes = options.randomBytes ?? cryptoRandomBytes;
  const remoteUsers = await collect((page) =>
    client.listUsers(page, PAGE_SIZE),
  );
  const remoteTeams = await collect((page) =>
    client.listTeams(page, PAGE_SIZE),
  );
  const usersById = new Map(remoteUsers.map((user) => [user.id, user]));
  const usersByName = new Map(remoteUsers.map((user) => [user.username, user]));
  const teamsById = new Map(remoteTeams.map((team) => [team.id, team]));
  const teamsByName = new Map(remoteTeams.map((team) => [team.name, team]));
  const resolvedUsers = new Map<string, MattermostUser>();
  const resolvedTeams = new Map<string, MattermostTeam>();

  await mapLimit(
    [...state.users].sort((a, b) => a.id.localeCompare(b.id)),
    async (user) => {
      summary.checked += 1;
      try {
        const username = mattermostUsername(user.id, user.email);
        let remote =
          (user.mattermostUserId && usersById.get(user.mattermostUserId)) ||
          usersByName.get(username);
        if (!remote) {
          remote = await client.createUser({
            email: user.email,
            username,
            password: password(randomBytes),
          });
          summary.created += 1;
          usersById.set(remote.id, remote);
          usersByName.set(remote.username, remote);
        }
        const expectedActive = Boolean(user.emailVerifiedAt);
        const active = !remote.delete_at;
        if (active !== expectedActive) {
          await client.setUserActive(remote.id, expectedActive);
          summary.updated += 1;
          remote = { ...remote, delete_at: expectedActive ? 0 : Date.now() };
        }
        resolvedUsers.set(user.id, remote);
        await store.saveUserLink(user.id, remote.id, username);
      } catch (error) {
        recordFailure(summary, `user ${user.id}`, error);
      }
    },
  );

  await mapLimit(
    [...state.workspaces].sort((a, b) => a.id.localeCompare(b.id)),
    async (workspace) => {
      summary.checked += 1;
      try {
        const name = mattermostTeamName(workspace.id, workspace.name);
        let remote =
          (workspace.mattermostTeamId &&
            teamsById.get(workspace.mattermostTeamId)) ||
          teamsByName.get(name);
        if (!remote) {
          remote = await client.createTeam({
            name,
            display_name: workspace.name,
          });
          summary.created += 1;
          teamsById.set(remote.id, remote);
          teamsByName.set(remote.name, remote);
        } else if (remote.display_name !== workspace.name) {
          remote = await client.updateTeam(remote.id, {
            display_name: workspace.name,
          });
          summary.updated += 1;
        }
        resolvedTeams.set(workspace.id, remote);
        await store.saveWorkspaceLink(workspace.id, remote.id, name);
      } catch (error) {
        recordFailure(summary, `workspace ${workspace.id}`, error);
      }
    },
  );

  const linkedRemoteUsers = new Set(
    [...resolvedUsers.values()].map((user) => user.id),
  );
  await mapLimit(
    [...state.workspaces].sort((a, b) => a.id.localeCompare(b.id)),
    async (workspace) => {
      const team = resolvedTeams.get(workspace.id);
      if (!team) return;
      try {
        const current = await collect((page) =>
          client.listTeamMembers(team.id, page, PAGE_SIZE),
        );
        const currentByUser = new Map(
          current.map((member) => [member.user_id, member]),
        );
        const desired = state.memberships
          .filter((membership) => membership.workspaceId === workspace.id)
          .map((membership) => ({
            ...membership,
            remote: resolvedUsers.get(membership.userId),
          }))
          .filter(
            (
              membership,
            ): membership is typeof membership & { remote: MattermostUser } =>
              Boolean(membership.remote),
          );
        const desiredIds = new Set(
          desired.map((membership) => membership.remote.id),
        );
        for (const membership of desired) {
          summary.checked += 1;
          const existing = currentByUser.get(membership.remote.id);
          if (!existing) {
            await client.addTeamMember(team.id, membership.remote.id);
            summary.membershipsAdded += 1;
          }
          const roles =
            membership.role === "ADMIN" ? "team_user team_admin" : "team_user";
          if (!existing || existing.roles !== roles) {
            await client.updateTeamMemberRoles(
              team.id,
              membership.remote.id,
              roles,
            );
            summary.updated += 1;
          }
        }
        for (const member of current) {
          if (
            linkedRemoteUsers.has(member.user_id) &&
            !desiredIds.has(member.user_id)
          ) {
            await client.removeTeamMember(team.id, member.user_id);
            summary.membershipsRemoved += 1;
          }
        }
      } catch (error) {
        recordFailure(summary, `workspace members ${workspace.id}`, error);
      }
    },
  );

  const managedChannelIds: string[] = [];
  await mapLimit(
    [...state.conversations].sort((a, b) => a.id.localeCompare(b.id)),
    async (conversation) => {
      summary.checked += 1;
      const team = resolvedTeams.get(conversation.workspaceId);
      if (!team) {
        recordFailure(
          summary,
          `conversation ${conversation.id}`,
          new Error("workspace unresolved"),
        );
        return;
      }
      try {
        const [publicChannels, privateChannels] = await Promise.all([
          collect((page) =>
            client.listChannelsForTeam(team.id, page, PAGE_SIZE),
          ),
          collect((page) =>
            client.listPrivateChannelsForTeam(team.id, page, PAGE_SIZE),
          ),
        ]);
        const channels = [...publicChannels, ...privateChannels];
        const names = conversationNames(conversation);
        let channel =
          channels.find(
            (candidate) => candidate.id === conversation.mattermostChannelId,
          ) || channels.find((candidate) => candidate.name === names.name);
        if (!channel) {
          if (conversation.type === "WORKSPACE") {
            throw new Error("Mattermost Town Square is missing");
          }
          channel = await client.createChannel({
            team_id: team.id,
            name: names.name,
            display_name: names.displayName,
            type: "P",
          });
          summary.created += 1;
        } else if (
          channel.name !== names.name ||
          channel.display_name !== names.displayName
        ) {
          channel = await client.patchChannel(channel.id, {
            name: names.name,
            display_name: names.displayName,
          });
          summary.updated += 1;
        }
        await store.saveConversationLink(
          conversation.id,
          channel.id,
          names.name,
        );
        managedChannelIds.push(channel.id);

        const members = await collect((page) =>
          client.listChannelMembers(channel.id, page, PAGE_SIZE),
        );
        const currentIds = new Set(members.map((member) => member.user_id));
        const desiredIds = new Set(
          conversation.participantIds
            .map((id) => resolvedUsers.get(id)?.id)
            .filter((id): id is string => Boolean(id)),
        );
        for (const id of [...desiredIds].sort()) {
          if (!currentIds.has(id)) {
            await client.addChannelMember(channel.id, id);
            summary.membershipsAdded += 1;
          }
        }
        for (const member of members) {
          if (
            linkedRemoteUsers.has(member.user_id) &&
            !desiredIds.has(member.user_id)
          ) {
            await client.removeChannelMember(channel.id, member.user_id);
            summary.membershipsRemoved += 1;
          }
        }
      } catch (error) {
        recordFailure(summary, `conversation ${conversation.id}`, error);
      }
    },
  );

  try {
    await client.replaceManagedChannels([...managedChannelIds].sort());
  } catch (error) {
    recordFailure(summary, "managed channels", error);
  }
  await store.recordResult(summary);
  return summary;
}

export function createPrismaMattermostReconcileStore(database: PrismaClient) {
  return {
    async load(): Promise<MattermostReconcileState> {
      const [users, workspaces, memberships, conversations] = await Promise.all(
        [
          database.user.findMany({
            select: {
              id: true,
              email: true,
              emailVerifiedAt: true,
              mattermostLink: { select: { mattermostUserId: true } },
            },
          }),
          database.workspace.findMany({
            select: {
              id: true,
              name: true,
              mattermostLink: { select: { mattermostTeamId: true } },
            },
          }),
          database.member.findMany({
            select: { workspaceId: true, userId: true, role: true },
          }),
          database.conversation.findMany({
            select: {
              id: true,
              workspaceId: true,
              type: true,
              name: true,
              mattermostLink: { select: { mattermostChannelId: true } },
              participants: { select: { userId: true } },
            },
          }),
        ],
      );
      return {
        users: users.map((user) => ({
          id: user.id,
          email: user.email,
          emailVerifiedAt: user.emailVerifiedAt,
          mattermostUserId: user.mattermostLink?.mattermostUserId ?? null,
        })),
        workspaces: workspaces.map((workspace) => ({
          id: workspace.id,
          name: workspace.name,
          mattermostTeamId: workspace.mattermostLink?.mattermostTeamId ?? null,
        })),
        memberships,
        conversations: conversations.map((conversation) => ({
          id: conversation.id,
          workspaceId: conversation.workspaceId,
          type: conversation.type,
          name: conversation.name,
          mattermostChannelId:
            conversation.mattermostLink?.mattermostChannelId ?? null,
          participantIds: conversation.participants.map((item) => item.userId),
        })),
      };
    },
    saveUserLink: async (
      userId: string,
      mattermostUserId: string,
      username: string,
    ) => {
      await database.mattermostUserLink.upsert({
        where: { userId },
        create: {
          userId,
          mattermostUserId,
          username,
          syncState: "SYNCED",
          lastSyncedAt: new Date(),
        },
        update: {
          mattermostUserId,
          username,
          syncState: "SYNCED",
          lastError: null,
          lastSyncedAt: new Date(),
        },
      });
    },
    saveWorkspaceLink: async (
      workspaceId: string,
      mattermostTeamId: string,
      teamName: string,
    ) => {
      await database.mattermostWorkspaceLink.upsert({
        where: { workspaceId },
        create: {
          workspaceId,
          mattermostTeamId,
          teamName,
          syncState: "SYNCED",
          lastSyncedAt: new Date(),
        },
        update: {
          mattermostTeamId,
          teamName,
          syncState: "SYNCED",
          lastError: null,
          lastSyncedAt: new Date(),
        },
      });
    },
    saveConversationLink: async (
      conversationId: string,
      mattermostChannelId: string,
      channelName: string,
    ) => {
      await database.mattermostConversationLink.upsert({
        where: { conversationId },
        create: {
          conversationId,
          mattermostChannelId,
          channelName,
          syncState: "SYNCED",
          lastSyncedAt: new Date(),
        },
        update: {
          mattermostChannelId,
          channelName,
          syncState: "SYNCED",
          lastError: null,
          lastSyncedAt: new Date(),
        },
      });
    },
    recordResult: async (summary: MattermostReconcileSummary) => {
      await database.mattermostSyncControl.upsert({
        where: { key: "global" },
        create: {
          key: "global",
          lastReconciledAt: summary.failed ? null : new Date(),
          lastReconcileSummary: summary,
        },
        update: {
          lastReconciledAt: summary.failed ? undefined : new Date(),
          lastReconcileSummary: summary,
        },
      });
    },
  };
}

export async function reconcileMattermostWithRuntime() {
  const [{ default: prisma }, { getMattermostConfig, MattermostClient }] =
    await Promise.all([import("../prisma.ts"), import("./client.ts")]);
  const config = getMattermostConfig();
  if (!config.enabled) return null;
  const store = createPrismaMattermostReconcileStore(prisma);
  const summary = await reconcileMattermost(
    await store.load(),
    new MattermostClient(config) as MattermostReconcileClient,
    store,
  );
  if (summary.failed === 0) {
    await prisma.mattermostSyncControl.update({
      where: { key: "global" },
      data: {
        pausedAt: null,
        pauseReason: null,
        lastBootstrapState: "RECOVERED",
      },
    });
  }
  return summary;
}
