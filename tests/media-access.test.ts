import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizeMediaRead,
  MediaReadForbiddenError,
  MediaReadNotFoundError,
  type MediaAccessDependencies,
  type MediaAccessRow,
} from "../server/lib/media-access.ts";

function mediaRow(overrides: Partial<MediaAccessRow> = {}): MediaAccessRow {
  return {
    id: "media-1",
    taskId: "task-1",
    workspaceId: "workspace-1",
    uploadedById: "user-1",
    storageKey: "task-media/original",
    mime: "application/pdf",
    originalName: "report.pdf",
    size: 123,
    resolution: null,
    variants: [
      {
        id: "variant-1",
        taskMediaId: "media-1",
        storageKey: "task-media-variant/one",
        mime: "video/mp4",
        size: 80,
        resolution: 360,
      },
    ],
    ...overrides,
  };
}

function dependencies(
  row: MediaAccessRow | null,
  isMember = true,
): MediaAccessDependencies {
  return {
    media: { findById: async () => row },
    membership: { exists: async () => isMember },
  };
}

test("authorizes attached media for a workspace member", async () => {
  const result = await authorizeMediaRead(
    { mediaId: "media-1", userId: "user-2" },
    dependencies(mediaRow()),
  );

  assert.deepEqual(result, {
    key: "task-media/original",
    mime: "application/pdf",
    name: "report.pdf",
    size: 123,
    kind: "pdf",
    resolution: null,
  });
});

test("rejects attached media for a nonmember", async () => {
  await assert.rejects(
    authorizeMediaRead(
      { mediaId: "media-1", userId: "user-2" },
      dependencies(mediaRow(), false),
    ),
    MediaReadForbiddenError,
  );
});

test("authorizes pending media only for its uploader who remains a member", async () => {
  const pending = mediaRow({ taskId: null });
  const result = await authorizeMediaRead(
    { mediaId: "media-1", userId: "user-1" },
    dependencies(pending),
  );

  assert.equal(result.key, "task-media/original");

  await assert.rejects(
    authorizeMediaRead(
      { mediaId: "media-1", userId: "user-2" },
      dependencies(pending),
    ),
    MediaReadForbiddenError,
  );
  await assert.rejects(
    authorizeMediaRead(
      { mediaId: "media-1", userId: "user-1" },
      dependencies(pending, false),
    ),
    MediaReadForbiddenError,
  );
});

test("rejects a missing storage key and an unknown row as not found", async () => {
  await assert.rejects(
    authorizeMediaRead(
      { mediaId: "media-1", userId: "user-1" },
      dependencies(mediaRow({ storageKey: null })),
    ),
    MediaReadNotFoundError,
  );
  await assert.rejects(
    authorizeMediaRead(
      { mediaId: "missing", userId: "user-1" },
      dependencies(null),
    ),
    MediaReadNotFoundError,
  );
});

test("selects only an owned variant", async () => {
  const result = await authorizeMediaRead(
    { mediaId: "media-1", variantId: "variant-1", userId: "user-2" },
    dependencies(mediaRow()),
  );
  assert.deepEqual(result, {
    key: "task-media-variant/one",
    mime: "video/mp4",
    name: "report.pdf",
    size: 80,
    kind: "video",
    resolution: 360,
  });

  await assert.rejects(
    authorizeMediaRead(
      { mediaId: "media-1", variantId: "other-variant", userId: "user-2" },
      dependencies(mediaRow()),
    ),
    MediaReadNotFoundError,
  );
});
