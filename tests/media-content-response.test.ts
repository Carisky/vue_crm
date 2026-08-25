import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMediaContentResponse,
  type MediaContentMetadata,
} from "../server/lib/media-content-response.ts";

const image: MediaContentMetadata = {
  mime: "image/png",
  name: "photo.png",
  size: 100,
  kind: "image",
};

test("builds safe inline headers for a full image response", () => {
  assert.deepEqual(buildMediaContentResponse(image), {
    status: 200,
    range: null,
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": "inline; filename=\"photo.png\"; filename*=UTF-8''photo.png",
      "Content-Length": "100",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
});

test("builds a partial video response with exact range headers", () => {
  const result = buildMediaContentResponse(
    { ...image, mime: "video/mp4", name: "clip.mp4", kind: "video" },
    "bytes=10-999",
  );

  assert.deepEqual(result, {
    status: 206,
    range: { start: 10, end: 99 },
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": "inline; filename=\"clip.mp4\"; filename*=UTF-8''clip.mp4",
      "Content-Length": "90",
      "Content-Range": "bytes 10-99/100",
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
});

test("uses an attachment disposition for documents and SVG", () => {
  for (const metadata of [
    { ...image, mime: "application/pdf", name: "report.pdf", kind: "pdf" as const },
    { ...image, mime: "image/svg+xml", name: "diagram.svg", kind: "image" as const },
    { ...image, mime: "application/vnd.ms-excel", name: "budget.xls", kind: "document" as const },
  ]) {
    const response = buildMediaContentResponse(metadata);
    const expected = metadata.mime === "image/svg+xml" || metadata.kind === "document"
      ? "attachment"
      : "inline";
    assert.match(response.headers["Content-Disposition"], new RegExp(`^${expected};`));
  }
});

test("forces an attachment disposition for an email download", () => {
  const response = buildMediaContentResponse(image, undefined, {
    forceDownload: true,
  });

  assert.match(response.headers["Content-Disposition"], /^attachment;/);
});

test("surfaces invalid ranges so the route can respond with 416", () => {
  assert.throws(() => buildMediaContentResponse(image, "bytes=100-100"));
});
