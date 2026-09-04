import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveMattermostLinks,
  type MattermostLinkSource,
  type MattermostResolutionClient,
} from "../server/lib/mattermost/link-resolution.ts";
import {
  mattermostChannelName,
  mattermostTeamName,
  mattermostUsername,
} from "../server/lib/mattermost/identifiers.ts";

const source: MattermostLinkSource = {
  users: [{ id: "user-a", email: "alice@example.com" }],
  workspaces: [{ id: "workspace-a", name: "Dispatch" }],
  conversations: [
    {
      id: "conversation-a",
      workspaceId: "workspace-a",
      type: "WORKSPACE",
      name: "General",
    },
  ],
  messages: [{ id: "message-a", conversationId: "conversation-a" }],
};

function client(
  overrides: Partial<MattermostResolutionClient> = {},
): MattermostResolutionClient {
  const username = mattermostUsername("user-a", "alice@example.com");
  const teamName = mattermostTeamName("workspace-a", "Dispatch");
  return {
    listUsers: async (page: number) =>
      page === 0
        ? [{ id: "mm-user-a", email: "alice@example.com", username }]
        : [],
    listTeams: async (page: number) =>
      page === 0
        ? [{ id: "mm-team-a", name: teamName, display_name: "Dispatch" }]
        : [],
    listChannelsForTeam: async (_teamId: string, page: number) =>
      page === 0
        ? [
            {
              id: "mm-channel-a",
              team_id: "mm-team-a",
              name: mattermostChannelName("conversation-a", "WORKSPACE"),
              display_name: "Town Square",
              type: "O" as const,
            },
          ]
        : [],
    listChannelPosts: async (_channelId: string, page: number) =>
      page === 0
        ? {
            order: ["mm-post-a"],
            posts: {
              "mm-post-a": {
                id: "mm-post-a",
                channel_id: "mm-channel-a",
                user_id: "mm-user-a",
                message: "mutable text is irrelevant",
                create_at: 1,
                props: { crm_message_id: "message-a" },
              },
            },
          }
        : { order: [], posts: {} as Record<string, never> },
    ...overrides,
  };
}

test("resolves deterministic names and CRM message props across pages", async () => {
  let saved: unknown;
  const result = await resolveMattermostLinks(source, client(), {
    save: async (links) => {
      saved = links;
    },
  });

  assert.deepEqual(result, {
    users: [
      {
        userId: "user-a",
        mattermostUserId: "mm-user-a",
        username: mattermostUsername("user-a", "alice@example.com"),
      },
    ],
    workspaces: [
      {
        workspaceId: "workspace-a",
        mattermostTeamId: "mm-team-a",
        teamName: mattermostTeamName("workspace-a", "Dispatch"),
      },
    ],
    conversations: [
      {
        conversationId: "conversation-a",
        mattermostChannelId: "mm-channel-a",
        channelName: mattermostChannelName("conversation-a", "WORKSPACE"),
      },
    ],
    messages: [
      {
        messageId: "message-a",
        mattermostPostId: "mm-post-a",
      },
    ],
  });
  assert.deepEqual(saved, result);
});

test("does not match posts by mutable message or timestamp", async () => {
  await assert.rejects(
    resolveMattermostLinks(
      source,
      client({
        listChannelPosts: async () => ({
          order: ["wrong"],
          posts: {
            wrong: {
              id: "wrong",
              channel_id: "mm-channel-a",
              user_id: "mm-user-a",
              message: "message-a",
              create_at: 0,
              props: {},
            },
          },
        }),
      }),
      { save: async () => undefined },
    ),
    /message-a/,
  );
});

test("rejects duplicate remote IDs before saving", async () => {
  let saved = false;
  await assert.rejects(
    resolveMattermostLinks(
      {
        ...source,
        users: [...source.users, { id: "user-b", email: "bob@example.com" }],
      },
      client({
        listUsers: async () => [
          {
            id: "duplicate-id",
            email: "alice@example.com",
            username: mattermostUsername("user-a", "alice@example.com"),
          },
          {
            id: "duplicate-id",
            email: "bob@example.com",
            username: mattermostUsername("user-b", "bob@example.com"),
          },
        ],
      }),
      {
        save: async () => {
          saved = true;
        },
      },
    ),
    /duplicate remote user ID/,
  );
  assert.equal(saved, false);
});
