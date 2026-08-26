import prisma from "~/server/lib/prisma";
import { ensureWorkspaceAccess } from "~/server/lib/workspace";
import { serializeProject } from "~/server/lib/serializers";
import { buildProjectProgressMap } from "~/lib/hierarchy";

export default defineEventHandler(async (event) => {
  const { workspaceId } = getRouterParams(event);

  await ensureWorkspaceAccess(event, workspaceId);

  const [projects, tasks] = await Promise.all([
    prisma.project.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.task.findMany({
      where: { workspaceId },
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

  return {
    projects: projects.map((project) =>
      serializeProject(project, progress.get(project.id)),
    ),
  };
});
