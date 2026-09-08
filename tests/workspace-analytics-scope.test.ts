import assert from "node:assert/strict";
import test from "node:test";

import { buildWorkspaceAnalyticsScopes } from "../server/lib/workspace-analytics-scope.ts";

test("project visibility filters projects and tasks but not workspace members", () => {
  assert.deepEqual(
    buildWorkspaceAnalyticsScopes("workspace-1", new Set(["project-1", "project-2"])),
    {
      projects: {
        workspaceId: "workspace-1",
        id: { in: ["project-1", "project-2"] },
      },
      members: { workspaceId: "workspace-1" },
      tasks: {
        workspaceId: "workspace-1",
        projectId: { in: ["project-1", "project-2"] },
      },
    },
  );
});
