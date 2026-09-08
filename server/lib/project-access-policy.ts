export type ProjectAccessNode = {
  id: string;
  parentId: string | null;
  visibility: "PUBLIC" | "PRIVATE";
  creatorId: string;
};

export function calculateVisibleProjectIds(input: {
  userId: string;
  isAdmin: boolean;
  projects: ProjectAccessNode[];
  grantedProjectIds: ReadonlySet<string>;
}) {
  const byId = new Map(input.projects.map((project) => [project.id, project]));
  const resolved = new Map<string, boolean>();
  const visiting = new Set<string>();

  const canAccess = (projectId: string): boolean => {
    const cached = resolved.get(projectId);
    if (cached !== undefined) return cached;
    const project = byId.get(projectId);
    if (!project || visiting.has(projectId)) return false;

    visiting.add(projectId);
    const parentAllowed = project.parentId
      ? canAccess(project.parentId)
      : true;
    const nodeAllowed =
      input.isAdmin ||
      project.visibility === "PUBLIC" ||
      project.creatorId === input.userId ||
      input.grantedProjectIds.has(project.id);
    visiting.delete(projectId);

    const allowed = parentAllowed && nodeAllowed;
    resolved.set(projectId, allowed);
    return allowed;
  };

  return new Set(
    input.projects.filter((project) => canAccess(project.id)).map(({ id }) => id),
  );
}
