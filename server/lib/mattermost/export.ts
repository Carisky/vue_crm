import { randomBytes as cryptoRandomBytes } from "node:crypto";
import {
  mattermostChannelName,
  mattermostTeamName,
  mattermostUsername,
} from "./identifiers.ts";

type ConversationType = "DIRECT" | "WORKSPACE" | "GROUP";
type MemberRole = "ADMIN" | "MEMBER";

export type MattermostExportSnapshot = {
  snapshotCutoff: Date;
  users: Array<{
    id: string;
    email: string;
    name: string | null;
    emailVerifiedAt: Date | null;
    locale: string;
  }>;
  workspaces: Array<{ id: string; name: string; ownerId: string }>;
  memberships: Array<{
    workspaceId: string;
    userId: string;
    role: MemberRole;
  }>;
  conversations: Array<{
    id: string;
    workspaceId: string;
    type: ConversationType;
    name: string | null;
    participantIds: string[];
  }>;
  messages: Array<{
    id: string;
    conversationId: string;
    senderId: string;
    body: string;
    createdAt: Date;
  }>;
};

export type MattermostImportManifest = {
  version: 1;
  snapshotCutoff: string;
  counts: {
    teams: number;
    channels: number;
    users: number;
    posts: number;
  };
};

type BuildOptions = {
  randomBytes?: (size: number) => Buffer;
};

type JsonObject = Record<string, unknown>;

function sorted<T extends { id: string }>(rows: readonly T[]) {
  return [...rows].sort((left, right) => left.id.localeCompare(right.id));
}

function compareMessages(
  left: MattermostExportSnapshot["messages"][number],
  right: MattermostExportSnapshot["messages"][number],
) {
  return (
    left.createdAt.getTime() - right.createdAt.getTime() ||
    left.id.localeCompare(right.id)
  );
}

function bootstrapPassword(randomBytes: (size: number) => Buffer) {
  return `Crm!${randomBytes(24).toString("base64url")}`;
}

function conversationNameSeed(
  conversation: MattermostExportSnapshot["conversations"][number],
) {
  return conversation.type === "WORKSPACE"
    ? "WORKSPACE"
    : conversation.name || conversation.type;
}

export function buildMattermostImport(
  snapshot: MattermostExportSnapshot,
  options: BuildOptions = {},
) {
  const randomBytes = options.randomBytes ?? cryptoRandomBytes;
  const users = sorted(snapshot.users);
  const workspaces = sorted(snapshot.workspaces);
  const conversations = sorted(snapshot.conversations);
  const messages = [...snapshot.messages].sort(compareMessages);

  const userById = new Map(users.map((user) => [user.id, user]));
  const workspaceById = new Map(
    workspaces.map((workspace) => [workspace.id, workspace]),
  );
  const conversationById = new Map(
    conversations.map((conversation) => [conversation.id, conversation]),
  );
  const membershipsByUser = new Map<
    string,
    MattermostExportSnapshot["memberships"]
  >();
  for (const membership of snapshot.memberships) {
    const memberships = membershipsByUser.get(membership.userId) ?? [];
    memberships.push(membership);
    membershipsByUser.set(membership.userId, memberships);
  }

  const rows: JsonObject[] = [{ type: "version", version: 1 }];

  for (const workspace of workspaces) {
    rows.push({
      type: "team",
      team: {
        name: mattermostTeamName(workspace.id, workspace.name),
        display_name: workspace.name,
        type: "I",
        allow_open_invite: false,
      },
    });
  }

  for (const conversation of conversations) {
    const workspace = workspaceById.get(conversation.workspaceId);
    if (!workspace) {
      throw new Error(`Conversation ${conversation.id} has no workspace`);
    }
    const displayName =
      conversation.type === "WORKSPACE"
        ? "General"
        : conversation.name ||
          (conversation.type === "DIRECT" ? "Direct chat" : "Group chat");
    rows.push({
      type: "channel",
      channel: {
        team: mattermostTeamName(workspace.id, workspace.name),
        name: mattermostChannelName(
          conversation.id,
          conversationNameSeed(conversation),
        ),
        display_name: displayName,
        type: conversation.type === "WORKSPACE" ? "O" : "P",
      },
    });
  }

  for (const user of users) {
    const teamMemberships = [...(membershipsByUser.get(user.id) ?? [])]
      .sort((left, right) => left.workspaceId.localeCompare(right.workspaceId))
      .map((membership) => {
        const workspace = workspaceById.get(membership.workspaceId);
        if (!workspace) {
          throw new Error(
            `Membership references workspace ${membership.workspaceId}`,
          );
        }
        const channels = conversations
          .filter(
            (conversation) =>
              conversation.workspaceId === membership.workspaceId &&
              conversation.participantIds.includes(user.id),
          )
          .map((conversation) => ({
            name: mattermostChannelName(
              conversation.id,
              conversationNameSeed(conversation),
            ),
            roles: "channel_user",
          }));
        return {
          name: mattermostTeamName(workspace.id, workspace.name),
          roles:
            membership.role === "ADMIN" || workspace.ownerId === user.id
              ? "team_user team_admin"
              : "team_user",
          channels,
        };
      });

    const exportedUser: JsonObject = {
      username: mattermostUsername(user.id, user.email),
      email: user.email,
      password: bootstrapPassword(randomBytes),
      first_name: user.name ?? "",
      roles: "system_user",
      locale: user.locale,
      teams: teamMemberships,
    };
    if (!user.emailVerifiedAt) {
      exportedUser.delete_at = snapshot.snapshotCutoff.getTime();
    }
    rows.push({ type: "user", user: exportedUser });
  }

  for (const message of messages) {
    const conversation = conversationById.get(message.conversationId);
    const user = userById.get(message.senderId);
    const workspace = conversation
      ? workspaceById.get(conversation.workspaceId)
      : undefined;
    if (!conversation || !user || !workspace) {
      throw new Error(`Message ${message.id} references missing export data`);
    }
    rows.push({
      type: "post",
      post: {
        team: mattermostTeamName(workspace.id, workspace.name),
        channel: mattermostChannelName(
          conversation.id,
          conversationNameSeed(conversation),
        ),
        user: mattermostUsername(user.id, user.email),
        message: message.body,
        props: {
          crm_message_id: message.id,
          crm_origin: "bootstrap",
        },
        create_at: message.createdAt.getTime(),
      },
    });
  }

  const manifest: MattermostImportManifest = {
    version: 1,
    snapshotCutoff: snapshot.snapshotCutoff.toISOString(),
    counts: {
      teams: workspaces.length,
      channels: conversations.length,
      users: users.length,
      posts: messages.length,
    },
  };

  return {
    jsonl: `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
    manifest,
  };
}
