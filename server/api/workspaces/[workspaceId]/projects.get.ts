import prisma from "~/server/lib/prisma";
import { ensureWorkspaceAccess } from "~/server/lib/workspace";
import { serializeProject } from "~/server/lib/serializers";
import { buildProjectProgressMap } from "~/lib/hierarchy";
import { getVisibleProjectIds } from "~/server/lib/project-access";
import { requireUser } from "~/server/lib/permissions";
import { calculateEffectivelyRestrictedProjectIds } from "~/server/lib/project-access-policy";

export default defineEventHandler(async (event) => {
  const { workspaceId } = getRouterParams(event);

  const user = requireUser(event);
  await ensureWorkspaceAccess(event, workspaceId);
  const visibleProjectIds = await getVisibleProjectIds(event, workspaceId);

  const [projects, tasks] = await Promise.all([
    prisma.project.findMany({
      where: { workspaceId, id: { in: [...visibleProjectIds] } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.task.findMany({
      where: { workspaceId, projectId: { in: [...visibleProjectIds] } },
      select: { id: true, parentId: true, projectId: true, status: true },
    }),
  ]);

  const progress = buildProjectProgressMap(
    projects.map(({ id, parentId }) => ({ id, parentId })),
    tasks.map((task) => ({
      id: task.id,
      parentId: task.parentId,
      projectId: task.projectId,
      done: task.status === "DONE",
    })),
  );
  const restrictedProjectIds = calculateEffectivelyRestrictedProjectIds(projects);

  return {
    projects: projects.map((project) =>
      ({
        ...serializeProject(project, progress.get(project.id)),
        can_manage_access: project.creatorId === user.id,
        is_effectively_restricted: restrictedProjectIds.has(project.id),
      }),
    ),
  };
});
