import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("sign-in restores auth state before navigating", async () => {
  const component = await readFile(
    new URL("../components/auth/SignInCard.vue", import.meta.url),
    "utf8",
  );

  assert.match(component, /authStore\.setUser\(res\.user\)/);
  assert.match(
    component,
    /queryClient\.setQueryData\(\[(['"])auth\/me\1\], res\.user\)/,
  );
  assert.doesNotMatch(component, /refetchQueries/);
  assert.ok(
    component.indexOf("authStore.setUser(res.user)") <
      component.indexOf("navigateTo(getRedirectPath())"),
    "the authenticated user must be restored before route middleware runs",
  );
});

test("sign-in API returns the authenticated user", async () => {
  const route = await readFile(
    new URL("../server/api/auth/sign-in.post.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /user: event\.context\.user/);
});
