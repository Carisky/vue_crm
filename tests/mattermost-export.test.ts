import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMattermostImport,
  type MattermostExportSnapshot,
} from "../server/lib/mattermost/export.ts";
import { mattermostChannelName } from "../server/lib/mattermost/identifiers.ts";

const cutoff = new Date("2026-09-04T08:30:00.000Z");

const snapshot: MattermostExportSnapshot = {
  snapshotCutoff: cutoff,
  users: [
    {
      id: "user-b",
      email: "bob@example.com",
      name: "Bob",
      emailVerifiedAt: null,
      locale: "en",
    },
    {
      id: "user-a",
      email: "alice@example.com",
      name: "Alice",
      emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
      locale: "en",
    },
  ],
  workspaces: [{ id: "workspace-a", name: "Dispatch", ownerId: "user-a" }],
  memberships: [
    { workspaceId: "workspace-a", userId: "user-b", role: "MEMBER" },
    { workspaceId: "workspace-a", userId: "user-a", role: "ADMIN" },
  ],
  conversations: [
    {
      id: "conversation-group",
      workspaceId: "workspace-a",
      type: "GROUP",
      name: "Night shift",
      participantIds: ["user-a", "user-b"],
    },
    {
      id: "conversation-general",
      workspaceId: "workspace-a",
      type: "WORKSPACE",
      name: "General",
      participantIds: ["user-a", "user-b"],
    },
    {
      id: "conversation-direct",
      workspaceId: "workspace-a",
      type: "DIRECT",
      name: null,
      participantIds: ["user-b", "user-a"],
    },
  ],
  messages: [
    {
      id: "message-c",
      conversationId: "conversation-direct",
      senderId: "user-b",
      body: "third",
      createdAt: new Date("2026-03-03T00:00:00.003Z"),
    },
    {
      id: "message-a",
      conversationId: "conversation-general",
      senderId: "user-a",
      body: "first",
      createdAt: new Date("2026-03-03T00:00:00.001Z"),
    },
    {
      id: "message-b",
      conversationId: "conversation-group",
      senderId: "user-a",
      body: "second",
      createdAt: new Date("2026-03-03T00:00:00.002Z"),
    },
  ],
};

function parse(jsonl: string) {
  return jsonl
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
}

test("builds deterministic Mattermost JSONL in bulk-load order", () => {
  const randomBytes = (size: number) => Buffer.alloc(size, 0xab);
  const first = buildMattermostImport(snapshot, { randomBytes });
  const second = buildMattermostImport(snapshot, { randomBytes });

  assert.equal(first.jsonl, second.jsonl);
  const rows = parse(first.jsonl);
  assert.deepEqual(
    rows.map((row) => row.type),
    [
      "version",
      "team",
      "channel",
      "channel",
      "channel",
      "user",
      "user",
      "post",
      "post",
      "post",
    ],
  );
  assert.deepEqual(rows[0], { type: "version", version: 1 });

  const channels = rows.filter((row) => row.type === "channel");
  assert.equal(
    channels[0].channel.name,
    mattermostChannelName("conversation-direct", "DIRECT"),
  );
  assert.equal(channels[1].channel.name, "town-square");
  assert.equal(channels[1].channel.type, "O");
  assert.equal(channels[2].channel.type, "P");

  const users = rows.filter((row) => row.type === "user");
  const alice = users.find(
    (row) => row.user.email === "alice@example.com",
  ).user;
  const bob = users.find((row) => row.user.email === "bob@example.com").user;
  assert.equal(alice.delete_at, undefined);
  assert.equal(bob.delete_at, cutoff.getTime());
  assert.equal(alice.teams[0].roles, "team_user team_admin");
  assert.deepEqual(
    alice.teams[0].channels.map((channel: { name: string }) => channel.name),
    [
      mattermostChannelName("conversation-direct", "DIRECT"),
      "town-square",
      mattermostChannelName("conversation-group", "Night shift"),
    ],
  );
  assert.equal(typeof alice.password, "string");
  assert.ok(alice.password.length >= 32);

  const posts = rows.filter((row) => row.type === "post");
  assert.deepEqual(
    posts.map((row) => row.post.message),
    ["first", "second", "third"],
  );
  assert.equal(posts[0].post.user, alice.username);
  assert.equal(posts[0].post.create_at, Date.parse("2026-03-03T00:00:00.001Z"));
  assert.deepEqual(posts[0].post.props, {
    crm_message_id: "message-a",
    crm_origin: "bootstrap",
  });
});

test("returns a non-secret manifest with snapshot counts", () => {
  const result = buildMattermostImport(snapshot, {
    randomBytes: (size) => Buffer.alloc(size, 0xcd),
  });

  assert.deepEqual(result.manifest, {
    version: 1,
    snapshotCutoff: cutoff.toISOString(),
    counts: { teams: 1, channels: 3, users: 2, posts: 3 },
  });
  assert.equal(JSON.stringify(result.manifest).includes("cdcdcd"), false);
  assert.equal(JSON.stringify(result.manifest).includes("password"), false);
});
