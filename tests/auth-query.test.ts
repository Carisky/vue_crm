import assert from "node:assert/strict";
import test from "node:test";

import { createAuthQuery } from "../stores/auth-query.ts";

const user = {
  id: "user-1",
  name: "Test User",
  email: "test@example.com",
  avatarUrl: null,
  monthlyWorkloadTargetHours: null,
  themePreference: "light" as const,
  locale: "en" as const,
  emailNotificationsEnabled: true,
};

test("loads the current user through the request-aware fetch dependency", async () => {
  const requests: string[] = [];
  const query = createAuthQuery(async (request) => {
    requests.push(request);
    return { user };
  });

  assert.deepEqual(await query(), user);
  assert.deepEqual(requests, ["/api/auth/me"]);
});

test("returns null when the server reports no active session", async () => {
  const query = createAuthQuery(async () => ({ user: null }));

  assert.equal(await query(), null);
});
