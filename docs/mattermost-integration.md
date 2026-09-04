# CRM–Mattermost integration runbook

## Contract and ownership

CRM is the source of truth for accounts, email verification, passwords,
workspaces, roles, membership, conversation membership, and message history.
Mattermost is a synchronized chat projection. Users may create messages in
either UI, but account/access changes made directly in Mattermost are not
authoritative and the hourly reconciliation restores CRM state.

Each CRM workspace maps to one private Mattermost team. Its workspace chat maps
to `town-square`; group chats and two-person chats map to private channels inside
that team. They are deliberately not Mattermost DMs, which makes membership and
history import deterministic. Stable generated names plus mapping tables bind
CRM IDs to Mattermost user, team, channel, and post IDs.

The public gateway listens on every interface at port `8065`. Mattermost itself
is bound only to `127.0.0.1:8066`; PostgreSQL has no host port. CRM and bootstrap
code must use `http://127.0.0.1:8066`, never the public gateway. The gateway
blocks public user creation, password changes/resets, post edit/delete, and
mutating plugin calls. It allows login and post creation.

## Configuration

CRM server-only variables:

| Variable | Purpose |
| --- | --- |
| `MATTERMOST_SYNC_ENABLED` | Exact `true` enables runtime synchronization. |
| `MATTERMOST_INTERNAL_URL` | Private API, normally `http://127.0.0.1:8066`. |
| `MATTERMOST_PLUGIN_SECRET` | Shared HMAC secret, at least 32 random bytes. |
| `MATTERMOST_RUNTIME_ENV_FILE` | Absolute mode-0600 file holding the generated admin token. |
| `MATTERMOST_ADMIN_TOKEN` | Optional direct token; prefer the runtime file. |
| `MATTERMOST_CALLBACK_URL` | CRM callback reachable from the plugin container. |
| `MATTERMOST_COMPOSE_DIR` | Absolute checkout/deploy directory for the companion stack. |
| `MATTERMOST_IMPORT_DIR` | Absolute directory for mode-0600 export archives. |

Mattermost stack variables live in its ignored `.env`: PostgreSQL credentials,
image tags, `APP_PORT`, `MM_SERVICESETTINGS_SITEURL`,
`MATTERMOST_CALLBACK_URL`, and the same secret as
`MATTERMOST_PLUGIN_SECRET`. Keep `MATTERMOST_IMAGE_TAG=11.7.0`; bootstrap refuses
another image. Never commit either real `.env` or `.mattermost.runtime.env`.

Create secrets with a cryptographic generator, for example `openssl rand -hex
32`. The runtime-env parent directory should be root-owned `0700`; the file is
atomically written as `0600`. The file also contains a bootstrap-admin password,
so treat it as a production credential and include it in secret backup policy.

## First deployment and rebuild

1. Back up the CRM MariaDB database and every `mattermost_*` Docker volume.
2. Copy the Mattermost deployment repository to `MATTERMOST_COMPOSE_DIR`, create
   its `.env`, and run `docker compose config --quiet`.
3. Apply CRM migrations with `npx prisma migrate deploy`, then build/restart CRM.
   Keep `MATTERMOST_SYNC_ENABLED=false` until Mattermost is ready.
4. Run `npm run users:mattermost-up`. This is a dry run: it checks exact paths,
   Compose project name, volume labels, pinned image/import support, CRM callback
   health, and prints users/workspaces/conversations/messages counts. It neither
   pauses synchronization nor removes a volume.
5. Compare the printed absolute paths and volume list with the backup. Only the
   operator may then run `npm run users:mattermost-up -- --confirm-reset`.
6. The confirmed workflow pauses the outbox, removes only validated Mattermost
   volumes, starts the stack with temporary private user creation, creates an
   administrator and access token, disables user creation again, builds and
   installs the plugin, exports/imports the CRM snapshot, resolves mappings,
   reconciles access, drains the outbox, records success, and resumes it.
7. Set `MATTERMOST_SYNC_ENABLED=true`, restart CRM, then run
   `npm run mattermost:status` and a browser smoke test through port `8065`.

The destructive command is intended for the initial migration or an explicitly
approved full rebuild. Never schedule it. Deployment to `192.168.1.222` is not
automatic and is not performed by tests or CI.

