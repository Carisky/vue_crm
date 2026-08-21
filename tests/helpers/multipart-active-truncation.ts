import { Buffer } from "node:buffer";
import { PassThrough } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";

import {
  MultipartMediaUploadError,
  parseMediaMultipart,
} from "../../server/lib/multipart-media-upload.ts";

const boundary = "----active-file-truncation-boundary";
const request = new PassThrough();
Object.assign(request, {
  headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
});

const parsing = parseMediaMultipart({ node: { req: request } } as never, {
  maxFiles: 1,
  maxFileSizeBytes: 1024,
  async authorizeWorkspace() {},
  async uploadFile({ stream }) {
    await delay(25);
    stream.destroy();
    throw new Error("delayed storage failure");
  },
});

request.end(
  Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="workspace_id"\r\n\r\n` +
      `workspace-1\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="files"; filename="first.png"\r\n` +
      `Content-Type: image/png\r\n\r\n` +
      `truncated-file-bytes`,
  ),
);

try {
  await parsing;
  process.stderr.write("parser unexpectedly succeeded\n");
  process.exitCode = 2;
} catch (error) {
  if (!(error instanceof MultipartMediaUploadError)) {
    process.stderr.write("parser returned an unstable terminal error\n");
    process.exitCode = 2;
  } else {
    process.stdout.write(
      JSON.stringify({ name: error.name, message: error.message }),
    );
    await new Promise((resolve) => setImmediate(resolve));
  }
}
