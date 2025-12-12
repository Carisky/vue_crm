import prisma from "~/server/lib/prisma";
import { ensureWorkspaceAccess } from "~/server/lib/workspace";
import { serializeProject } from "~/server/lib/serializers";

export default defineEventHandler(async (event) => {
  const { workspaceId } = getRouterParams(event);

  await ensureWorkspaceAccess(event, workspaceId);

  const projects = await prisma.project.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });

  return { projects: projects.map((project) => serializeProject(project)) };
});
