import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("project and workspace image URLs can store base64 uploads", async () => {
  const [schema, migration] = await Promise.all([
    readFile("prisma/schema.prisma", "utf8"),
    readFile(
      "prisma/migrations/20260908120000_expand_project_and_workspace_image_urls/migration.sql",
      "utf8",
    ),
  ]);

  assert.match(
    schema,
    /model Workspace\s*{[^}]*imageUrl\s+String\?\s+@db\.MediumText/s,
  );
  assert.match(
    schema,
    /model Project\s*{[^}]*imageUrl\s+String\?\s+@db\.MediumText/s,
  );
  assert.match(
    migration,
    /ALTER TABLE `Workspace` MODIFY `imageUrl` MEDIUMTEXT NULL/,
  );
  assert.match(
    migration,
    /ALTER TABLE `Project` MODIFY `imageUrl` MEDIUMTEXT NULL/,
  );
});
