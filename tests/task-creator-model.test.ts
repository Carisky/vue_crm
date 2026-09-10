import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("tasks persist and serialize their creator", async () => {
  const [schema, migration, serializer, createRoute] = await Promise.all([
    readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../prisma/migrations/20260910120000_add_task_creator/migration.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../server/lib/serializers.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../server/api/tasks/create.post.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(schema, /creatorId\s+String/);
  assert.match(schema, /creator\s+User\s+@relation\("TaskCreator"/);
  assert.match(migration, /`notification`\.`type` = 'TASK_CREATED'/);
  assert.match(
    migration,
    /SET `task`\.`creatorId` = \(\s*SELECT `notification`\.`actorId`/,
  );
  assert.match(
    migration,
    /SET `task`\.`creatorId` = `workspace`\.`ownerId`\s*WHERE `task`\.`creatorId` IS NULL/,
  );
  assert.ok(
    migration.indexOf("'TASK_CREATED'") <
      migration.indexOf("`workspace`.`ownerId`"),
    "notification actors must be applied before the owner fallback",
  );
  assert.match(serializer, /creator_id: task\.creatorId/);
  assert.match(serializer, /creator: task\.creator/);
  assert.match(createRoute, /creatorId: user\.id/);
});
