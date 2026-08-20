export function buildWorkspaceInviteUrl(
  origin: string,
  workspaceId: string,
  inviteCode: string,
) {
  const normalizedOrigin = origin.replace(/\/$/, "");
  return `${normalizedOrigin}/workspaces/${encodeURIComponent(workspaceId)}/join/${encodeURIComponent(inviteCode)}`;
}
