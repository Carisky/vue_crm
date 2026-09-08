import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("project visibility stores a creator and unique direct user grants", async () => {
  const schema = await readFile("prisma/schema.prisma", "utf8");

  assert.match(schema, /enum ProjectVisibility\s*{[^}]*PUBLIC[^}]*PRIVATE[^}]*}/s);
  assert.match(
    schema,
    /visibility\s+ProjectVisibility\s+@default\(PUBLIC\)/,
  );
  assert.match(schema, /creatorId\s+String/);
  assert.match(
    schema,
    /model ProjectAccess\s*{[^}]*@@unique\(\[projectId, userId\]\)/s,
  );
});
