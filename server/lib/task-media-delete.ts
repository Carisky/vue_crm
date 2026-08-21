export type TaskMediaDeleteRow = {
  id: string;
  taskId: string | null;
  workspaceId: string;
  uploadedById: string | null;
  storageKey: string | null;
  variants: { storageKey: string | null }[];
};

export type TaskMediaDeleteDependencies = {
  media: {
    findById(id: string): Promise<TaskMediaDeleteRow | null>;
    deleteById(id: string): Promise<void>;
  };
  membership: { exists(input: { workspaceId: string; userId: string }): Promise<boolean> };
  storage: { remove(key: string): Promise<boolean> };
};

export class MediaDeleteNotFoundError extends Error {}
export class MediaDeleteForbiddenError extends Error {}

export async function deleteTaskMediaObjects(
  mediaRows: Pick<TaskMediaDeleteRow, "storageKey" | "variants">[],
  storage: TaskMediaDeleteDependencies["storage"],
): Promise<void> {
  for (const media of mediaRows) {
    for (const key of [media.storageKey, ...media.variants.map((variant) => variant.storageKey)]) {
      if (key) await storage.remove(key);
    }
  }
}

export async function deleteTaskMediaById(
  input: { mediaId: string; userId: string },
  deps: TaskMediaDeleteDependencies,
): Promise<{ taskId: string | null; workspaceId: string }> {
  const media = await deps.media.findById(input.mediaId);
  if (!media) throw new MediaDeleteNotFoundError();
  const member = await deps.membership.exists({ workspaceId: media.workspaceId, userId: input.userId });
  if (!member || (media.taskId === null && media.uploadedById !== input.userId)) throw new MediaDeleteForbiddenError();
  await deleteTaskMediaObjects([media], deps.storage);
  await deps.media.deleteById(media.id);
  return { taskId: media.taskId, workspaceId: media.workspaceId };
}
