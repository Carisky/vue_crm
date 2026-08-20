import assert from "node:assert/strict";
import { test } from "node:test";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveStorageConfig } from "../server/lib/storage/config.ts";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("uses the repository data directory outside production", () => {
  const config = resolveStorageConfig({ env: {}, cwd: repo, production: false });

  assert.equal(config.root, resolve(repo, ".data/storage"));
  assert.equal(config.maxFileSizeBytes, 50 * 1024 * 1024);
  assert.equal(config.maxFilesPerUpload, 10);
});

test("requires STORAGE_ROOT in production", () => {
  assert.throws(
    () => resolveStorageConfig({ env: {}, cwd: repo, production: true }),
    /STORAGE_ROOT/,
  );
});

test("requires an absolute production STORAGE_ROOT", () => {
  assert.throws(
    () => resolveStorageConfig({ env: { STORAGE_ROOT: "relative" }, cwd: repo, production: true }),
    /absolute/,
  );
});

test("rejects the public directory itself as a storage root", () => {
  assert.throws(
    () =>
      resolveStorageConfig({
        env: { STORAGE_ROOT: join(repo, "public") },
        cwd: repo,
        production: true,
      }),
    /public/,
  );
});

test("rejects a dot-prefixed descendant of the public directory", () => {
  assert.throws(
    () =>
      resolveStorageConfig({
        env: { STORAGE_ROOT: join(repo, "public", "..storage") },
        cwd: repo,
        production: true,
      }),
    /public/,
  );
});

test("parses valid numeric upload limits", () => {
  const config = resolveStorageConfig({
    env: {
      STORAGE_MAX_FILE_SIZE_MB: "12",
      STORAGE_MAX_FILES_PER_UPLOAD: "3",
    },
    cwd: repo,
    production: false,
  });

  assert.equal(config.maxFileSizeBytes, 12 * 1024 * 1024);
  assert.equal(config.maxFilesPerUpload, 3);
});

test("rejects non-positive or non-integer numeric upload limits", () => {
  assert.throws(
    () => resolveStorageConfig({ env: { STORAGE_MAX_FILE_SIZE_MB: "0" }, cwd: repo }),
    /STORAGE_MAX_FILE_SIZE_MB/,
  );
  assert.throws(
    () => resolveStorageConfig({ env: { STORAGE_MAX_FILES_PER_UPLOAD: "1.5" }, cwd: repo }),
    /STORAGE_MAX_FILES_PER_UPLOAD/,
  );
});

test("rejects upload limits that are not safe integers or produce unsafe byte sizes", () => {
  assert.throws(
    () => resolveStorageConfig({ env: { STORAGE_MAX_FILE_SIZE_MB: "1e308" }, cwd: repo }),
    /STORAGE_MAX_FILE_SIZE_MB/,
  );
  assert.throws(
    () =>
      resolveStorageConfig({
        env: {
          STORAGE_MAX_FILE_SIZE_MB: String(
            Math.floor(Number.MAX_SAFE_INTEGER / (1024 * 1024)) + 1,
          ),
        },
        cwd: repo,
      }),
    /STORAGE_MAX_FILE_SIZE_MB/,
  );
});
