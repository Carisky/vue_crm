import { z } from "zod";

import prisma from "~/server/lib/prisma";
import { requireUser, requireWorkspaceMembership } from "~/server/lib/permissions";

const CreateSectionSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const { projectId } = getRouterParams(event);

  const params = await readValidatedBody(event, (body) =>
    CreateSectionSchema.safeParse(body),
  );
  if (!params.success) {
    throw createError({ status: 400, statusText: params.error.message });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, workspaceId: true },
  });
  if (!project) {
    throw createError({ status: 404, statusText: "Project not found" });
  }

  await requireWorkspaceMembership(event, project.workspaceId);

  const section = await prisma.projectDocSection.create({
    data: {
      workspaceId: project.workspaceId,
      projectId: project.id,
      authorId: user.id,
      title: params.data.title,
    },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return {
    section: {
      id: section.id,
      title: section.title,
      createdAt: section.createdAt.toISOString(),
      updatedAt: section.updatedAt.toISOString(),
    },
  };
});

