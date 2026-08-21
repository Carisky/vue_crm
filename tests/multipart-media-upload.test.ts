import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, type Readable } from "node:stream";
import test from "node:test";

import { register } from "tsx/esm/api";

import {
  MultipartMediaUploadError,
  parseMediaMultipart,
  type MultipartMediaUploadHandlers,
} from "../server/lib/multipart-media-upload.ts";
import {
  MediaUploadStorageError,
  MediaUploadTooLargeError,
  storePendingMedia,
  type MediaUploadDependencies,
} from "../server/lib/media-upload-service.ts";
import { createPrivateFilesystemStorage } from "../server/lib/storage/filesystem.ts";

register();
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalDefineEventHandler = (
  globalThis as typeof globalThis & { defineEventHandler?: unknown }
).defineEventHandler;
process.env.DATABASE_URL =
  "mysql://test:test@localhost:3306/private_media_test";
(
  globalThis as typeof globalThis & {
    defineEventHandler: <T>(handler: T) => T;
  }
).defineEventHandler = (handler) => handler;
const { default: mediaUploadRoute } = await import(
  "../server/api/tasks/media.post.ts"
);
if (originalDatabaseUrl === undefined) {
  delete process.env.DATABASE_URL;
} else {
  process.env.DATABASE_URL = originalDatabaseUrl;
}
(
  globalThis as typeof globalThis & { defineEventHandler?: unknown }
).defineEventHandler = originalDefineEventHandler;

type MultipartPart =
  | { field: string; value: string }
  | { field: string; filename: string; mime?: string; value: string };

const boundary = "----private-media-test-boundary";

function multipartBody(parts: MultipartPart[]): Buffer {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if ("filename" in part) {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.field}"; filename="${part.filename}"\r\n` +
            `Content-Type: ${part.mime ?? "application/octet-stream"}\r\n\r\n`,
        ),
      );
    } else {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.field}"\r\n\r\n`,
        ),
      );
    }
    chunks.push(Buffer.from(part.value));
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

function parse(
  parts: MultipartPart[],
  handlers: Partial<MultipartMediaUploadHandlers> = {},
) {
  const request = new PassThrough();
  Object.assign(request, {
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  });
  const authorizeCalls: string[] = [];
  const uploadCalls: string[] = [];
  const streams: Readable[] = [];

  const promise = parseMediaMultipart({ node: { req: request } } as never, {
    maxFiles: 3,
    maxFileSizeBytes: 1024,
    async authorizeWorkspace(workspaceId) {
      authorizeCalls.push(workspaceId);
    },
    async uploadFile(input) {
      uploadCalls.push(input.originalName);
      streams.push(input.stream);
      let size = 0;
      for await (const chunk of input.stream) {
        size += Buffer.byteLength(chunk);
      }
      return {
        id: `media-${uploadCalls.length}`,
        name: input.originalName,
        mime: input.claimedMime || "application/octet-stream",
        size,
        kind: "image",
      };
    },
    ...handlers,
  });
  request.end(multipartBody(parts));

  return { promise, request, authorizeCalls, uploadCalls, streams };
}

test("rejects a file before workspace_id without authorizing or uploading and drains the request", async () => {
  const operation = parse([
    {
      field: "files",
      filename: "first.png",
      mime: "image/png",
      value: "bytes",
    },
    { field: "workspace_id", value: "workspace-1" },
  ]);

  await assert.rejects(operation.promise, MultipartMediaUploadError);
  assert.deepEqual(operation.authorizeCalls, []);
  assert.deepEqual(operation.uploadCalls, []);
  assert.equal(operation.request.readableEnded, true);
});

test("requires at least one file", async () => {
  const operation = parse([{ field: "workspace_id", value: "workspace-1" }]);

  await assert.rejects(operation.promise, MultipartMediaUploadError);
  assert.deepEqual(operation.authorizeCalls, ["workspace-1"]);
  assert.deepEqual(operation.uploadCalls, []);
});

test("accepts binary parts only from the files field", async () => {
  const operation = parse([
    { field: "workspace_id", value: "workspace-1" },
    {
      field: "avatar",
      filename: "first.png",
      mime: "image/png",
      value: "bytes",
    },
  ]);

  await assert.rejects(operation.promise, MultipartMediaUploadError);
  assert.deepEqual(operation.authorizeCalls, ["workspace-1"]);
  assert.deepEqual(operation.uploadCalls, []);
  assert.equal(operation.request.readableEnded, true);
});

test("rejects files beyond the configured maximum while preserving completed files", async () => {
  const operation = parse(
    [
      { field: "workspace_id", value: "workspace-1" },
      {
        field: "files",
        filename: "first.png",
        mime: "image/png",
        value: "one",
      },
      {
        field: "files",
        filename: "second.png",
        mime: "image/png",
        value: "two",
      },
    ],
    { maxFiles: 1 },
  );

  await assert.rejects(operation.promise, MultipartMediaUploadError);
  assert.deepEqual(operation.authorizeCalls, ["workspace-1"]);
  assert.deepEqual(operation.uploadCalls, ["first.png"]);
  assert.equal(operation.request.readableEnded, true);
});

test("returns multiple uploaded files in multipart order", async () => {
  const operation = parse([
    { field: "workspace_id", value: "workspace-1" },
    { field: "files", filename: "first.png", mime: "image/png", value: "one" },
    { field: "files", filename: "second.png", mime: "image/png", value: "two" },
    {
      field: "files",
      filename: "third.png",
      mime: "image/png",
      value: "three",
    },
  ]);

  const files = await operation.promise;
  assert.deepEqual(
    files.map((file) => file.name),
    ["first.png", "second.png", "third.png"],
  );
});

