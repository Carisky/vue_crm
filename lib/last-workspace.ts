export const LAST_WORKSPACES_COOKIE = "last-workspace-by-user";

export function chooseWorkspaceId(
  workspaceIds: string[],
  rememberedId: string | null | undefined,
) {
  if (rememberedId && workspaceIds.includes(rememberedId)) return rememberedId;
  return workspaceIds[0] ?? null;
}

export function rememberWorkspace(
  current: Record<string, string> | null | undefined,
  userId: string,
  workspaceId: string,
) {
  return { ...(current ?? {}), [userId]: workspaceId };
}
