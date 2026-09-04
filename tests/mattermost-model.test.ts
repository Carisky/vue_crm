import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Prisma } from "@prisma/client";

function model(name: string) {
  const value = Prisma.dmmf.datamodel.models.find((candidate) => candidate.name === name);
  assert.ok(value, `generated Prisma client must expose ${name}`);
  return value;
}

function field(modelName: string, fieldName: string) {
  const value = model(modelName).fields.find((candidate) => candidate.name === fieldName);
  assert.ok(value, `${modelName}.${fieldName} must exist`);
  return value;
}

test("Mattermost mappings expose remote identifiers and CRM relations", () => {
  assert.equal(field("MattermostUserLink", "userId").type, "String");
  assert.equal(field("MattermostUserLink", "mattermostUserId").type, "String");
  assert.equal(field("MattermostWorkspaceLink", "mattermostTeamId").type, "String");
  assert.equal(field("MattermostConversationLink", "mattermostChannelId").type, "String");
  assert.equal(field("MattermostMessageLink", "mattermostPostId").type, "String");
  assert.equal(field("MattermostMessageLink", "origin").type, "MattermostMessageOrigin");
  assert.equal(field("User", "mattermostLink").type, "MattermostUserLink");
  assert.equal(field("Workspace", "mattermostLink").type, "MattermostWorkspaceLink");
  assert.equal(field("Conversation", "mattermostLink").type, "MattermostConversationLink");
  assert.equal(field("ConversationMessage", "mattermostLink").type, "MattermostMessageLink");
});

test("Mattermost replay and queue records expose their idempotency keys", () => {
  assert.equal(field("MattermostWebhookNonce", "nonce").type, "String");
  assert.equal(field("MattermostInboundEvent", "eventId").type, "String");
  assert.equal(field("MattermostOutboxEvent", "idempotencyKey").type, "String");
  assert.equal(field("MattermostOutboxEvent", "payload").type, "Json");
  assert.equal(field("MattermostOutboxEvent", "state").type, "MattermostOutboxState");
  assert.equal(field("MattermostOutboxEvent", "attempts").type, "Int");
});

test("Mattermost synchronization has a persisted global pause control", () => {
  assert.equal(field("MattermostSyncControl", "key").type, "String");
  assert.equal(field("MattermostSyncControl", "pausedAt").type, "DateTime");
});

test("every Mattermost mapping exposes synchronization state and timestamps", () => {
  for (const modelName of [
    "MattermostUserLink",
    "MattermostWorkspaceLink",
    "MattermostConversationLink",
    "MattermostMessageLink",
  ]) {
    assert.equal(field(modelName, "syncState").type, "MattermostSyncState");
    assert.equal(field(modelName, "createdAt").type, "DateTime");
    assert.equal(field(modelName, "updatedAt").type, "DateTime");
  }
});

test("Mattermost generated SQL enforces replay and remote-ID uniqueness", () => {
  const projectRoot = fileURLToPath(new URL("..", import.meta.url));
  const prismaCli = fileURLToPath(
    new URL("../node_modules/prisma/build/index.js", import.meta.url),
  );
  const result = spawnSync(
    process.execPath,
    [
      prismaCli,
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema",
      "prisma/schema.prisma",
      "--script",
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: "mysql://contract:contract@127.0.0.1:3306/contract",
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /UNIQUE INDEX `MattermostUserLink_mattermostUserId_key`/);
  assert.match(result.stdout, /UNIQUE INDEX `MattermostWorkspaceLink_mattermostTeamId_key`/);
  assert.match(result.stdout, /UNIQUE INDEX `MattermostConversationLink_mattermostChannelId_key`/);
  assert.match(result.stdout, /UNIQUE INDEX `MattermostMessageLink_mattermostPostId_key`/);
  assert.match(result.stdout, /UNIQUE INDEX `MattermostOutboxEvent_idempotencyKey_key`/);
  assert.match(result.stdout, /PRIMARY KEY \(`nonce`\)/);
  assert.match(result.stdout, /PRIMARY KEY \(`eventId`\)/);
  assert.match(result.stdout, /`pausedAt` DATETIME\(3\) NULL/);
});
