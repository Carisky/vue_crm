import assert from "node:assert/strict";
import test from "node:test";
import {
  mattermostChannelName,
  mattermostTeamName,
  mattermostUsername,
} from "../server/lib/mattermost/identifiers.ts";

test("Mattermost identifiers are stable, valid, and collision resistant", () => {
  assert.equal(
    mattermostUsername("user-ABCDEF123456", "John.Doe+ops@example.com"),
    "john-doe-ops-abcdef1234",
  );
  assert.equal(
    mattermostTeamName("workspace-ABCDEF123456", "Śląsk Dispatch"),
    "slask-dispatch-abcdef1234",
  );
  assert.equal(
    mattermostChannelName("conversation-ABCDEF123456", "DIRECT"),
    "dm-abcdef1234",
  );
  assert.notEqual(
    mattermostTeamName("workspace-ABCDEF123456", "Dispatch"),
    mattermostTeamName("workspace-123456ABCDEF", "Dispatch"),
  );
});

test("Mattermost identifiers stay within the 64-character server limit", () => {
  const value = mattermostTeamName(
    "workspace-ABCDEF123456",
    "A very long workspace name that keeps going far beyond Mattermost limits",
  );

  assert.equal(value.length, 64);
  assert.match(value, /^[a-z0-9]+(?:-[a-z0-9]+)*-[a-z0-9]{10}$/);
});

test("Mattermost identifiers retain a valid prefix for empty normalized input", () => {
  assert.equal(
    mattermostUsername("user-ABCDEF123456", "💬@example.com"),
    "crm-abcdef1234",
  );
});

test("the CRM workspace conversation reuses Mattermost town-square", () => {
  assert.equal(
    mattermostChannelName("conversation-ABCDEF123456", "WORKSPACE"),
    "town-square",
  );
});
