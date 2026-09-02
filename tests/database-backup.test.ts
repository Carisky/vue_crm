import assert from "node:assert/strict";
import test from "node:test";

import {
  compareMigrationSchemas,
  formatBytes,
  hashMigrationNames,
  makeBackupName,
  parseBackupArguments,
  parseRestoreArguments,
  validateBackupSelector,
  validateManifest,
} from "../lib/database-backup.ts";

test("parses named and default restore commands", () => {
  assert.deepEqual(parseRestoreArguments([]), {
    name: null,
    yes: false,
    help: false,
  });
  assert.deepEqual(parseRestoreArguments(["-name", "backup-1", "--yes"]), {
    name: "backup-1",
    yes: true,
    help: false,
  });
  assert.equal(
    parseRestoreArguments(["--name=backup-2.sql.gz"]).name,
    "backup-2",
  );
});

test("rejects restore selectors that escape the backup directory", () => {
  assert.throws(() => validateBackupSelector("../backup"), /path/);
  assert.throws(() => validateBackupSelector("folder\\backup"), /path/);
});

test("normalizes optional backup labels", () => {
  assert.deepEqual(parseBackupArguments(["--name", "Before deploy #42"]), {
    label: "before-deploy-42",
    help: false,
  });
  assert.equal(
    makeBackupName(new Date("2026-09-02T12:34:56.789Z"), {
      label: "Release 1",
    }),
    "vue-crm_backup_2026-09-02T12-34-56-789Z_release-1",
  );
});

test("detects exact, older, and unknown migration schemas", () => {
  assert.deepEqual(compareMigrationSchemas(["a", "b"], ["a", "b"]), {
    matches: true,
    onlyInCurrent: [],
    onlyInBackup: [],
  });
  assert.deepEqual(compareMigrationSchemas(["a", "b"], ["a"]), {
    matches: false,
    onlyInCurrent: ["b"],
    onlyInBackup: [],
  });
  assert.deepEqual(compareMigrationSchemas(["a"], ["a", "future"]), {
    matches: false,
    onlyInCurrent: [],
    onlyInBackup: ["future"],
  });
});

test("validates migration metadata inside a backup manifest", () => {
  const migrations = ["migration-a"];
  const manifest = {
    formatVersion: 1,
    name: "backup-1",
    kind: "manual",
    createdAt: "2026-09-02T12:00:00.000Z",
    dumpFile: "backup-1.sql.gz",
    sizeBytes: 10,
    sha256: "dump-hash",
    database: { name: "crm", host: "localhost", port: 3306 },
    schema: {
      prismaSchemaSha256: "schema-hash",
      migrationsSha256: hashMigrationNames(migrations),
      appliedMigrations: migrations,
    },
    tool: { name: "mariadb-dump", version: "11" },
  };
  assert.equal(validateManifest(manifest).name, "backup-1");
  assert.throws(
    () =>
      validateManifest({
        ...manifest,
        schema: { ...manifest.schema, migrationsSha256: "tampered" },
      }),
    /checksum/,
  );
});

test("formats compact backup sizes", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1536), "1.50 KB");
  assert.equal(formatBytes(12 * 1024 * 1024), "12.0 MB");
});
