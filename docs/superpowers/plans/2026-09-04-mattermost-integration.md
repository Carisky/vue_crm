# CRM-Mattermost Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Build a production-ready two-way text-chat integration in which CRM controls Mattermost Team Edition users, credentials, workspaces, groups, channels, and membership, while preserving message authors and importing all CRM chat history.

**Architecture:** CRM stores external-ID links and a transactional outbox, calls Mattermost REST for identities and structure, and accepts signed idempotent callbacks. A server-only Mattermost plugin creates posts as mapped users and durably forwards new posts to CRM. The Mattermost deployment adds an nginx public gateway plus a loopback-only integration port and a destructive, explicitly confirmed bootstrap workflow.

**Tech Stack:** Nuxt 3, TypeScript 5.8, Node.js 24 test runner, Prisma 7 with MariaDB, Mattermost Team Edition 11.7.0, Go 1.25 in Docker, Mattermost server plugin API, nginx Alpine, Docker Compose v2, Python 3 runtime checks

**Spec:** docs/superpowers/specs/2026-09-03-mattermost-integration-design.md

## Global Constraints

- CRM is authoritative for users, passwords, workspaces, roles, groups, managed conversations, and participants.
- Mattermost Team Edition remains pinned to 11.7.0; do not switch to Entry or Enterprise Edition.
- Never write directly to Mattermost PostgreSQL.
- Public Mattermost listens on 0.0.0.0:8065; CRM-only Mattermost access listens on 127.0.0.1:8066.
- Mattermost failure never blocks an otherwise valid CRM login or returns 503 for valid CRM credentials.
- Never persist, queue, log, or place a plaintext password in an error.
- Only new plain-text root posts synchronize online. Reject files and threads in managed channels; block public post editing and deletion.
- Initial bootstrap imports all existing CRM text messages with original author and create time.
- Destructive bootstrap is a dry run unless --confirm-reset is present, and may target only volumes belonging to the resolved mattermost Compose project.
- Keep MATTERMOST_ADMIN_TOKEN, MATTERMOST_PLUGIN_SECRET,
  MATTERMOST_BOOTSTRAP_ADMIN_PASSWORD, and database credentials in ignored
  owner-only environment files.
- Every task follows red-green-refactor and ends with fresh focused tests before its commit.
- Run commands from C:/Users/user/VsCodeRepos/vue_crm unless the task explicitly selects C:/Users/user/VsCodeRepos/mattermost_setup_docker.

## File map

### vue_crm

- prisma/schema.prisma and prisma/migrations/20260904100000_add_mattermost_sync/migration.sql: links, outbox, receipts, and sync state.
- server/lib/mattermost/contracts.ts: event, callback, and API DTOs.
- server/lib/mattermost/identifiers.ts: deterministic usernames and team/channel names.
- server/lib/mattermost/signature.ts: HMAC canonicalization and verification.
- server/lib/mattermost/client.ts: authenticated timeout-bound REST client.
- server/lib/mattermost/account-sync.ts: in-memory credential synchronization.
- server/lib/mattermost/outbox.ts and dispatch.ts: durable delivery and retry.
- server/lib/mattermost/message-service.ts and inbound.ts: symmetric message flows.
- server/lib/mattermost/reconcile.ts and status.ts: repair and observability.
- server/api/integrations/mattermost: signed callback and status endpoints.
- scripts/mattermost-export.ts and mattermost-bootstrap.ts: snapshot and guarded reset/import.
- Existing auth, workspace, group, direct-conversation, and message endpoints: lifecycle hooks.
- tests/mattermost-*.test.ts: pure unit and contract coverage.

### mattermost_setup_docker

- plugin: server-only plugin source, Go tests, Docker build, and bundle.
- gateway/nginx.conf: public proxy and mutation blocks.
- scripts/install-plugin.sh and scripts/import-crm.sh: installation and import.
- compose.yaml, .env.example, Python validators, and README.md: deployment.

---

### Task 1: Persist Mattermost links, receipts, and outbox state

**Files:**

- Modify: prisma/schema.prisma
- Create: prisma/migrations/20260904100000_add_mattermost_sync/migration.sql
- Create: tests/mattermost-model.test.ts

**Interfaces:**

- Consumes: existing User, Workspace, Conversation, and ConversationMessage IDs.
- Produces: MattermostUserLink, MattermostWorkspaceLink,
  MattermostConversationLink, MattermostMessageLink, MattermostWebhookNonce,
  MattermostInboundEvent, MattermostOutboxEvent, and MattermostSyncControl.

- [ ] **Step 1: Write the failing schema contract test**

