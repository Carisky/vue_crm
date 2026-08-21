export type PendingMediaCleanupDependencies = {
  media: { findExpiredPending(input: { before: Date; take: number }): Promise<{ id: string; storageKey: string | null }[]>; deleteById(id: string): Promise<void> };
  storage: { remove(key: string): Promise<boolean> };
};

export async function removeExpiredPendingMedia(input: { now?: Date; batchSize?: number }, deps: PendingMediaCleanupDependencies): Promise<{ removed: number; failed: number }> {
  const before = new Date((input.now ?? new Date()).getTime() - 24 * 60 * 60 * 1000);
  const rows = await deps.media.findExpiredPending({ before, take: input.batchSize ?? 100 });
  let removed = 0;
  let failed = 0;
  for (const row of rows) {
    try { if (row.storageKey) await deps.storage.remove(row.storageKey); await deps.media.deleteById(row.id); removed += 1; } catch { failed += 1; }
  }
  return { removed, failed };
}
