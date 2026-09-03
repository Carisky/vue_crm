# CRM–Mattermost Integration Design

## Goal

Integrate the existing Nuxt CRM with the Mattermost Team Edition instance on
the same Ubuntu server. CRM remains authoritative for identities, passwords,
workspaces, groups, membership, and access. Mattermost mirrors that structure,
and newly created text messages flow in both directions.

The first deployment may destroy all existing Mattermost data and reconstruct
it from CRM. It must not delete or rewrite CRM data.

## Repositories and ownership

The implementation spans two existing repositories:

- `C:\Users\user\VsCodeRepos\vue_crm` owns CRM persistence, lifecycle hooks,
  the Mattermost REST client, mappings, the transactional outbox, the inbound
  webhook, reconciliation, and the bootstrap command exposed through npm.
- `C:\Users\user\VsCodeRepos\mattermost_setup_docker` owns everything shipped
  with Mattermost: Compose services, the public gateway, the Mattermost server
  plugin and its Docker-based build, installation scripts, runtime checks, and
  deployment documentation.

The similarly written nested path
`C:\Users\user\VsCodeRepos\mattermost\_setup\_docker` does not exist in the
current workspace. The existing `mattermost_setup_docker` repository is the
deployment repository intended by this design.

No component writes directly to Mattermost's PostgreSQL database. Online
operations use supported REST or plugin APIs; the initial history load uses
Mattermost's bulk-import mechanism.

## Source of truth and supported scope

CRM is the only source of truth for:

- users and active state;
- credentials;
- workspaces and workspace roles;
- groups and group membership;
- managed conversations and their participants.

Mattermost is allowed to originate only new text messages in managed channels.
Manual changes to managed teams, channels, or membership are not imported into
CRM and are repaired by reconciliation. Unmanaged Mattermost channels are
ignored.

The first version deliberately excludes message editing and deletion, threads,
reactions, files, calls, presence, typing indicators, and read receipts. In
managed channels, the plugin rejects thread replies and file-only/file-bearing
posts, while the public gateway blocks post editing and deletion. This prevents
the two message histories from silently diverging while CRM has no equivalent
features.

## Entity mapping

Mappings live in dedicated Prisma models rather than overloading the current
domain tables. External IDs are unique, and every link records synchronization
state and timestamps.

| CRM entity | Mattermost entity | Rules |
| --- | --- | --- |
| `User` | User | Email is the lookup key. A deterministic, valid, unique username includes a stable suffix derived from the CRM user ID. |
| `Workspace` | Team | Display name follows CRM. The unique team name is a deterministic slug with a workspace-ID suffix. |
| `Member` | Team member | CRM role and membership control access; Mattermost membership cannot grant CRM access. |
| Workspace `General` conversation | Public `town-square` channel | Every workspace member participates. The existing default channel is reused instead of creating a duplicate General channel. |
| `WorkspaceGroup` conversation | Private channel | Name and membership follow the group. The channel name has a deterministic group-ID suffix. |
| `DIRECT` conversation | Private channel | Exactly two participants inside the corresponding team. This is intentionally not a native Mattermost DM, because native DMs are global while CRM conversations are workspace-scoped. |
| `ConversationMessage` | Post | The link stores both IDs and the origin. Message text, author, and creation time are preserved during bootstrap. |

The main link models are `MattermostUserLink`, `MattermostWorkspaceLink`,
`MattermostConversationLink`, and `MattermostMessageLink`. An inbound-event
receipt table gives webhook deliveries a unique idempotency key. A separate
`MattermostOutboxEvent` table stores durable CRM-to-Mattermost work.

## Runtime architecture

### Mattermost deployment repository

Compose runs PostgreSQL, Mattermost Team Edition 11.7.0, and an nginx gateway.
The Mattermost version remains pinned. The plugin is compiled in a
Docker builder, so the workstation and Ubuntu host do not need Go installed.

The gateway publishes `0.0.0.0:8065`, including WebSocket proxy support.
Mattermost also exposes an integration-only listener on
`127.0.0.1:8066`. The host-running CRM uses
`http://127.0.0.1:8066`, while users continue to use
`http://192.168.1.222:8065`.

The public gateway denies exact API routes for account creation, password reset
and password changes, and post editing and deletion. Broad route patterns that
could accidentally block login are not used. Mattermost configuration also
disables open signup and forgot-password UI. Plugin command endpoints used by
CRM are blocked on the public listener and remain available through the local
listener.

### CRM application

The CRM REST client owns request authentication, timeouts, error normalization,
and retry classification. Lifecycle handlers enqueue structural changes in the
same database transaction as their domain change. The existing scheduler runs
an outbox worker and a periodic reconciliation task.

