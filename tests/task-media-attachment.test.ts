import assert from "node:assert/strict";
import test from "node:test";

import { tsImport } from "tsx/esm/api";

import {
  assertAndAttachPendingMedia,
  type TaskMediaTransaction,
} from "../server/lib/task-media-service.ts";

type PendingRow = {
  id: string;
  taskId: string | null;
  workspaceId: string;
  uploadedById: string | null;
  storageKey: string | null;
};

function pendingRow(overrides: Partial<PendingRow> = {}): PendingRow {
  return {
    id: "media-1",
    taskId: null,
    workspaceId: "workspace-1",
    uploadedById: "user-1",
    storageKey: "task-media/private-key",
    ...overrides,
  };
}

function createTransaction(rows: PendingRow[]) {
  const state = rows.map((row) => ({ ...row }));
  const calls: { findMany: unknown[]; updateMany: unknown[] } = {
    findMany: [],
    updateMany: [],
  };

  const db: TaskMediaTransaction = {
    taskMedia: {
      async findMany(args) {
        calls.findMany.push(args);
        return state.filter((row) => args.where.id.in.includes(row.id));
      },
      async updateMany(args) {
        calls.updateMany.push(args);
        const matching = state.filter(
          (row) =>
            args.where.id.in.includes(row.id) &&
            row.taskId === args.where.taskId &&
            row.workspaceId === args.where.workspaceId &&
            row.uploadedById === args.where.uploadedById &&
            row.storageKey !== args.where.storageKey.not,
        );
        for (const row of matching) row.taskId = args.data.taskId;
        return { count: matching.length };
      },
    },
  };

  return { calls, db, state };
}

async function attach(
  db: TaskMediaTransaction,
  mediaIds = ["media-1", "media-2"],
) {
  return assertAndAttachPendingMedia({
    taskId: "task-1",
    mediaIds,
    workspaceId: "workspace-1",
    userId: "user-1",
    db,
  });
}

test("attaches the complete owned pending media set with guarded predicates", async () => {
  const { calls, db, state } = createTransaction([
    pendingRow(),
    pendingRow({ id: "media-2", storageKey: "task-media/second-key" }),
  ]);

  await attach(db);

  assert.deepEqual(
    state.map((row) => row.taskId),
    ["task-1", "task-1"],
  );
  assert.deepEqual(calls.updateMany, [
    {
      where: {
        id: { in: ["media-1", "media-2"] },
        taskId: null,
        workspaceId: "workspace-1",
        uploadedById: "user-1",
        storageKey: { not: null },
      },
      data: { taskId: "task-1" },
    },
  ]);
});

for (const invalidCase of [
  {
    name: "an absent ID",
    ids: ["media-1", "missing-media"],
    rows: [pendingRow()],
  },
  {
    name: "another uploader",
    ids: ["media-1", "media-2"],
    rows: [pendingRow(), pendingRow({ id: "media-2", uploadedById: "user-2" })],
  },
  {
    name: "another workspace",
    ids: ["media-1", "media-2"],
    rows: [
      pendingRow(),
      pendingRow({ id: "media-2", workspaceId: "workspace-2" }),
    ],
  },
  {
    name: "an already attached row",
    ids: ["media-1", "media-2"],
    rows: [pendingRow(), pendingRow({ id: "media-2", taskId: "task-2" })],
  },
  {
    name: "a row without a storage key",
    ids: ["media-1", "media-2"],
    rows: [pendingRow(), pendingRow({ id: "media-2", storageKey: null })],
  },
] as const) {
  test(`rejects ${invalidCase.name} without attaching any row`, async () => {
    const { calls, db, state } = createTransaction([...invalidCase.rows]);

    await assert.rejects(attach(db, [...invalidCase.ids]));

    assert.equal(calls.updateMany.length, 0);
    assert.ok(state.every((row) => row.taskId !== "task-1"));
  });
}

test("rejects duplicate IDs without fetching or attaching rows", async () => {
  const { calls, db, state } = createTransaction([pendingRow()]);

  await assert.rejects(attach(db, ["media-1", "media-1"]));

  assert.equal(calls.findMany.length, 0);
  assert.equal(calls.updateMany.length, 0);
  assert.equal(state[0]?.taskId, null);
});

test("throws when the guarded update count changes so the transaction can roll back", async () => {
  const { db } = createTransaction([
    pendingRow(),
    pendingRow({ id: "media-2", storageKey: "task-media/second-key" }),
  ]);
  db.taskMedia.updateMany = async () => ({ count: 1 });

  await assert.rejects(attach(db));
});

test("accepts opaque media IDs and rejects the old path payload", async () => {
  const { CreateTasksSchema } = (await tsImport(
    "../lib/schema/createTask.ts",
    import.meta.url,
  )) as typeof import("../lib/schema/createTask.ts");
  const baseTask = {
    name: "Task",
    workspace_id: "workspace-1",
    project_id: "project-1",
    status: "TODO",
    priority: "MEDIUM",
  };

  const parsed = CreateTasksSchema.safeParse({
    ...baseTask,
    media_ids: ["media-1"],
  });

  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.deepEqual(parsed.data.media_ids, ["media-1"]);
  assert.equal(
    CreateTasksSchema.safeParse({
      ...baseTask,
      media: [{ path: "/uploads/x" }],
    }).success,
    false,
  );
});
