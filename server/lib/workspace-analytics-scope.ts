export function buildWorkspaceAnalyticsScopes(
  workspaceId: string,
  visibleProjectIds: ReadonlySet<string>,
) {
  const projectIds = [...visibleProjectIds];
  return {
    projects: { workspaceId, id: { in: projectIds } },
    members: { workspaceId },
    tasks: { workspaceId, projectId: { in: projectIds } },
  };
}