~~~ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Mattermost mappings and queues have idempotency constraints", async () => {
  const schema = await readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  assert.match(schema, /model MattermostUserLink \{/);
  assert.match(schema, /mattermostUserId\s+String\?\s+@unique/);
  assert.match(schema, /mattermostTeamId\s+String\s+@unique/);
  assert.match(schema, /mattermostChannelId\s+String\s+@unique/);
  assert.match(schema, /mattermostPostId\s+String\s+@unique/);
  assert.match(schema, /model MattermostWebhookNonce \{/);
  assert.match(schema, /nonce\s+String\s+@id/);
  assert.match(schema, /model MattermostSyncControl \{/);
  assert.match(schema, /pausedAt\s+DateTime\?/);
  assert.match(schema, /eventId\s+String\s+@id/);
  assert.match(schema, /idempotencyKey\s+String\s+@unique/);
});
~~~

- [ ] **Step 2: Run the model test and confirm RED**

Run: npm test -- --test-name-pattern="Mattermost mappings"

Expected: FAIL because MattermostUserLink is absent.

- [ ] **Step 3: Add the schema and matching SQL migration**

Add enums MattermostSyncState (PENDING, SYNCED, FAILED) and
MattermostOutboxState (PENDING, PROCESSING, COMPLETED, FAILED). Add one-to-one
links from User, Workspace, Conversation, and ConversationMessage. User link
has nullable unique mattermostUserId so a failed initial provision can still
record username and error. Workspace, conversation, and message external IDs
are required and unique. Outbox fields are kind, aggregateType, aggregateId,
idempotencyKey, payload Json, state, attempts, nextAttemptAt, lockedAt,
lastError, completedAt, createdAt, and updatedAt. Index
(state, nextAttemptAt) and (aggregateType, aggregateId, createdAt).
MattermostWebhookNonce has nonce as primary key, expiresAt, createdAt, and an
expiresAt index for replay claims. MattermostSyncControl is a global singleton
with key, pausedAt, pauseReason, snapshotCutoff, lastBootstrapAt,
lastBootstrapState, lastBootstrapSummary Json, and updatedAt; it contains no
secret values.

Create the fixed migration with MySQL enum columns, JSON payload, all foreign
keys, unique indexes, the two outbox indexes, and an idempotent insert of the
global MattermostSyncControl row.

- [ ] **Step 4: Generate the client and confirm GREEN**

~~~powershell
npx prisma format
npx prisma generate
npm test -- --test-name-pattern="Mattermost mappings"
npm run typecheck
~~~

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

~~~powershell
git add prisma/schema.prisma prisma/migrations/20260904100000_add_mattermost_sync/migration.sql tests/mattermost-model.test.ts
git commit -m "feat: model Mattermost synchronization state"
~~~

### Task 2: Define deterministic identifiers and event contracts

**Files:**

- Create: server/lib/mattermost/contracts.ts
- Create: server/lib/mattermost/identifiers.ts
- Create: tests/mattermost-identifiers.test.ts

**Interfaces:**

- Produces: mattermostUsername, mattermostTeamName, mattermostChannelName,
  MattermostEventKind, PluginCreatePostRequest, PluginPostEvent, and
  MattermostSyncResult.

- [ ] **Step 1: Write failing identifier tests**

~~~ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  mattermostChannelName,
  mattermostTeamName,
  mattermostUsername,
} from "../server/lib/mattermost/identifiers.ts";

test("identifiers are stable, valid, and collision resistant", () => {
  assert.equal(mattermostUsername("user-ABCDEF123456", "John.Doe+ops@example.com"), "john-doe-ops-abcdef1234");
  assert.equal(mattermostTeamName("workspace-ABCDEF123456", "Śląsk Dispatch"), "slask-dispatch-abcdef1234");
  assert.equal(mattermostChannelName("conversation-ABCDEF123456", "DIRECT"), "dm-abcdef1234");
});
~~~

- [ ] **Step 2: Run and confirm RED**

Run: node --test --experimental-strip-types tests/mattermost-identifiers.test.ts

Expected: FAIL with ERR_MODULE_NOT_FOUND.

- [ ] **Step 3: Implement identifiers and contracts**

Use Unicode NFKD normalization, remove combining marks, replace invalid runs
with hyphens, keep a stable 10-character ID suffix, and use crm for an empty
prefix. Define exactly:

~~~ts
export type MattermostEventKind =
  | "workspace.upsert"
  | "workspace.delete"
  | "membership.upsert"
  | "membership.delete"
  | "conversation.upsert"
  | "conversation.delete"
  | "message.create"
  | "user.activate"
  | "user.deactivate";

export type PluginCreatePostRequest = {
  event_id: string;
  crm_message_id: string;
  mattermost_channel_id: string;
  mattermost_user_id: string;
  message: string;
};

export type PluginPostEvent = {
  event_id: string;
  post_id: string;
  channel_id: string;
  user_id: string;
  message: string;
  create_at: number;
};

export type MattermostSyncResult =
  | { ok: true; userId?: string }
  | { ok: false; retryable: boolean; message: string };
~~~

- [ ] **Step 4: Verify and commit**

~~~powershell
node --test --experimental-strip-types tests/mattermost-identifiers.test.ts
npm test
npm run typecheck
git add server/lib/mattermost/contracts.ts server/lib/mattermost/identifiers.ts tests/mattermost-identifiers.test.ts
git commit -m "feat: define Mattermost integration contracts"
~~~

Expected: tests and typecheck pass before commit.

### Task 3: Implement HMAC signing and the Mattermost REST client

**Files:**

- Create: server/lib/mattermost/signature.ts
- Create: server/lib/mattermost/client.ts
- Create: tests/mattermost-signature.test.ts
- Create: tests/mattermost-client.test.ts
- Modify: nuxt.config.ts
- Modify: env.d.ts
- Modify: .env.example

**Interfaces:**

- Produces: signMattermostRequest, verifyMattermostRequest, MattermostClient,
  and getMattermostConfig.

- [ ] **Step 1: Write failing signature tests**

Use method POST, path /api/integrations/mattermost/events, timestamp
1788451200000, nonce nonce-1, body {"event_id":"evt-1"}, and secret
test-secret. Assert same input verifies, changed body fails, timestamps older
than 300000 ms fail, and an injected hasSeenNonce callback rejects reuse.

- [ ] **Step 2: Run and confirm RED**

Run: node --test --experimental-strip-types tests/mattermost-signature.test.ts

Expected: FAIL with ERR_MODULE_NOT_FOUND.

- [ ] **Step 3: Implement canonical HMAC**

Canonical bytes are timestamp, nonce, uppercase method, path, and raw body,
joined by newline. Use SHA-256 HMAC and timingSafeEqual on equal-length buffers.
Check the five-minute clock window before the nonce callback.

- [ ] **Step 4: Write REST-client tests and implementation**

The fake fetch asserts Bearer authorization, JSON content type, AbortSignal,
URL-encoded email, and redacted errors. A token-provider test atomically
replaces the ignored runtime-env fixture and confirms the next request uses the
new token without recreating the client. It also asserts two retries of one
plugin event keep event_id but use different valid HMAC nonces. Implement:

