import prisma from "~/server/lib/prisma";
import { requireUser, requireWorkspaceMembership } from "~/server/lib/permissions";

export default defineEventHandler(async (event) => {
  requireUser(event);
  const { projectId } = getRouterParams(event);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, workspaceId: true },
  });

  if (!project) {
    throw createError({ status: 404, statusText: "Project not found" });
  }

  await requireWorkspaceMembership(event, project.workspaceId);

  const sections = await prisma.projectDocSection.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
    take: 200,
  });

  return {
    sections: sections.map((section) => ({
      id: section.id,
      title: section.title,
      createdAt: section.createdAt.toISOString(),
      updatedAt: section.updatedAt.toISOString(),
    })),
  };
});

