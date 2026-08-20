import assert from "node:assert/strict";
import test from "node:test";

import { buildWorkspaceInviteUrl } from "../lib/invite-url.ts";

test("keeps invite links on the origin where the authenticated session lives", () => {
  assert.equal(
    buildWorkspaceInviteUrl("http://85.11.79.242/", "workspace-1", "code-1"),
    "http://85.11.79.242/workspaces/workspace-1/join/code-1",
  );
  assert.equal(
    buildWorkspaceInviteUrl(
      "https://collab.tsl-silesia.com.pl",
      "workspace-1",
      "code-1",
    ),
    "https://collab.tsl-silesia.com.pl/workspaces/workspace-1/join/code-1",
  );
});

test("encodes workspace IDs and invite codes as path segments", () => {
  assert.equal(
    buildWorkspaceInviteUrl("https://crm.example", "workspace/a", "code ?"),
    "https://crm.example/workspaces/workspace%2Fa/join/code%20%3F",
  );
});