~~~ts
getUserByEmail(email: string): Promise<MattermostUser | null>
createUser(input: { email: string; username: string; password: string }): Promise<MattermostUser>
setUserPassword(userId: string, password: string): Promise<void>
setUserActive(userId: string, active: boolean): Promise<void>
getTeamByName(name: string): Promise<MattermostTeam | null>
createTeam(input: { name: string; display_name: string }): Promise<MattermostTeam>
updateTeam(teamId: string, input: { display_name: string }): Promise<MattermostTeam>
deleteTeam(teamId: string): Promise<void>
addTeamMember(teamId: string, userId: string): Promise<void>
removeTeamMember(teamId: string, userId: string): Promise<void>
updateTeamMemberRoles(teamId: string, userId: string, roles: "team_user" | "team_user team_admin"): Promise<void>
getChannelByName(teamId: string, name: string): Promise<MattermostChannel | null>
createChannel(input: MattermostChannelCreate): Promise<MattermostChannel>
patchChannel(channelId: string, input: MattermostChannelPatch): Promise<MattermostChannel>
deleteChannel(channelId: string): Promise<void>
addChannelMember(channelId: string, userId: string): Promise<void>
removeChannelMember(channelId: string, userId: string): Promise<void>
createManagedPost(input: PluginCreatePostRequest): Promise<{ id: string }>
replaceManagedChannels(channelIds: string[]): Promise<void>
getPluginHealth(): Promise<{ id: string; version: string }>
listUsers(page: number, perPage: number): Promise<MattermostUser[]>
listTeams(page: number, perPage: number): Promise<MattermostTeam[]>
listTeamMembers(teamId: string, page: number, perPage: number): Promise<MattermostTeamMember[]>
listChannelsForTeam(teamId: string, page: number, perPage: number): Promise<MattermostChannel[]>
listChannelMembers(channelId: string, page: number, perPage: number): Promise<MattermostChannelMember[]>
listChannelPosts(channelId: string, page: number, perPage: number): Promise<MattermostPostPage>
~~~

Admin REST methods use Bearer authentication. Plugin methods use Task 3 HMAC
and generate a fresh cryptographic nonce and timestamp on every HTTP attempt;
the logical event_id stays stable across retries.

Add private runtime variables MATTERMOST_INTERNAL_URL,
MATTERMOST_ADMIN_TOKEN, MATTERMOST_PLUGIN_SECRET, MATTERMOST_SYNC_ENABLED,
MATTERMOST_PLUGIN_ID, MATTERMOST_CALLBACK_URL, and
MATTERMOST_RUNTIME_ENV_FILE to Nuxt config, env.d.ts, and .env.example. Resolve
the admin token for every REST request: prefer MATTERMOST_RUNTIME_ENV_FILE's
MATTERMOST_ADMIN_TOKEN value, fall back to the process variable, validate the
configured file path, and never cache or log either value.

- [ ] **Step 5: Verify and commit**

~~~powershell
node --test --experimental-strip-types tests/mattermost-signature.test.ts tests/mattermost-client.test.ts
npm test
npm run typecheck
git add server/lib/mattermost/signature.ts server/lib/mattermost/client.ts tests/mattermost-signature.test.ts tests/mattermost-client.test.ts nuxt.config.ts env.d.ts .env.example
git commit -m "feat: add secure Mattermost API transport"
~~~

Expected: all commands exit 0 and output contains no token or secret.

### Task 4: Synchronize credentials without blocking CRM

**Files:**

- Create: server/lib/mattermost/account-sync.ts
- Create: tests/mattermost-account-sync.test.ts
- Modify: server/api/auth/sign-up.post.ts
- Modify: server/api/auth/sign-in.post.ts
- Modify: server/api/auth/verify-email.get.ts
- Modify: server/lib/password-reset.ts
- Modify: components/auth/SignInCard.vue

**Interfaces:**

- Produces: synchronizeMattermostCredentials(input, deps) and
  activateLinkedMattermostUser(userId).

- [ ] **Step 1: Write failing service tests**

Cover existing-email password update, missing-email create, verified
activation, unverified deactivation, timeout as non-fatal retryable failure,
and an assertion that saveFailure receives no password property.

- [ ] **Step 2: Run and confirm RED**

Run: node --test --experimental-strip-types tests/mattermost-account-sync.test.ts

Expected: FAIL because account-sync.ts is absent.

- [ ] **Step 3: Implement the dependency-injected service**

~~~ts
export type CredentialSyncInput = {
  user: { id: string; email: string; emailVerifiedAt: Date | null };
  password: string;
};

export type AccountSyncDeps = {
  client: Pick<MattermostClient, "getUserByEmail" | "createUser" | "setUserPassword" | "setUserActive">;
  saveSuccess(input: { userId: string; mattermostUserId: string; username: string }): Promise<void>;
  saveFailure(input: { userId: string; username: string; message: string }): Promise<void>;
};
~~~

Password may appear only in CredentialSyncInput and direct client calls.

- [ ] **Step 4: Wire lifecycle and warning UI**

Sign-up attempts create then deactivate without failing CRM. Sign-in attempts
upsert/password/activation, always creates the CRM session, and returns
mattermost_sync as synced or pending. Email verification activates an existing
link and records failure without changing redirect success. Password reset
attempts sync while the new password is still in request memory. SignInCard
shows a warning toast only for pending.

- [ ] **Step 5: Verify and commit**

~~~powershell
node --test --experimental-strip-types tests/mattermost-account-sync.test.ts tests/password-reset-service.test.ts
npm test
npm run typecheck
git add server/lib/mattermost/account-sync.ts tests/mattermost-account-sync.test.ts server/api/auth/sign-up.post.ts server/api/auth/sign-in.post.ts server/api/auth/verify-email.get.ts server/lib/password-reset.ts components/auth/SignInCard.vue
git commit -m "feat: synchronize CRM credentials with Mattermost"
~~~

Expected: all commands exit 0.

### Task 5: Build the transactional outbox worker

**Files:**

- Create: server/lib/mattermost/outbox.ts
- Create: server/lib/mattermost/dispatch.ts
- Create: tests/mattermost-outbox.test.ts
- Modify: server/cron.ts

**Interfaces:**

- Produces: enqueueMattermostEvent, claimMattermostEvents,
  processMattermostOutbox, computeMattermostRetry, and dispatchMattermostEvent.

- [ ] **Step 1: Write failing policy tests**

Use an in-memory repository. Assert duplicate idempotency keys insert one
event, aggregate order prevents overtaking, retryable failures return to
PENDING, non-retryable failures become FAILED, locks older than 10 minutes are
reclaimed, completed events retain completedAt, and a message with an existing
MattermostMessageLink completes without a remote call. Assert a persisted
MattermostSyncControl pause makes the worker return without claiming events.