## Credentials and normal behavior

Existing password hashes cannot be converted into Mattermost passwords. Imported
users therefore receive random unusable bootstrap passwords. On the next
successful CRM login, CRM creates or finds the Mattermost account and sets its
password to the password just verified by CRM. New verified users follow the
same path. Password reset updates Mattermost after CRM commits its new hash.
Unverified users are imported deactivated and cannot log in; verification
activates the linked Mattermost account. Passwords never enter the outbox, logs,
URLs, argv, mappings, or error records.

CRM mutations commit their Mattermost outbox record in the same database
transaction. Workers retry transient failures with backoff and retain terminal
failures for inspection. Mattermost-created posts are HMAC-signed by the plugin,
deduplicated by event ID and post ID, and inserted into the mapped CRM chat. The
plugin keeps a durable Mattermost KV retry queue when CRM is unavailable. Replays
are safe; post edits and deletes are intentionally blocked.

## Monitoring and recovery

`npm run mattermost:status` reports enabled/configured/health flags, plugin
version, pause state, mapping counts, outbox state counts, oldest pending time,
failed count, and last reconciliation. It does not output endpoints, tokens,
message bodies, or raw remote errors. The admin status API requires a CRM admin
membership and a `workspace_id` query parameter.

Run `npm run mattermost:reconcile` after an outage or membership repair. An
hourly server task also reconciles users, teams, channel membership, active
state, and mapping drift. A Mattermost outage must not block CRM login or writes;
the user may see `mattermost_sync: pending` while CRM succeeds.

If bootstrap fails, CRM stays online and the durable control row remains paused
with `bootstrap-failed`:

1. Run `npm run mattermost:status` and inspect sanitized CRM/Mattermost logs.
2. Repair the named stage (stack, callback, plugin, import, mapping, or access).
3. Re-run the dry run and, because the failed attempt may be partial, restore the
   chosen backup or repeat the confirmed full rebuild after reviewing targets.
4. Run reconciliation and verify zero failed operations and a drained outbox.
5. Resume only by completing the guarded bootstrap workflow. Do not edit
   `MattermostSyncControl` while pending events remain.

For ordinary failed events, restore connectivity/configuration, run reconcile,
and allow retryable outbox entries to run. Terminal `FAILED` records preserve
their idempotency keys for diagnosis; fix the underlying CRM mapping or data and
requeue them through an audited database/admin operation. Never copy message
bodies or credentials into tickets.

## Rotation, rollback, and verification

To rotate the plugin secret, set the same new random value in both services,
reinstall/reconfigure the plugin with `scripts/install-plugin.sh`, restart CRM,
and verify health. To rotate the Mattermost admin token, create a replacement on
the private API, atomically replace only `MATTERMOST_ADMIN_TOKEN` in the
root-owned runtime file, restart CRM, verify status, then revoke the old token.

Rollback application code and the companion stack together. If schema rollback
is required, restore the pre-deployment CRM database backup rather than manually
reversing migrations. If a confirmed rebuild is rolled back, restore all
Mattermost volumes as one consistent set. Keep synchronization disabled until
the restored versions and mappings agree; then reconcile before enabling it.

Non-destructive release verification:

```bash
# vue_crm
npm test
npm run typecheck
npm run build
npm run users:mattermost-up       # dry run only

# mattermost_setup_docker
python tests/validate_compose.py
docker compose config --quiet
docker build -f plugin/Dockerfile --target test plugin
docker build -f plugin/Dockerfile --output type=local,dest=plugin/dist plugin
```

The destructive E2E test is opt-in and accepts only a disposable database name
containing `mattermost_e2e`, loopback Mattermost URLs, and a compose path
containing `fixture` or `e2e`. The normal suite loads only its safety-gate test
and reports the destructive body as `SKIP`. Review every fixture volume label
immediately before setting `MATTERMOST_E2E=true`. `MATTERMOST_E2E_RUNNER` must
name the reviewed executable in that fixture directory; it is responsible for
seeding and checking users (including verification activation), all three chat
types and full-history metadata, same-password login, both message directions,
replay deduplication, membership removal, and callback retry recovery.
