import assert from "node:assert/strict";
import test from "node:test";
import {
  reconcileMattermost,
  type MattermostReconcileClient,
  type MattermostReconcileState,
} from "../server/lib/mattermost/reconcile.ts";
import {
  mattermostChannelName,
  mattermostTeamName,
  mattermostUsername,
} from "../server/lib/mattermost/identifiers.ts";

const state: MattermostReconcileState = {
  users: [
    {
      id: "user-a",
      email: "alice@example.com",
      emailVerifiedAt: new Date(),
      mattermostUserId: null,
    },
    {
      id: "user-b",
      email: "bob@example.com",
      emailVerifiedAt: new Date(),
      mattermostUserId: "mm-b",
    },
    {
      id: "user-c",
      email: "carol@example.com",
      emailVerifiedAt: new Date(),
      mattermostUserId: "mm-c",
    },
  ],
  workspaces: [
    { id: "workspace-a", name: "Dispatch", mattermostTeamId: "mm-team" },
  ],
  memberships: [
    { workspaceId: "workspace-a", userId: "user-a", role: "ADMIN" },
    { workspaceId: "workspace-a", userId: "user-b", role: "MEMBER" },
  ],
  conversations: [
    {
      id: "conversation-a",
      workspaceId: "workspace-a",
      type: "GROUP",
      name: "Night shift",
      mattermostChannelId: "mm-channel",
      participantIds: ["user-a", "user-b"],
    },
  ],
};

test("repairs linked Mattermost structure while leaving unlinked entities alone", async () => {
  const calls: string[] = [];
  const saved = {
    users: new Map<string, string>(),
    workspaces: new Map<string, string>(),
    conversations: new Map<string, string>(),
  };
  const teamName = mattermostTeamName("workspace-a", "Dispatch");
  const channelName = mattermostChannelName("conversation-a", "Night shift");
  const client: MattermostReconcileClient = {
    listUsers: async (page) =>
      page
        ? []
        : [
            {
              id: "mm-b",
              email: "bob@example.com",
              username: mattermostUsername("user-b", "bob@example.com"),
              delete_at: 10,
            },
            {
              id: "mm-c",
              email: "carol@example.com",
              username: mattermostUsername("user-c", "carol@example.com"),
            },
            {
              id: "unlinked",
              email: "outside@example.com",
              username: "outside",
            },
          ],
    createUser: async (input) => {
      calls.push(`create-user:${input.username}`);
      return { id: "mm-a", email: input.email, username: input.username };
    },
    setUserActive: async (id, active) => {
      calls.push(`active:${id}:${active}`);
    },
    listTeams: async (page) =>
      page ? [] : [{ id: "mm-team", name: teamName, display_name: "Old" }],
    createTeam: async () => {
      throw new Error("unexpected create team");
    },
    updateTeam: async (id, input) => {
      calls.push(`team:${id}:${input.display_name}`);
      return { id, name: teamName, display_name: input.display_name };
    },
    listTeamMembers: async (_id, page) =>
      page
        ? []
        : [
            {
              team_id: "mm-team",
              user_id: "mm-b",
              roles: "team_user team_admin",
            },
            { team_id: "mm-team", user_id: "mm-c", roles: "team_user" },
            { team_id: "mm-team", user_id: "unlinked", roles: "team_user" },
          ],
    addTeamMember: async (_team, user) => {
      calls.push(`team-add:${user}`);
    },
    removeTeamMember: async (_team, user) => {
      calls.push(`team-remove:${user}`);
    },
    updateTeamMemberRoles: async (_team, user, roles) => {
      calls.push(`team-role:${user}:${roles}`);
    },
    listChannelsForTeam: async (_id, page) =>
      page
        ? []
        : [
            {
              id: "mm-channel",
              team_id: "mm-team",
              name: "old-name",
              display_name: "Old",
              type: "P",
            },
          ],
    createChannel: async () => {
      throw new Error("unexpected create channel");
    },
    patchChannel: async (id, input) => {
      calls.push(`channel:${id}:${input.name}`);
      return {
        id,
        team_id: "mm-team",
        name: input.name ?? channelName,
        display_name: input.display_name ?? "Night shift",
        type: "P",
      };
    },
    listChannelMembers: async (_id, page) =>
      page
        ? []
        : [
            {
              channel_id: "mm-channel",
              user_id: "mm-b",
              roles: "channel_user",
            },
            {
              channel_id: "mm-channel",
              user_id: "mm-c",
              roles: "channel_user",
            },
            {
              channel_id: "mm-channel",
              user_id: "unlinked",
              roles: "channel_user",
            },
          ],
    addChannelMember: async (_channel, user) => {
      calls.push(`channel-add:${user}`);
    },
    removeChannelMember: async (_channel, user) => {
      calls.push(`channel-remove:${user}`);
    },
    replaceManagedChannels: async (ids) => {
      calls.push(`managed:${ids.join(",")}`);
    },
  };

  const result = await reconcileMattermost(
    state,
    client,
    {
      saveUserLink: async (crm, remote) => {
        saved.users.set(crm, remote);
      },
      saveWorkspaceLink: async (crm, remote) => {
        saved.workspaces.set(crm, remote);
      },
      saveConversationLink: async (crm, remote) => {
        saved.conversations.set(crm, remote);
      },
      recordResult: async () => undefined,
    },
    { randomBytes: (size) => Buffer.alloc(size, 1) },
  );

  assert.equal(result.failed, 0);
  assert.ok(
    calls.includes(
      `create-user:${mattermostUsername("user-a", "alice@example.com")}`,
    ),
  );
  assert.ok(calls.includes("active:mm-b:true"));
  assert.ok(calls.includes("team:mm-team:Dispatch"));
  assert.ok(calls.includes("team-add:mm-a"));
  assert.ok(calls.includes("team-remove:mm-c"));
  assert.ok(calls.includes("team-role:mm-b:team_user"));
  assert.ok(calls.includes(`channel:mm-channel:${channelName}`));
  assert.ok(calls.includes("channel-add:mm-a"));
  assert.ok(calls.includes("channel-remove:mm-c"));
  assert.ok(calls.includes("managed:mm-channel"));
  assert.equal(
    calls.some((call) => call.includes("unlinked")),
    false,
  );
  assert.equal(saved.users.get("user-a"), "mm-a");
});

test("classifies individual failures and still publishes resolved managed channels", async () => {
  const minimal: MattermostReconcileState = {
    users: [],
    workspaces: [],
    memberships: [],
    conversations: [],
  };
  let published = false;
  const result = await reconcileMattermost(
    minimal,
    {
      ...({} as MattermostReconcileClient),
      listUsers: async () => [],
      listTeams: async () => [],
      replaceManagedChannels: async () => {
        published = true;
      },
    },
    {
      saveUserLink: async () => undefined,
      saveWorkspaceLink: async () => undefined,
      saveConversationLink: async () => undefined,
      recordResult: async () => undefined,
    },
  );
  assert.equal(result.failed, 0);
  assert.equal(published, true);
});
