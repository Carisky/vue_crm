import { z } from "zod";

import prisma from "~/server/lib/prisma";
import { requireUser, requireWorkspaceMembership } from "~/server/lib/permissions";

const UpdateSectionSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const { projectId, sectionId } = getRouterParams(event);

  const params = await readValidatedBody(event, (body) =>
    UpdateSectionSchema.safeParse(body),
  );
  if (!params.success) {
    throw createError({ status: 400, statusText: params.error.message });
  }

  const section = await prisma.projectDocSection.findFirst({
    where: { id: sectionId, projectId },
    include: { project: { select: { workspaceId: true } } },
  });

  if (!section) {
    throw createError({ status: 404, statusText: "Section not found" });
  }

  await requireWorkspaceMembership(event, section.project.workspaceId);

  const updated = await prisma.projectDocSection.update({
    where: { id: section.id },
    data: { title: params.data.title },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return {
    section: {
      id: updated.id,
      title: updated.title,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  };
});

