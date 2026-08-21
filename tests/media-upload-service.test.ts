import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

import {
  MediaUploadStorageError,
  MediaUploadTooLargeError,
  storePendingMedia,
  type MediaUploadDependencies,
  type PendingMediaRepository,
} from "../server/lib/media-upload-service.ts";
import { UnsupportedMediaTypeError } from "../server/lib/storage/file-policy.ts";
import { createPrivateFilesystemStorage } from "../server/lib/storage/filesystem.ts";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

type RepositoryState = {
  created: Parameters<PendingMediaRepository["create"]>[0][];
  removed: string[];
};

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    },
  );
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    }),
  );
  return files.flat();
}

async function withDependencies(
  run: (input: {
    deps: MediaUploadDependencies;
    root: string;
    repository: RepositoryState;
  }) => Promise<void>,
  overrides: Partial<MediaUploadDependencies> = {},
) {
  const root = await mkdtemp(join(tmpdir(), "media-upload-service-"));
  const repository: RepositoryState = { created: [], removed: [] };
  const repo: PendingMediaRepository = {
    async create(input) {
      repository.created.push(input);
      return { id: `media-${repository.created.length}` };
    },
    async remove(id) {
      repository.removed.push(id);
    },
  };

  try {
    await run({
      root,
      repository,
      deps: {
        storage: createPrivateFilesystemStorage(root),
        maxFileSizeBytes: 1024,
        repository: repo,
        ...overrides,
      },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("streams a valid file into one owned pending row and returns only public metadata", async () => {
  await withDependencies(async ({ deps, repository, root }) => {
    const result = await storePendingMedia(
      {
        workspaceId: "workspace-1",
        userId: "user-1",
        originalName: "pixel.png",
        claimedMime: "image/png",
        stream: Readable.from(PNG),
      },
      deps,
    );

    assert.deepEqual(result, {
      id: "media-1",
      name: "pixel.png",
      mime: "image/png",
      size: PNG.length,
      kind: "image",
    });
    assert.deepEqual(Object.keys(result).sort(), [
      "id",
      "kind",
      "mime",
      "name",
      "size",
    ]);
    assert.equal(repository.created.length, 1);
    assert.equal(repository.created[0]?.workspaceId, "workspace-1");
    assert.equal(repository.created[0]?.uploadedById, "user-1");
    assert.equal(repository.created[0]?.originalName, "pixel.png");
    assert.equal(repository.created[0]?.mime, "image/png");
    assert.equal(repository.created[0]?.size, PNG.length);
    assert.match(
      repository.created[0]?.storageKey ?? "",
      /^task-media\/[0-9a-f-]+$/u,
    );

    const files = await listFiles(root);
    assert.equal(files.length, 1);
    assert.ok(files.every((path) => !path.endsWith(".part")));
  });
});

test("rejects an oversized stream while writing and removes every object", async () => {
  await withDependencies(
    async ({ deps, repository, root }) => {
      await assert.rejects(
        storePendingMedia(
          {
            workspaceId: "workspace-1",
            userId: "user-1",
            originalName: "pixel.png",
            stream: Readable.from(Buffer.from("12345")),
          },
          deps,
        ),
        MediaUploadTooLargeError,
      );

      assert.equal(repository.created.length, 0);
      assert.deepEqual(await listFiles(root), []);
    },
    { maxFileSizeBytes: 4 },
  );
});

test("rejects a Busboy-truncated stream at the byte limit and removes every object", async () => {
  await withDependencies(
    async ({ deps, repository, root }) => {
      const stream = Object.assign(Readable.from(Buffer.from("1234")), {
        truncated: true,
      });

      await assert.rejects(
        storePendingMedia(
          {
            workspaceId: "workspace-1",
            userId: "user-1",
            originalName: "pixel.png",
            stream,
          },
          deps,
        ),
        MediaUploadTooLargeError,
      );

      assert.equal(repository.created.length, 0);
      assert.deepEqual(await listFiles(root), []);
    },
    { maxFileSizeBytes: 4 },
  );
});

test("rejects unsupported content and removes the temporary object", async () => {
  await withDependencies(async ({ deps, repository, root }) => {
    await assert.rejects(
      storePendingMedia(
        {
          workspaceId: "workspace-1",
          userId: "user-1",
          originalName: "payload.exe",
          stream: Readable.from(Buffer.from("not executable")),
        },
        deps,
      ),
      UnsupportedMediaTypeError,
    );

    assert.equal(repository.created.length, 0);
    assert.deepEqual(await listFiles(root), []);
  });
});

test("masks an interrupted source and removes its partial object", async () => {
  await withDependencies(async ({ deps, repository, root }) => {
    const stream = Readable.from(
      (async function* () {
        yield PNG.subarray(0, 8);
        throw new Error("source disclosed a private path C:\\secret");
      })(),
    );

    await assert.rejects(
      storePendingMedia(
        {
          workspaceId: "workspace-1",
          userId: "user-1",
          originalName: "pixel.png",
          stream,
        },
        deps,
      ),
      (error: unknown) => {
        assert.ok(error instanceof MediaUploadStorageError);
        assert.equal(error.message, "Unable to store media.");
        return true;
      },
    );

    assert.equal(repository.created.length, 0);
    assert.deepEqual(await listFiles(root), []);
  });
});

test("masks validator failures and removes the temporary object", async () => {
  await withDependencies(
    async ({ deps, repository, root }) => {
      await assert.rejects(
        storePendingMedia(
          {
            workspaceId: "workspace-1",
            userId: "user-1",
            originalName: "pixel.png",
            stream: Readable.from(PNG),
          },
          deps,
        ),
        MediaUploadStorageError,
      );

      assert.equal(repository.created.length, 0);
      assert.deepEqual(await listFiles(root), []);
    },
    {
      async validateFile() {
        throw new Error("validator leaked C:\\private\\object.part");
      },
    },
  );
});

test("masks temporary storage initialization failures", async () => {
  await withDependencies(async ({ deps }) => {
    const storage = deps.storage;
    deps.storage = {
      ...storage,
      async createTemporaryObject() {
        throw new Error("failed to create C:\\private\\secret.part");
      },
    };

    await assert.rejects(
      storePendingMedia(
        {
          workspaceId: "workspace-1",
          userId: "user-1",
          originalName: "pixel.png",
          stream: Readable.from(PNG),
        },
        deps,
      ),
      (error: unknown) => {
        assert.ok(error instanceof MediaUploadStorageError);
        assert.equal(error.message, "Unable to store media.");
        return true;
      },
    );
  });
});

test("masks repository failures and removes the committed object", async () => {
  const failingRepository: PendingMediaRepository = {
    async create() {
      throw new Error("database rejected task-media/private-key");
    },
    async remove() {},
  };

  await withDependencies(
    async ({ deps, root }) => {
      await assert.rejects(
        storePendingMedia(
          {
            workspaceId: "workspace-1",
            userId: "user-1",
            originalName: "pixel.png",
            claimedMime: "image/png",
            stream: Readable.from(PNG),
          },
          deps,
        ),
        (error: unknown) => {
          assert.ok(error instanceof MediaUploadStorageError);
          assert.equal(error.message, "Unable to store media.");
          return true;
        },
      );

      assert.deepEqual(await listFiles(root), []);
    },
    { repository: failingRepository },
  );
});
