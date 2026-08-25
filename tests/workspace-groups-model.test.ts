import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("workspace groups, channel types, and group task assignments are modeled", async () => {
  const schema = await readFile(
    new URL("../prisma/schema.prisma", import.meta.url),
    "utf8",
  );
  const migration = await readFile(
    new URL(
      "../prisma/migrations/20260825180000_add_workspace_groups_and_channels/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(schema, /model WorkspaceGroup \{/);
  assert.match(schema, /model WorkspaceGroupMember \{/);
  assert.match(schema, /assigneeGroupId\s+String\?/);
  assert.match(schema, /enum ConversationType \{/);
  assert.match(migration, /CREATE TABLE `WorkspaceGroup`/);
  assert.match(migration, /INSERT INTO `Conversation`/);
  assert.match(migration, /INSERT INTO `ConversationParticipant`/);
});
