import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { PassThrough, type Readable } from "node:stream";
import test from "node:test";

import {
  MultipartMediaUploadError,
  parseMediaMultipart,
  type MultipartMediaUploadHandlers,
} from "../server/lib/multipart-media-upload.ts";
import { MediaUploadTooLargeError } from "../server/lib/media-upload-service.ts";

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
