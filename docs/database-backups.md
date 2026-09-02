# Database backup and restore

The project includes a MariaDB backup CLI. It reads `DATABASE_URL` from `.env`, falling back to `.env.development`, and stores archives under `.data/db-backups` by default.

## Create a backup

```bash
npm run db:backup
npm run db:backup -- --name before-deploy
```

The command prints the backup name, absolute file path, database host/name, compressed size, applied migration count, and a shortened SHA-256 checksum. Each backup contains:

- `NAME.sql.gz`: compressed transactional SQL dump;
- `NAME.json`: manifest with the full dump checksum, database identity, Prisma schema hash, applied migrations, and dump-tool version.

The dump includes tables, triggers, routines, and events. The database password is passed through `MYSQL_PWD`; it is not printed or placed in command arguments.

## Restore

Restore the most recently created valid backup:

```bash
npm run db:restore
```

Restore a specific backup by manifest name or dump filename:

```bash
npm run db:restore -- -name vue-crm_backup_2026-09-02T12-34-56-789Z
```

Restore performs these checks before changing data:

1. validates the manifest and migration metadata checksum;
2. verifies dump size, SHA-256 checksum, and gzip integrity;
3. requires the backup database name to match `DATABASE_URL`;
4. compares the current database migration history, backup history, local migration directories, and Prisma schema hash;
5. refuses a backup containing migrations absent from the current checkout;
6. creates and verifies a new `pre-restore` safety backup.

If schemas differ, the CLI lists migrations that will be rolled back and requires the exact confirmation word `RESTORE`. Restoring replaces all existing tables with the backup schema; Prisma has no automatic down-migrations, so the verified full-schema restore is the rollback mechanism.

If import fails, the CLI automatically clears the incomplete database and restores the mandatory safety backup. Do not delete that archive until the restored application has been verified.

For non-interactive automation, `--yes` skips the prompt but never skips the safety backup or validation:

```bash
npm run db:restore -- -name BACKUP_NAME --yes
```

Stop the application or enable maintenance mode before restoring. Restart it only after the command succeeds.

## MariaDB tools

The CLI first looks for local `mariadb-dump`/`mysqldump` and `mariadb`/`mysql`. You may specify binaries explicitly:

```text
MARIADB_DUMP_BIN=/usr/bin/mariadb-dump
MARIADB_BIN=/usr/bin/mariadb
DB_BACKUP_DIR=/var/backups/vue-crm
```

If local clients are unavailable, it falls back to the development container `vue-crm-dev-db`. Override its connection details with `DB_DOCKER_CONTAINER`, `DB_DOCKER_HOST`, and `DB_DOCKER_PORT`.
