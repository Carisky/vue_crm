type PendingTaskMediaRow = {
  id: string;
  taskId: string | null;
  workspaceId: string;
  uploadedById: string | null;
  storageKey: string | null;
};

type PendingTaskMediaWhere = {
  id: { in: string[] };
  taskId: null;
  workspaceId: string;
  uploadedById: string;
  storageKey: { not: null };
};

export type TaskMediaTransaction = {
  taskMedia: {
    findMany(input: {
      where: { id: { in: string[] } };
      select: {
        id: true;
        taskId: true;
        workspaceId: true;
        uploadedById: true;
        storageKey: true;
      };
    }): Promise<PendingTaskMediaRow[]>;
    updateMany(input: {
      where: PendingTaskMediaWhere;
      data: { taskId: string };
    }): Promise<{ count: number }>;
  };
};

export class PendingMediaAttachmentError extends Error {
  constructor() {
    super("Unable to attach pending media.");
    this.name = "PendingMediaAttachmentError";
  }
}

function rejectPendingMedia(): never {
  throw new PendingMediaAttachmentError();
}

export async function assertAndAttachPendingMedia(input: {
  taskId: string;
  mediaIds: string[];
  workspaceId: string;
  userId: string;
  db: TaskMediaTransaction;
}): Promise<void> {
  if (input.mediaIds.length === 0) return;

  const uniqueIds = new Set(input.mediaIds);
  if (uniqueIds.size !== input.mediaIds.length) rejectPendingMedia();

  const rows = await input.db.taskMedia.findMany({
    where: { id: { in: input.mediaIds } },
    select: {
      id: true,
      taskId: true,
      workspaceId: true,
      uploadedById: true,
      storageKey: true,
    },
  });

  if (
    rows.length !== input.mediaIds.length ||
    rows.some(
      (row) =>
        row.taskId !== null ||
        row.workspaceId !== input.workspaceId ||
        row.uploadedById !== input.userId ||
        row.storageKey === null,
    )
  ) {
    rejectPendingMedia();
  }

  const result = await input.db.taskMedia.updateMany({
    where: {
      id: { in: input.mediaIds },
      taskId: null,
      workspaceId: input.workspaceId,
      uploadedById: input.userId,
      storageKey: { not: null },
    },
    data: { taskId: input.taskId },
  });

  if (result.count !== input.mediaIds.length) rejectPendingMedia();
}
