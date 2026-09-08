import assert from "node:assert/strict";
import test from "node:test";

import { buildHomeDashboardPreview } from "../lib/home-dashboard.ts";

test("dashboard preview bounds every collection to a single-screen layout", () => {
  const result = buildHomeDashboardPreview({
    tasks: Array.from({ length: 10 }, (_, id) => ({ id })),
    projects: Array.from({ length: 12 }, (_, id) => ({ id })),
    members: Array.from({ length: 9 }, (_, id) => ({ id })),
  });

  assert.deepEqual(result.tasks.map(({ id }) => id), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(result.projects.map(({ id }) => id), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(result.members.map(({ id }) => id), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(result.remaining, { tasks: 4, projects: 4, members: 2 });
});
