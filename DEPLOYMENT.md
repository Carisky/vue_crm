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

For local development:

```bash
npm run db:dev:up
npm run dev:local
```

The local MariaDB container listens only on `127.0.0.1:3307`. Stop it with
`npm run db:dev:down`.
