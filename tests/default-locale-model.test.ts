import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("new users default to Polish in the database", async () => {
  const [schema, migration] = await Promise.all([
    readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../prisma/migrations/20260910130000_default_user_locale_pl/migration.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assert.match(schema, /locale\s+String\s+@default\("pl"\)/);
  assert.match(migration, /DEFAULT 'pl'/);
});
