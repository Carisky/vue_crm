import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat as fileStat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { finished } from "node:stream/promises";
import { test } from "node:test";

import {
  createPrivateFilesystemStorage,
  resolveStorageObjectPath,
} from "../server/lib/storage/filesystem.ts";

async function withStorage(run: (input: {
  root: string;
  storage: ReturnType<typeof createPrivateFilesystemStorage>;
}) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "vue-crm-private-storage-"));

  try {
    await run({ root, storage: createPrivateFilesystemStorage(root) });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function commitTextObject(
  storage: ReturnType<typeof createPrivateFilesystemStorage>,
  key: string,
  content: string,
) {
  const temporary = await storage.createTemporaryObject(key);
  temporary.stream.end(content);
  await finished(temporary.stream);
  await storage.commitTemporaryObject(key, temporary.path);
}

async function readText(stream: AsyncIterable<Buffer | string>): Promise<string> {
  let value = "";
  for await (const chunk of stream) {
    value += chunk.toString();
  }
  return value;
}

test("creates unique opaque keys within the requested scope", async () => {
  await withStorage(async ({ storage }) => {
    const first = storage.createKey("task-media");
    const second = storage.createKey("task-media");

    assert.match(first, /^task-media\/[0-9a-f-]{36}$/);
    assert.match(second, /^task-media\/[0-9a-f-]{36}$/);
    assert.notEqual(first, second);
  });
});

test("streams a temporary part file and atomically commits it", async () => {
  await withStorage(async ({ root, storage }) => {
    const key = storage.createKey("task-media");
    const temporary = await storage.createTemporaryObject(key);

    assert.match(temporary.path, /\.tmp[\\/]([0-9a-f-]{36})\.part$/);
    temporary.stream.end("private upload");
    await finished(temporary.stream);
    assert.equal(await readFile(temporary.path, "utf8"), "private upload");

    await storage.commitTemporaryObject(key, temporary.path);
    assert.equal(await readText(storage.openReadStream(key)), "private upload");
    await assert.rejects(fileStat(temporary.path));
    assert.equal(await readFile(resolveStorageObjectPath(root, key), "utf8"), "private upload");
  });
});

test("stats objects and opens full or ranged read streams", async () => {
  await withStorage(async ({ storage }) => {
    const key = storage.createKey("task-media-variant");
    await commitTextObject(storage, key, "0123456789");

    assert.deepEqual(await storage.stat(key), { size: 10 });
    assert.equal(await readText(storage.openReadStream(key)), "0123456789");
    assert.equal(await readText(storage.openReadStream(key, { start: 3, end: 6 })), "3456");
  });
});

test("removes objects idempotently", async () => {
  await withStorage(async ({ storage }) => {
    const key = storage.createKey("task-media");
    await commitTextObject(storage, key, "delete me");

    assert.equal(await storage.remove(key), true);
    assert.equal(await storage.remove(key), false);
  });
});

test("discards a temporary part file idempotently", async () => {
  await withStorage(async ({ storage }) => {
    const temporary = await storage.createTemporaryObject(storage.createKey("task-media"));
    temporary.stream.end("discard me");
    await finished(temporary.stream);

    await storage.discardTemporaryObject(temporary.path);
    await storage.discardTemporaryObject(temporary.path);
    await assert.rejects(fileStat(temporary.path));
  });
});

test("passes a committed path only through withPhysicalPath", async () => {
  await withStorage(async ({ root, storage }) => {
    const key = storage.createKey("task-media");
    await commitTextObject(storage, key, "processor input");

    const content = await storage.withPhysicalPath(key, async (path) => {
      assert.equal(path, resolveStorageObjectPath(root, key));
      return readFile(path, "utf8");
    });

    assert.equal(content, "processor input");
  });
});

test("rejects unsafe storage keys before resolving paths", () => {
  const root = join(tmpdir(), "vue-crm-private-storage-root");

  for (const key of ["../x", "/absolute", "C:\\absolute", "task-media\\x", "task-media/\0x"]) {
    assert.throws(() => resolveStorageObjectPath(root, key), /storage key/i);
  }
});
