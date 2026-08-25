import assert from "node:assert/strict";
import test from "node:test";

import {
  formatMediaSize,
  mediaContentUrl,
  mediaDownloadContentUrl,
  mediaDownloadPagePath,
  mediaIconName,
} from "../lib/task-media-presentation.ts";

test("builds media content URLs exclusively from encoded opaque IDs", () => {
  assert.equal(mediaContentUrl("m 1"), "/api/tasks/media/m%201/content");
  assert.equal(
    mediaContentUrl("m1", "v 1"),
    "/api/tasks/media/m1/content?variant_id=v%201",
  );
  assert.equal(mediaDownloadPagePath("m 1"), "/downloads/m%201");
  assert.equal(
    mediaDownloadContentUrl("m 1"),
    "/api/tasks/media/m%201/content?download=1",
  );
});

test("formats media metadata for cards without a path", () => {
  assert.equal(formatMediaSize(1536), "1.5 KB");
  assert.equal(mediaIconName("pdf"), "lucide:file-text");
  assert.equal(mediaIconName("video"), "lucide:video");
});