The Mattermost plugin uses post lifecycle hooks for managed channels. It writes
outbound notification records to the plugin KV store before delivery, retries
failed callbacks with exponential backoff, and deletes a record only after CRM
acknowledges it. Both directions therefore provide at-least-once delivery;
database uniqueness makes processing idempotent.

## Account and credential flow

Mattermost Team Edition remains in use; no Entry or paid SSO feature is
required. Users log into each web application with the same email and password.
CRM is authoritative and never reads or copies Mattermost password hashes.

### New registration

After CRM creates a user, it attempts to create the Mattermost user with the
password still present in request memory, then deactivates that Mattermost user
until CRM email verification completes. Verification activates an existing
Mattermost account. If Mattermost was unavailable during signup, the account is
created and activated on the first verified CRM login instead.

### Existing users and normal login

The bootstrap creates existing Mattermost users with independent cryptographic
random passwords that are not exposed as usable credentials. On every
successful CRM password login, CRM finds or creates the Mattermost user,
activates it when appropriate, and sets its password to the password supplied
in that request. Plaintext is neither logged nor placed in an outbox.

Failure to contact Mattermost never blocks CRM login and never returns a 503 for
otherwise valid CRM credentials. CRM records a sanitized synchronization error
and returns a non-fatal status that the client can display. The next CRM login
or password reset makes another attempt.

### Password reset and account state

CRM password reset attempts to update Mattermost synchronously while the new
password is in memory. A temporary failure is handled like a login failure: the
CRM reset succeeds, the link is marked out of sync without storing the
password, and the next successful CRM login repairs it. Deactivation and
reactivation originate in CRM and are durable structural outbox events.

Direct password changes, password resets, and registration are unavailable on
the public Mattermost listener. Consequently, a user cannot intentionally make
Mattermost credentials authoritative or permanently diverge them from CRM.

## Structural synchronization

Creating, renaming, archiving, or restoring a workspace produces the matching
team operation. Joining, leaving, removing a member, and changing a role
produce team-membership operations. Group creation, rename, deletion, and
membership changes produce private-channel operations. Creating a direct CRM
conversation produces a private two-member channel.

Domain mutations and their outbox events commit atomically. The worker orders
dependent work by aggregate: user before membership, team before channel, and
channel before post. A retryable error schedules exponential backoff with
jitter. Authentication and validation errors stop retrying after a bounded
number of attempts and remain visible as failed events for operator action.

A periodic reconciliation compares CRM's desired state with only linked
Mattermost entities. It repairs missing users, teams, channels, and memberships,
restores CRM-controlled names, and removes unauthorized memberships. It does
not modify unrelated Mattermost teams or channels.

## Live message flow

### CRM to Mattermost

1. The CRM message and a `message.created` outbox event commit in one Prisma
   transaction.
2. The worker resolves user and channel mappings and calls the plugin's private
   endpoint.
3. The plugin validates the shared signature and membership, then creates the
   Mattermost post with the mapped Mattermost user as author.
4. The post includes non-user-visible integration metadata containing the CRM
   message ID and origin.
5. The plugin hook recognizes that metadata and does not send the post back to
   CRM.
6. CRM records the Mattermost post ID in `MattermostMessageLink`.

### Mattermost to CRM

1. The plugin receives a committed text post in a linked channel.
2. It ignores system posts, integration-origin posts, unmanaged channels,
   threads, and unsupported file posts.
3. It persists an event in plugin KV and sends a timestamped HMAC-signed JSON
   callback to CRM.
4. CRM validates the signature, timestamp, nonce, channel mapping, author
   mapping, and current CRM conversation membership.
5. In one transaction, CRM claims the unique event ID, creates the
   `ConversationMessage`, and records the post link.
6. CRM emits the existing conversation and inbox realtime events.
7. A successful acknowledgement lets the plugin delete its queued event.

The origin marker plus unique CRM-message, Mattermost-post, and inbound-event
IDs prevents feedback loops and duplicates.

## Destructive bootstrap and history migration

The CRM package exposes:

```text
npm run users:mattermost-up
npm run users:mattermost-up -- --confirm-reset
```

Without `--confirm-reset`, the command is a read-only dry run. It validates the
CRM database, the resolved Mattermost Compose directory, Docker availability,
the current Compose project name, exact named volumes, required environment
variables, and the planned record counts. It prints the exact resources and
counts but does not stop services or change data.

With `--confirm-reset`, it performs these steps:

1. Disable online synchronization while continuing to accumulate CRM outbox
   events.
2. Resolve and re-check that every destructive target is a volume belonging to
   the expected `mattermost` Compose project. Never use Docker-wide prune or a
   filesystem-wide recursive delete.
3. Stop only that Compose project, remove its named data volumes, and start a
   clean stack.
4. Wait for PostgreSQL and Mattermost health checks.
5. Create a local service administrator, generate its token, install and enable
   the pinned plugin, and apply plugin configuration.
