import assert from "node:assert/strict";
import test from "node:test";

import { serializeTaskMedia } from "../server/lib/serializers.ts";

test("serializes only public task media metadata", () => {
  const result = serializeTaskMedia({
    id: "media-1",
    path: "/uploads/tasks/media/private.pdf",
    storageKey: "task-media/private-key",
    mime: "application/pdf",
    originalName: "report.pdf",
    size: 123,
    resolution: null,
    variants: [
      {
        id: "variant-1",
        path: "/uploads/tasks/media/private-360.mp4",
        storageKey: "task-media-variant/private-key",
        mime: "video/mp4",
        size: 80,
        resolution: 360,
      },
    ],
  } as never);

  assert.deepEqual(result, {
    id: "media-1",
    name: "report.pdf",
    mime: "application/pdf",
    size: 123,
    kind: "pdf",
    resolution: null,
    variants: [
      {
        id: "variant-1",
        mime: "video/mp4",
        size: 80,
        resolution: 360,
      },
    ],
  });
  assert.equal("path" in result, false);
  assert.equal("storageKey" in result, false);
});