- [ ] **Step 2: Run and confirm RED**

Run: node --test --experimental-strip-types tests/mattermost-outbox.test.ts

Expected: FAIL because outbox.ts is absent.

- [ ] **Step 3: Implement claim and retry**

Use batch size 50, stale-lock window 10 minutes, maximum 12 attempts, and:

~~~ts
export function computeMattermostRetry(attempt: number, random = Math.random) {
  const baseMs = Math.min(60 * 60_000, 5_000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(baseMs * (0.75 + random() * 0.5));
}
~~~

Claim inside a short Prisma transaction, dispatch outside it, and finalize with
a state-plus-lock guard.

- [ ] **Step 4: Implement dispatch and scheduler registration**

Handle every MattermostEventKind. Upserts load current CRM state; delete
payloads carry external IDs captured before deletion. Missing dependency links,
HTTP 408, 409, 429, and 5xx retry. HTTP 400, 401, 403, and 422 become terminal.
User/team/channel creation first looks up the deterministic email or name and
re-reads after an ambiguous create failure, so a timeout after remote commit
does not create a second entity. General resolves the team's existing
town-square channel; GROUP and DIRECT conversations become private channels
whose exact desired membership is applied. A pre-existing message link is success.
Register every minute as mattermost-outbox and return immediately unless
MATTERMOST_SYNC_ENABLED is exactly true and the persisted sync control is not
paused.

- [ ] **Step 5: Verify and commit**

~~~powershell
node --test --experimental-strip-types tests/mattermost-outbox.test.ts
npm test
npm run typecheck
git add server/lib/mattermost/outbox.ts server/lib/mattermost/dispatch.ts tests/mattermost-outbox.test.ts server/cron.ts
git commit -m "feat: process Mattermost synchronization outbox"
~~~

Expected: all checks pass before commit.

### Task 6: Emit structure changes atomically

**Files:**

- Create: server/lib/mattermost/domain-events.ts
- Create: tests/mattermost-domain-events.test.ts
- Create: tests/mattermost-account-state-events.test.ts
- Modify: server/lib/email-verification-cleanup.ts
- Modify: server/api/workspaces/create.post.ts
- Modify: server/api/workspaces/[workspaceId]/update.patch.ts
- Modify: server/api/workspaces/[workspaceId]/delete.delete.ts
- Modify: server/api/workspaces/[workspaceId]/join.post.ts
- Modify: server/api/workspaces/remove-member.delete.ts
- Modify: server/api/workspaces/update-member.patch.ts
- Modify: server/api/workspaces/[workspaceId]/groups.post.ts
- Modify: server/api/workspaces/[workspaceId]/groups/[groupId].patch.ts
- Modify: server/api/workspaces/[workspaceId]/groups/[groupId].delete.ts
- Modify: server/api/messages/conversations/direct.post.ts

**Interfaces:**

- Produces: enqueueWorkspaceUpsert/Delete, enqueueMembershipUpsert/Delete,
  enqueueConversationUpsert/Delete, and enqueueUserActivate/Deactivate.

- [ ] **Step 1: Write failing event-shape tests**

~~~ts
assert.equal(workspaceUpsertKey("ws-1", 3), "workspace.upsert:ws-1:3");
assert.equal(membershipKey("ws-1", "user-1", "upsert"), "membership.upsert:ws-1:user-1");
assert.equal(conversationKey("conv-1", "upsert"), "conversation.upsert:conv-1");
~~~

Also assert deletion payloads contain remote IDs loaded before domain deletion,
and expired unverified-account cleanup enqueues user.deactivate without storing
a password before deleting the CRM user.

- [ ] **Step 2: Run and confirm RED**

Run: node --test --experimental-strip-types tests/mattermost-domain-events.test.ts

Expected: FAIL because domain-events.ts is absent.

- [ ] **Step 3: Implement builders**

Builders accept Prisma.TransactionClient and call enqueueMattermostEvent.
Upserts contain CRM IDs. Deletes contain mattermost_team_id or
mattermost_channel_id plus CRM IDs. Membership aggregates use workspaceId:userId.

- [ ] **Step 4: Make lifecycle writes atomic**

Preserve existing permission checks and realtime broadcasts. Wrap each domain
mutation and enqueue in one transaction. Workspace creation queues workspace,
owner membership, and General conversation; its dispatcher reuses the team's
existing town-square channel. Group mutation queues its private conversation
with the complete desired participant set. Direct conversation queues only on
first creation. Workspace-member removal also queues every affected managed
conversation so stale private-channel membership cannot return after rejoin.
Delete routes read their link before removing the domain row. Email-verification cleanup
captures the linked Mattermost user ID and queues deactivation in the same
transaction before deleting an expired unverified CRM account. Verification
and verified login reuse Task 4's synchronous activation path.

- [ ] **Step 5: Verify and commit**

~~~powershell
node --test --experimental-strip-types tests/mattermost-domain-events.test.ts tests/mattermost-account-state-events.test.ts tests/member-removal-policy.test.ts tests/member-role-policy.test.ts tests/workspace-groups-model.test.ts
npm test
npm run typecheck
git add server/lib/mattermost/domain-events.ts tests/mattermost-domain-events.test.ts tests/mattermost-account-state-events.test.ts server/lib/email-verification-cleanup.ts server/api/workspaces server/api/messages/conversations/direct.post.ts
git commit -m "feat: enqueue Mattermost structure changes"
~~~

Expected: all commands exit 0.

### Task 7: Centralize CRM message creation

**Files:**

- Create: server/lib/mattermost/message-service.ts
- Create: tests/mattermost-message-service.test.ts
- Modify: server/api/messages/conversations/[conversationId]/messages.post.ts
- Modify: server/api/telegram/mini/conversations/[conversationId]/messages.post.ts

**Interfaces:**

- Produces: createLocalConversationMessage(input, deps), atomically writing the
  message, read state, conversation timestamp, and message.create outbox event.

- [ ] **Step 1: Write the failing transaction-order test**

~~~ts
assert.deepEqual(log, [
  "message.create",
  "participant.mark-read",
  "conversation.touch",
  "outbox:message.create",
  "transaction.commit",
]);
assert.equal(result.message.id, "message-1");
assert.equal(result.workspaceId, "workspace-1");
~~~

Assert the idempotency key is message.create:message-1.

- [ ] **Step 2: Run and confirm RED**

Run: node --test --experimental-strip-types tests/mattermost-message-service.test.ts

Expected: FAIL because message-service.ts is absent.

- [ ] **Step 3: Implement the service**

Input is conversationId, senderId, body, and optional createdAt. Dependencies
provide authorization, transaction, and enqueue. Default createdAt to new Date.
Return the included sender and workspace ID.

- [ ] **Step 4: Replace duplicate HTTP and Telegram writes**

Both endpoints call createLocalConversationMessage, then preserve current
conversation and inbox broadcasts. Neither endpoint enqueues separately.

- [ ] **Step 5: Verify and commit**

~~~powershell
node --test --experimental-strip-types tests/mattermost-message-service.test.ts
npm test
npm run typecheck
git add server/lib/mattermost/message-service.ts tests/mattermost-message-service.test.ts server/api/messages server/api/telegram/mini/conversations
git commit -m "feat: enqueue CRM chat messages for Mattermost"
~~~

Expected: all checks pass.

### Task 8: Accept signed, idempotent Mattermost callbacks

**Files:**

- Create: server/lib/mattermost/inbound.ts
- Create: server/api/integrations/mattermost/events.post.ts
- Create: tests/mattermost-inbound.test.ts
- Modify: server/middleware/basic-auth.ts

**Interfaces:**

- Produces: ingestMattermostPost(event, deps) returning duplicate and optional
  messageId.

- [ ] **Step 1: Write failing inbound tests**

Cover valid mapped-member creation, duplicate event acknowledgement, duplicate
post acknowledgement, unknown channel, unknown user, revoked participant,
create_at preservation, and realtime broadcast only after transaction commit.

- [ ] **Step 2: Run and confirm RED**

Run: node --test --experimental-strip-types tests/mattermost-inbound.test.ts

Expected: FAIL because inbound.ts is absent.

- [ ] **Step 3: Implement one idempotent transaction**

Claim event_id, resolve conversation by channel_id, resolve user by user_id,
require ConversationParticipant, create ConversationMessage with
new Date(create_at), create MattermostMessageLink with origin MATTERMOST, and
touch Conversation. Treat Prisma P2002 on event or post ID as duplicate success.
Broadcast after commit.

- [ ] **Step 4: Implement the raw-body handler**

Read raw UTF-8 body once. Verify x-crm-timestamp, x-crm-nonce, and
x-crm-signature for the exact request path. Atomically claim the nonce in
MattermostWebhookNonce until the five-minute signature window expires; reject a
replayed nonce with 401. A retry must use a fresh nonce while retaining the
same event_id. Validate PluginPostEvent with zod. Return 202 for a new event and
200 for a duplicate event_id. Delete expired nonce rows on each scheduler pass.
Exempt only this exact route from built-in Basic Auth.

- [ ] **Step 5: Verify and commit**

~~~powershell
node --test --experimental-strip-types tests/mattermost-signature.test.ts tests/mattermost-inbound.test.ts
npm test
npm run typecheck
git add server/lib/mattermost/inbound.ts server/api/integrations/mattermost/events.post.ts tests/mattermost-inbound.test.ts server/middleware/basic-auth.ts
git commit -m "feat: ingest Mattermost posts into CRM"
~~~

Expected: all commands exit 0.

### Task 9: Scaffold the server-only Mattermost plugin

Run from C:/Users/user/VsCodeRepos/mattermost_setup_docker.

**Files:**

- Create: plugin/plugin.json
- Create: plugin/go.mod
- Create: plugin/go.sum
- Create: plugin/server/main.go
- Create: plugin/server/plugin.go
- Create: plugin/server/configuration.go
- Create: plugin/server/signature.go
- Create: plugin/server/http.go
- Create: plugin/server/signature_test.go
- Create: plugin/server/http_test.go
- Create: plugin/Dockerfile
- Create: plugin/Makefile
- Modify: .gitignore

**Interfaces:**

- Produces: GET /api/v1/health, PUT /api/v1/managed-channels, and POST
  /api/v1/posts under plugin com.tsl-silesia.crm-sync.

- [ ] **Step 1: Add manifest and failing signature tests**

Manifest version is 0.1.0, minimum server version is 11.7.0, and executable is
server/dist/plugin-linux-amd64. Go tests use the Task 3 fixed signing vector and
reject changed body and expired timestamps.

- [ ] **Step 2: Run Docker tests and confirm RED**

Run: docker build -f plugin/Dockerfile --target test plugin

Expected: non-zero because signing and routes are absent.

- [ ] **Step 3: Implement lifecycle and signing**

Pin github.com/mattermost/mattermost/server/public v0.1.21 and
github.com/stretchr/testify v1.11.1. Embed plugin.MattermostPlugin. OnActivate
loads CallbackURL and SharedSecret and starts a cancellable worker context.
OnDeactivate cancels and waits. main.go calls plugin.ClientMain with Plugin.

- [ ] **Step 4: Implement authenticated routes**

POST posts accepts event_id, crm_message_id, mattermost_channel_id,
mattermost_user_id, and message. Verify HMAC, managed-channel membership, and
GetChannelMember. Create a model.Post with crm_origin=crm and crm_message_id in
Props. KV key crm-post:<crm_message_id> makes repeats return the original post
ID. Claim every request nonce in plugin KV with a six-minute expiry; reject a
reused nonce while allowing an event_id retry signed with a fresh nonce. PUT
managed-channels atomically replaces a JSON ID set. GET health returns
plugin ID/version only.

- [ ] **Step 5: Build and verify a reproducible bundle**

Docker stages use golang:1.25-alpine for go test ./server/... and a static
linux-amd64 binary, then package plugin.json and binary as
com.tsl-silesia.crm-sync-0.1.0.tar.gz.

~~~powershell
docker build -f plugin/Dockerfile --target test plugin
docker build -f plugin/Dockerfile --output type=local,dest=plugin/dist plugin
tar -tf plugin/dist/com.tsl-silesia.crm-sync-0.1.0.tar.gz
~~~

Expected: tests pass and archive contains manifest and Linux executable.

- [ ] **Step 6: Commit**

~~~powershell
git add plugin .gitignore
git commit -m "feat: add CRM sync Mattermost plugin"
~~~

### Task 10: Add plugin post filtering and durable delivery

Run from C:/Users/user/VsCodeRepos/mattermost_setup_docker.

**Files:**

- Create: plugin/server/hooks.go
- Create: plugin/server/queue.go
- Create: plugin/server/hooks_test.go
- Create: plugin/server/queue_test.go
- Modify: plugin/server/plugin.go

**Interfaces:**

- Produces: MessageWillBePosted, MessageWillBeUpdated,
  MessageHasBeenPosted, enqueueCallback, and runCallbackWorker.

- [ ] **Step 1: Write failing hook tests**

Assert unmanaged text passes, managed root text passes, managed thread/file
post is rejected, crm_origin=crm is not enqueued, ordinary committed user post
becomes PluginPostEvent, system post is ignored, and managed edit is rejected.

- [ ] **Step 2: Write failing queue tests**

With fake KV and httptest server, assert KVSet precedes HTTP, 2xx deletes,
500 retains/increments, duplicate post uses one key, HMAC matches Task 3, and
context cancellation stops delivery.

- [ ] **Step 3: Run and confirm RED**

Run: docker build -f plugin/Dockerfile --target test plugin

Expected: FAIL because hooks and queue are absent.

- [ ] **Step 4: Implement hooks and queue**

Use callback:<post_id> keys with event, attempts, and next_attempt_at. Scan due
keys every second, deliver at most 20, use five-second HTTP timeout, and backoff
from five seconds to one hour with 0.75-1.25 jitter. Generate a fresh
cryptographic nonce and timestamp for every HTTP delivery attempt while
retaining the stable event_id. Logs contain IDs, attempts, and sanitized status
only.

- [ ] **Step 5: Verify and commit**

~~~powershell
docker build -f plugin/Dockerfile --target test plugin
docker build -f plugin/Dockerfile --output type=local,dest=plugin/dist plugin
git add plugin/server plugin/go.mod plugin/go.sum
git commit -m "feat: relay managed Mattermost posts to CRM"
~~~

Expected: all Go tests pass.

### Task 11: Add the public gateway and package the plugin

Run from C:/Users/user/VsCodeRepos/mattermost_setup_docker.

**Files:**

- Create: gateway/nginx.conf
- Create: scripts/install-plugin.sh
- Modify: compose.yaml
- Modify: .env.example
- Modify: tests/validate_compose.py
- Modify: tests/validate_runtime.py

**Interfaces:**

- Produces: public http://0.0.0.0:8065, private
  http://127.0.0.1:8066, plugin build, and local-mode installation.

- [ ] **Step 1: Change structural tests first**

Assert nginx:1.29-alpine gateway at 0.0.0.0:8065, Mattermost at
127.0.0.1:8066 to container 8065, no PostgreSQL port, plugin build profile,
disabled open server/user creation/email signup/forgot password, enabled email
login/plugins/local mode/user access tokens, and read-only nginx.conf mount.

- [ ] **Step 2: Run and confirm RED**

Run: python tests/validate_compose.py

Expected: FAIL because gateway is absent.

- [ ] **Step 3: Implement exact gateway policy**

Proxy ordinary HTTP and WebSocket Upgrade to mattermost:8065. Return 403 for:

- POST /api/v4/users
- POST /api/v4/users/password/reset/send
- POST /api/v4/users/password/reset
- PUT /api/v4/users/<id>/password
- PUT and DELETE /api/v4/posts/<id>
- plugin /api/v1 mutations under com.tsl-silesia.crm-sync

Allow POST /api/v4/users/login, post creation, and plugin GET health. Set body
size and proxy timeouts explicitly.

- [ ] **Step 4: Update Compose and plugin installation**

Add gateway and loopback bindings. Set MM_TEAMSETTINGS_ENABLEOPENSERVER,
MM_TEAMSETTINGS_ENABLEUSERCREATION, MM_EMAILSETTINGS_ENABLESIGNUPWITHEMAIL, and
MM_PASSWORDSETTINGS_ENABLEFORGOTPASSWORDLINK to false. Set
MM_EMAILSETTINGS_ENABLESIGNINWITHEMAIL, MM_PLUGINSETTINGS_ENABLE,
MM_SERVICESETTINGS_ENABLELOCALMODE, and MM_SERVICESETTINGS_ENABLEUSERACCESSTOKENS
to true. User access tokens are only for the loopback-protected
bootstrap/admin token.
Add a plugin-build profile. install-plugin.sh builds/copies the archive and runs:

~~~sh
/mattermost/bin/mmctl plugin add --force /tmp/com.tsl-silesia.crm-sync-0.1.0.tar.gz --local
/mattermost/bin/mmctl plugin enable com.tsl-silesia.crm-sync --local
~~~

Configure CallbackURL and SharedSecret from environment without printing them.

- [ ] **Step 5: Verify and commit**

~~~powershell
python tests/validate_compose.py
docker compose config --quiet
docker compose --profile build run --rm plugin-build
git add gateway scripts/install-plugin.sh compose.yaml .env.example tests/validate_compose.py tests/validate_runtime.py
git commit -m "feat: secure Mattermost behind integration gateway"
~~~

Expected: config checks pass; runtime validator on a disposable stack confirms
ping, login allowed, public mutations 403, private health 200, and plugin
mutation hidden publicly.

### Task 12: Export a deterministic bulk-import snapshot

**Files:**

- Create: scripts/mattermost-export.ts
- Create: server/lib/mattermost/export.ts
- Create: tests/mattermost-export.test.ts
- Modify: package.json
- Modify: package-lock.json

**Interfaces:**

- Produces: buildMattermostImport(snapshot), ordered JSONL, ZIP archive, and
  non-secret manifest.

- [ ] **Step 1: Write failing exporter tests**

Fixture: two users, one workspace, General, one group, one DIRECT channel, and
three messages. Assert version first; teams before channels, channels before
users, users before posts; General town-square type O; other channels type P;
correct memberships; original author/message/create_at; deterministic bytes;
manifest counts and snapshotCutoff.

- [ ] **Step 2: Run and confirm RED**

Run: node --test --experimental-strip-types tests/mattermost-export.test.ts

Expected: FAIL because export.ts is absent.

- [ ] **Step 3: Implement pure JSONL generation**

Generate bootstrap passwords from injected randomBytes. Never put them in the
manifest or stdout. Put crm_message_id and crm_origin=bootstrap in post props.
Sort immutable entities by CRM ID and messages by createdAt then ID. Output
Mattermost bulk-load order exactly. Export unverified CRM users as inactive and
verified users as active.

- [ ] **Step 4: Implement database CLI**

Read rows in a repeatable-read Prisma transaction and capture snapshotCutoff
before the first query. Create a temporary directory with mkdtemp under the
configured import root, write owner-only JSONL, ZIP it, remove plaintext JSONL,
and print archive path plus counts only. Add:

~~~json
"mattermost:export": "tsx scripts/mattermost-export.ts"
~~~

- [ ] **Step 5: Verify and commit**

~~~powershell
node --test --experimental-strip-types tests/mattermost-export.test.ts
npm test
npm run typecheck
git add server/lib/mattermost/export.ts scripts/mattermost-export.ts tests/mattermost-export.test.ts package.json package-lock.json
git commit -m "feat: export CRM chats for Mattermost import"
~~~

Expected: all checks pass.

### Task 13: Add guarded reset, import, and link resolution

**Files:**

- Create: scripts/mattermost-bootstrap.ts
- Create: server/lib/mattermost/bootstrap-policy.ts
- Create: server/lib/mattermost/link-resolution.ts
- Create: tests/mattermost-bootstrap-policy.test.ts
- Create: tests/mattermost-link-resolution.test.ts
- Create in mattermost_setup_docker: scripts/import-crm.sh
- Modify: package.json
- Modify: package-lock.json

**Interfaces:**

- Produces: npm run users:mattermost-up as dry run and confirmed reset/import
  with --confirm-reset.

- [ ] **Step 1: Write failing safety tests**

Assert refusal for unresolved compose directory, project name other than
mattermost, a volume lacking project label mattermost, unexpected volume set,
incomplete secret variables, or unreachable CRM. Assert dry run never invokes
stop, remove, create, or import executors. Assert confirmed execution persists
the pause before reset, writes no secret to stdout/argv/database, atomically
replaces only the configured ignored runtime-env file with mode 0600, and does
not resume a failed bootstrap.

- [ ] **Step 2: Run and confirm RED**

Run: node --test --experimental-strip-types tests/mattermost-bootstrap-policy.test.ts

Expected: FAIL because bootstrap-policy.ts is absent.

- [ ] **Step 3: Implement fixed phases and safe process spawning**

Resolve MATTERMOST_COMPOSE_DIR with realpath. Parse docker compose config and
docker volume inspect JSON. Spawn executable plus argument arrays, never a
composed shell string. In preflight, run mmctl import --help inside the pinned
Team Edition image and refuse every reset if the import command is unavailable.
Use phases preflight, reset, start, plugin, import, and resolve-and-reconcile.
Dry run executes preflight only. Confirmed mode disables
worker processing through MattermostSyncControl, runs compose down without
--volumes in the resolved project,
then removes only the previously validated named volume IDs with explicit
docker volume rm argument arrays. It starts clean services, waits five minutes,
creates the local bootstrap admin and access token without argv secrets, and
atomically writes MATTERMOST_ADMIN_TOKEN and the generated bootstrap password
to the configured ignored runtime-env file with owner-only permissions. It then
installs the plugin, imports, resolves, reconciles, drains post-cutoff events,
records a sanitized bootstrap summary, and clears the pause only after every
phase succeeds. Failure records a sanitized state and leaves synchronization
paused while all CRM features and outbox inserts remain available.

- [ ] **Step 4: Implement importer and link resolver**

import-crm.sh accepts a resolved ZIP inside MATTERMOST_IMPORT_DIR, copies it to
the container, runs mmctl import process --bypass-upload with local mode, polls
the returned job to success, and removes the container copy.

link-resolution.ts pages through users, teams, channels, and posts. Match
deterministic names and crm_message_id props only. Upsert links and reject
duplicate remote IDs. Do not match on mutable text or timestamp.

- [ ] **Step 5: Add scripts and verify dry run**

~~~json
"users:mattermost-up": "tsx scripts/mattermost-bootstrap.ts"
~~~

~~~powershell
node --test --experimental-strip-types tests/mattermost-bootstrap-policy.test.ts tests/mattermost-link-resolution.test.ts
npm run users:mattermost-up
npm test
npm run typecheck
~~~

Expected: tests pass; command prints DRY RUN and invokes no destructive action.

- [ ] **Step 6: Commit each repository**

In vue_crm:

~~~powershell
git add scripts/mattermost-bootstrap.ts server/lib/mattermost/bootstrap-policy.ts server/lib/mattermost/link-resolution.ts tests/mattermost-bootstrap-policy.test.ts tests/mattermost-link-resolution.test.ts package.json package-lock.json
git commit -m "feat: add guarded Mattermost bootstrap"
~~~

In mattermost_setup_docker:

~~~powershell
git add scripts/import-crm.sh
git commit -m "feat: add guarded CRM history import"
~~~

### Task 14: Reconcile managed structure and report status

**Files:**

- Create: server/lib/mattermost/reconcile.ts
- Create: server/lib/mattermost/status.ts
- Create: scripts/mattermost-reconcile.ts
- Create: scripts/mattermost-status.ts
- Create: server/api/integrations/mattermost/status.get.ts
- Create: tests/mattermost-reconcile.test.ts
- Create: tests/mattermost-status.test.ts
- Modify: server/cron.ts
- Modify: package.json
- Modify: package-lock.json

**Interfaces:**

- Produces: reconcileMattermost, getMattermostStatus, operator CLIs, hourly
  reconciliation, and admin-only status API.

- [ ] **Step 1: Write failing reconciliation tests**

Assert repair of missing user, wrong verified-user active state, wrong team
display name, wrong team admin/member role, missing/extra team member, wrong
private-channel name, and missing/extra channel member. Assert
unlinked Mattermost entities are untouched and final channel IDs are pushed to
the plugin managed-channel endpoint.

- [ ] **Step 2: Run and confirm RED**

Run: node --test --experimental-strip-types tests/mattermost-reconcile.test.ts

Expected: FAIL because reconcile.ts is absent.

- [ ] **Step 3: Implement reconciliation**

Load desired CRM and linked Mattermost state page-by-page. Sort operations,
execute with concurrency five, reuse retry classification, update link states,
and return counters checked, created, updated, membershipsAdded,
membershipsRemoved, and failed. Schedule hourly as mattermost-reconcile.

- [ ] **Step 4: Implement secret-safe status**

Report enabled/configured/paused, sanitized pause reason and last bootstrap
state, ping, plugin version, link counts, outbox state counts, oldest pending
timestamp, failed count, and last successful reconcile.
Never return tokens, secrets, credential URLs, message bodies, or raw lastError.
Require workspace owner/admin for HTTP and server environment for CLI.

Add the operational scripts:

~~~json
"mattermost:status": "tsx scripts/mattermost-status.ts",
"mattermost:reconcile": "tsx scripts/mattermost-reconcile.ts"
~~~

- [ ] **Step 5: Verify and commit**

~~~powershell
node --test --experimental-strip-types tests/mattermost-reconcile.test.ts tests/mattermost-status.test.ts
npm test
npm run typecheck
git add server/lib/mattermost/reconcile.ts server/lib/mattermost/status.ts scripts/mattermost-reconcile.ts scripts/mattermost-status.ts server/api/integrations/mattermost/status.get.ts tests/mattermost-reconcile.test.ts tests/mattermost-status.test.ts server/cron.ts package.json package-lock.json
git commit -m "feat: reconcile and report Mattermost sync"
~~~

Expected: all commands exit 0.

### Task 15: Document operations and run end-to-end acceptance

**Files:**

- Modify: DEPLOYMENT.md
- Modify: .env.example
- Create: docs/mattermost-integration.md
- Create: tests/mattermost-e2e.test.ts
- Modify in mattermost_setup_docker: README.md
- Modify in mattermost_setup_docker: tests/validate_runtime.py

**Interfaces:**

- Produces: operator runbook, rollback process, opt-in destructive fixture E2E,
  and final acceptance evidence.

- [ ] **Step 1: Write opt-in E2E first**

Require MATTERMOST_E2E=true and fixture-only databases. Create two verified
users, one unverified user, workspace, General/group/DIRECT channels, and
history. Bootstrap the fixture project. Assert counts/authors/timestamps, that
the unverified user is denied before email verification, same-password login
after verification, both message directions, replay idempotency, member
removal, and callback queue recovery after outage.

- [ ] **Step 2: Confirm normal suite skips E2E**

~~~powershell
npm test
npm run typecheck
~~~

Expected: regular suite passes and E2E reports SKIP without MATTERMOST_E2E.

- [ ] **Step 3: Write runbooks**

Document both repositories' environment variables, build/install, dry run,
--confirm-reset warning, count report, lazy password migration, outage
behavior, runtime-env ownership/permissions and token rotation,
status/reconcile, how to inspect and safely resume a failed paused bootstrap,
failed-event recovery, backup choice, rollback, and that deployment to
192.168.1.222 is never automatic.

- [ ] **Step 4: Run every non-destructive verification**

In vue_crm:

~~~powershell
npm test
npm run typecheck
npm run build
npm run users:mattermost-up
git diff --check
~~~

In mattermost_setup_docker:

~~~powershell
python tests/validate_compose.py
docker compose config --quiet
docker build -f plugin/Dockerfile --target test plugin
docker build -f plugin/Dockerfile --output type=local,dest=plugin/dist plugin
git diff --check
~~~

Expected: all exit 0; bootstrap says DRY RUN; no volume is removed.

- [ ] **Step 5: Run isolated destructive E2E after target review**

Inspect every fixture volume label before:

~~~powershell
$env:MATTERMOST_E2E = "true"
node --test --experimental-strip-types tests/mattermost-e2e.test.ts
Remove-Item Env:MATTERMOST_E2E
~~~

Expected: PASS for import, credentials, membership, both message directions,
retry, and deduplication.

- [ ] **Step 6: Commit documentation in both repositories**

In vue_crm:

~~~powershell
git add DEPLOYMENT.md .env.example docs/mattermost-integration.md tests/mattermost-e2e.test.ts
git commit -m "docs: add Mattermost integration runbook"
~~~

In mattermost_setup_docker:

~~~powershell
git add README.md tests/validate_runtime.py
git commit -m "docs: add CRM integration deployment guide"
~~~

### Task 16: Final specification and secret audit

**Files:**

- Review only: both repository worktrees and task commit ranges.

**Interfaces:**

- Produces: verified handoff without deployment or committed secrets.

- [ ] **Step 1: Audit secrets**

Search tracked and untracked files for actual token values, password values,
the exposed Agent API key, and Authorization header values. Confirm both real
.env files remain ignored and generated import archives are untracked/removed.

- [ ] **Step 2: Audit every design heading**

Map ownership, source of truth, entity mapping, ports, credentials, structural
sync, live messages, bootstrap, security, failure handling, tests, and
deployment boundary to concrete commits and tests. Add a missing test before
continuing if any item has no evidence.

- [ ] **Step 3: Run fresh verification**

Repeat Task 15 Step 4 and record exact exit codes. Do not infer build success
from test success or type safety from a successful build.

- [ ] **Step 4: Inspect final state**

Run in both repositories:

~~~powershell
git status --short
git log --oneline --decorate -20
git diff HEAD~1 --check
~~~

Expected: no unexpected changes, no tracked .env, and reviewable task commits.

- [ ] **Step 5: Hand off without deploying**

Report verification output, commit ranges, dry-run counts, runbook path, plugin
archive path, required Agent API key rotation, and the exact operator
deployment command. Do not run confirmed reset against 192.168.1.222 until the
operator explicitly initiates it.