6. Generate a Mattermost bulk-import file from a consistent CRM snapshot.
   Import all users, teams, memberships, managed channels, participants, and
   text messages in chronological order. Preserve original authors and
   timestamps. Unverified CRM users remain inactive.
7. Resolve generated Mattermost IDs and populate all CRM mapping tables. The
   import carries stable CRM identifiers in integration metadata so post links
   can be resolved without matching on mutable text.
8. Run full structural and count reconciliation. Verify a representative
   earliest and latest message in each conversation.
9. Enable the outbox worker and process changes accumulated after the snapshot
   boundary.

The command exits non-zero on any failed phase and does not claim completion
until reconciliation passes. A failed import may be rerun because the target
Mattermost instance is explicitly disposable during bootstrap.

`MATTERMOST_COMPOSE_DIR` makes the server-side repository path configurable;
its development default points to the sibling `mattermost_setup_docker`
checkout. Secrets are never passed as command-line arguments or included in
the generated import report.

## Security

- The Mattermost administrator token, plugin HMAC secret, internal URLs, and
  bootstrap administrator credentials live only in ignored `.env` files.
- Plugin requests and callbacks use HMAC over method, path, timestamp, nonce,
  and raw body. Receivers compare signatures in constant time, reject stale
  timestamps, and persist nonce/event IDs to stop replay.
- The administrator REST API and plugin command endpoint are reachable only on
  the loopback listener. The public listener exposes normal Mattermost use but
  blocks CRM-authoritative mutations.
- Callback payloads contain IDs and message bodies but never passwords,
  password hashes, session cookies, or administrator tokens.
- Logs redact authorization headers, signatures, passwords, and raw secrets.
- Inbound messages are accepted only when both mapped CRM user and current CRM
  conversation membership exist, even if Mattermost permissions were changed
  manually.
- The supplied Agent API key is unrelated to Mattermost and is not reused by
  this integration. Since it was exposed in conversation context, it should be
  rotated separately.

## Failure handling and observability

Both queues use bounded exponential backoff with jitter and expose pending,
retrying, completed, and failed states. Errors record operation type, linked
entity ID, attempt count, next attempt time, HTTP status, and a sanitized error
summary. They do not record secrets or plaintext passwords.

Idempotency handles timeouts after a remote commit. A missing mapping causes a
dependency retry or reconciliation rather than inventing a second remote
entity. A Mattermost outage degrades only Mattermost synchronization: CRM
authentication, workspace management, and chat remain usable.

Startup logs report whether synchronization is enabled and whether required
configuration is complete. An operator command reports queue counts, oldest
pending event, failed operations, link counts, Mattermost health, plugin
version, and last successful reconciliation.

## Testing and acceptance

### CRM tests

- username and team/channel slug generation;
- HMAC signing, verification, expiry, replay rejection, and redaction;
- REST client timeout and retry classification;
- outbox idempotency, ordering, backoff, terminal failure, and reconciliation;
- account provisioning on signup/login/reset without retaining plaintext;
- membership and channel authorization for inbound posts;
- feedback-loop and duplicate prevention;
- bootstrap dry-run safety and exact destructive-target validation.

### Mattermost deployment and plugin tests

- Docker-based Go unit tests for hook filtering, signatures, KV retries,
  author-preserving post creation, and unsupported-post rejection;
- resolved Compose configuration publishes nginx on `0.0.0.0:8065`, the
  integration listener on `127.0.0.1:8066`, and no PostgreSQL port;
- runtime health checks for PostgreSQL, Mattermost, nginx, and plugin status;
- public registration/password/post-mutation endpoints are denied while login
  and ordinary text posting work;
- private integration endpoints are unavailable through the public listener.

### End-to-end acceptance

1. A clean bootstrap reproduces CRM user, workspace, membership, group,
   conversation, and message counts and preserves sampled author/timestamp
   pairs.
2. An existing user first logs into CRM and can then log directly into
   Mattermost with the same credentials.
3. A newly registered user cannot access Mattermost before CRM email
   verification and can access it afterward.
4. CRM password reset changes Mattermost credentials; Mattermost cannot change
   them independently through the public listener.
5. Workspace General, group, and workspace-scoped direct channels have exactly
   the CRM-authorized participants.
6. A text message created on either side appears once on the other side with
   the correct author.
7. Temporary failure in either direction is retried and converges without
   duplicates.
8. Manual Mattermost membership or managed-channel naming drift is repaired,
   while unrelated Mattermost channels remain untouched.

## Deployment boundary

Implementation prepares and verifies both repositories locally. It does not
connect to the Ubuntu host or replace the running instance automatically.
Deployment remains an explicit operator action documented in
`mattermost_setup_docker`, including dry-run, backup considerations, destructive
confirmation, startup, smoke tests, and rollback instructions.