test("truncates an oversized file while draining the multipart request", async () => {
  let truncated = false;
  const operation = parse(
    [
      { field: "workspace_id", value: "workspace-1" },
      {
        field: "files",
        filename: "first.png",
        mime: "image/png",
        value: "12345",
      },
    ],
    {
      maxFileSizeBytes: 4,
      async uploadFile(input) {
        for await (const _chunk of input.stream) {
          // Consume the bounded Busboy stream.
        }
        truncated = input.stream.truncated;
        if (truncated) throw new MediaUploadTooLargeError();
        return {
          id: "unexpected",
          name: "unexpected",
          mime: "image/png",
          size: 4,
          kind: "image",
        };
      },
    },
  );

  await assert.rejects(operation.promise, MediaUploadTooLargeError);
  assert.equal(truncated, true);
  assert.equal(operation.request.readableEnded, true);
});

test("waits for authorization before upload and for every upload after parsing finishes", async () => {
  let releaseAuthorization!: () => void;
  let releaseUpload!: () => void;
  const authorization = new Promise<void>((resolve) => {
    releaseAuthorization = resolve;
  });
  const upload = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  let uploadStarted = false;
  let settled = false;

  const operation = parse(
    [
      { field: "workspace_id", value: "workspace-1" },
      {
        field: "files",
        filename: "first.png",
        mime: "image/png",
        value: "bytes",
      },
    ],
    {
      async authorizeWorkspace() {
        await authorization;
      },
      async uploadFile(input) {
        uploadStarted = true;
        for await (const _chunk of input.stream) {
          // Consume the real Busboy stream before delaying persistence completion.
        }
        await upload;
        return {
          id: "media-1",
          name: input.originalName,
          mime: "image/png",
          size: 5,
          kind: "image",
        };
      },
    },
  );
  void operation.promise.finally(() => {
    settled = true;
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(uploadStarted, false);

  releaseAuthorization();
  while (!uploadStarted) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);

  releaseUpload();
  const files = await operation.promise;
  assert.deepEqual(files, [
    {
      id: "media-1",
      name: "first.png",
      mime: "image/png",
      size: 5,
      kind: "image",
    },
  ]);
  assert.deepEqual(Object.keys(files[0] ?? {}).sort(), [
    "id",
    "kind",
    "mime",
    "name",
    "size",
  ]);
});

test("does not start an upload when membership authorization fails", async () => {
  const authorizationError = new Error("Unauthorized");
  const operation = parse(
    [
      { field: "workspace_id", value: "workspace-1" },
      {
        field: "files",
        filename: "first.png",
        mime: "image/png",
        value: "bytes",
      },
    ],
    {
      async authorizeWorkspace() {
        throw authorizationError;
      },
    },
  );

  await assert.rejects(
    operation.promise,
    (error: unknown) => error === authorizationError,
  );
  assert.deepEqual(operation.uploadCalls, []);
  assert.equal(operation.request.readableEnded, true);
});

test("settles after temporary storage rejects before consuming the Busboy file stream", async () => {
  const root = await mkdtemp(join(tmpdir(), "multipart-storage-rejection-"));
  const realStorage = createPrivateFilesystemStorage(root);
  const deps: MediaUploadDependencies = {
    maxFileSizeBytes: 1024,
    storage: {
      ...realStorage,
      async createTemporaryObject() {
        throw new Error(
          "temporary storage unavailable at C:\\private\\secret.part",
        );
      },
    },
    repository: {
      async create() {
        return { id: "unexpected" };
      },
      async remove() {},
    },
  };
  const operation = parse(
    [
      { field: "workspace_id", value: "workspace-1" },
      {
        field: "files",
        filename: "first.png",
        mime: "image/png",
        value: "bytes",
      },
    ],
    {
      uploadFile(input) {
        return storePendingMedia(
          {
            workspaceId: input.workspaceId,
            userId: "user-1",
            originalName: input.originalName,
            claimedMime: input.claimedMime,
            stream: input.stream,
          },
          deps,
        );
      },
    },
  );

  let timeout: NodeJS.Timeout | undefined;
  try {
    await assert.rejects(
      Promise.race([
        operation.promise,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error("parseMediaMultipart did not settle")),
            150,
          );
        }),
      ]),
      (error: unknown) => {
        assert.ok(error instanceof MediaUploadStorageError);
        assert.equal(error.message, "Unable to store media.");
        return true;
      },
    );
  } finally {
    if (timeout) clearTimeout(timeout);
    await rm(root, { recursive: true, force: true });
  }
});

test("maps a truncated multipart protocol error to a stable route-level 400", async () => {
  const request = new PassThrough();
  Object.assign(request, {
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  });
  const event = {
    context: { user: { id: "user-1" } },
    node: { req: request },
  } as never;
  const response = mediaUploadRoute(event);
  request.end(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="workspace_id"`,
    ),
  );

  await assert.rejects(response, (error: unknown) => {
    const httpError = error as {
      statusCode?: number;
      statusMessage?: string;
      message?: string;
    };
    assert.equal(httpError.statusCode, 400);
    assert.equal(httpError.statusMessage, "Invalid media upload");
    assert.doesNotMatch(
      `${httpError.statusMessage ?? ""} ${httpError.message ?? ""}`,
      /unexpected|multipart|boundary|storage|path|key/iu,
    );
    return true;
  });
});
