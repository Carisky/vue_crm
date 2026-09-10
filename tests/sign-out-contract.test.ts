import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("sign-out clears client state immediately without refetching queries", async () => {
  const component = await readFile(
    new URL("../components/auth/UserButton.vue", import.meta.url),
    "utf8",
  );
  assert.match(component, /keepalive: true/);
  assert.match(component, /authStore\.clear\(\)/);
  assert.match(component, /queryClient\.clear\(\)/);
  assert.doesNotMatch(component, /invalidateQueries|resetQueries/);
});

test("sign-out API returns data instead of redirecting fetch", async () => {
  const route = await readFile(
    new URL("../server/api/auth/sign-out.post.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /return \{ ok: true \}/);
  assert.doesNotMatch(route, /sendRedirect/);
});
