# Deployment and private media storage

Set `STORAGE_ROOT` to an absolute directory outside the repository and `public/`.
The application OS user must have read/write access to it.

Production update sequence:

```bash
npm run maintenance:run
npm ci
npm test
npm run typecheck
npm run build
npm run db:backup -- --name before-deploy
npx prisma migrate deploy
npm run storage:migrate -- --dry-run
# verify the JSON inventory and take a database backup
npm run storage:migrate -- --apply
npm run maintenance:stop
```

`maintenance:run` stops Nuxt and keeps a standalone, auto-refreshing maintenance
page on the application port while the build is replaced. `maintenance:stop`
starts the new build; if startup fails, it restores the maintenance page. The
short misspelled aliases `maintence:run`, `maintence:stop`, and
`maintence:status` are also available for operator convenience.

Keep the database backup and migrated source files until the post-deploy smoke
test is complete. Do not add Nginx or Apache aliases to `STORAGE_ROOT`.

Database restore is destructive and creates a mandatory safety backup before
changing any tables. See `docs/database-backups.md` for schema compatibility,
named restores, and MariaDB client configuration.

For local development:

```bash
npm run db:dev:up
npm run dev:local
```

The local MariaDB container listens only on `127.0.0.1:3307`. Stop it with
`npm run db:dev:down`.

## Mattermost integration

Mattermost is an optional companion service. CRM remains available when it is
down: structural and CRM-originated message changes stay in a durable outbox and
are retried. During a history rebuild only this outbox is paused; CRM must not be
put into maintenance mode or return 503 for the rebuild.

Before enabling synchronization, deploy the companion stack from
`mattermost_setup_docker`, apply the Prisma migrations, and set the server-only
variables documented in `.env.example`. The application talks to the private
Mattermost API at `127.0.0.1:8066`; browsers use the guarded gateway on `8065`.

The first command below is always read-only and prints the resolved paths,
Mattermost volume names, and CRM entity counts:

```bash
npm run users:mattermost-up
```

Read `docs/mattermost-integration.md`, take both database and Mattermost-volume
backups, and review the printed targets before the destructive form:

```bash
npm run users:mattermost-up -- --confirm-reset
```

`--confirm-reset` deletes only the validated volumes belonging to the Compose
project named `mattermost`, recreates Mattermost, imports the complete CRM chat
history, installs the integration plugin, resolves IDs, reconciles access, and
drains the outbox. A failure leaves synchronization paused and CRM running. Do
not manually clear the pause until the failed stage has been repaired and both
reconcile and outbox drain have completed.

Operational checks:

```bash
npm run mattermost:status
npm run mattermost:reconcile
```

See `docs/mattermost-integration.md` for recovery, credential migration, token
rotation, rollback, and the explicit deployment boundary. No command in the
repository automatically deploys to or resets `192.168.1.222`.

## Telegram bot

Create a bot with `@BotFather`, then configure the production environment:

```dotenv
TELEGRAM_BOT_TOKEN=123456:replace-with-bot-token
TELEGRAM_BOT_USERNAME=your_crm_bot
TELEGRAM_WEBHOOK_SECRET=replace_with_a_long_random_secret
TELEGRAM_AUTO_SETUP_WEBHOOK=true
PUBLIC_SITE_URL=https://crm.example.com
```

`TELEGRAM_WEBHOOK_SECRET` may contain only letters, digits, `_`, and `-`.
With automatic setup enabled, the server registers
`https://crm.example.com/api/telegram/webhook` when it starts. The public site
must use HTTPS and the server also configures the bot's menu button to open the
CRM Mini App at `https://crm.example.com/telegram`. For local end-to-end
testing, expose the Nuxt server through an HTTPS tunnel and temporarily use that
tunnel as `PUBLIC_SITE_URL`.

After scanning the one-time QR code, the user presses Start once and receives an
`Open working chats` button. All further navigation and messaging happens in
the Mini App; no bot commands are required. You can additionally configure the
same `/telegram` URL as the bot's Main Mini App in `@BotFather` to show an
`Open App` button directly on the bot profile.

The application's built-in Basic Auth remains enabled for the CRM, including
`/api/telegram/link`. It bypasses Basic Auth only for `/telegram`, the Telegram
webhook, signed Mini App API routes, and the Nuxt icon endpoint used by the Mini
App. If Basic Auth or an access policy is also configured in nginx, Caddy,
Cloudflare, or another proxy in front of Nuxt, that external layer must allow
those routes as well as the static `/_nuxt/` and `/_fonts/` assets. A dedicated
public Mini App hostname routed to the same Nuxt service is the cleanest option
when the main CRM hostname must stay completely behind proxy-level Basic Auth.
