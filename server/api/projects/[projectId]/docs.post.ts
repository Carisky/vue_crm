import { z } from "zod";

import prisma from "~/server/lib/prisma";
import { requireUser, requireWorkspaceMembership } from "~/server/lib/permissions";

const CreateProjectDocSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(200_000),
  section_id: z.string().min(1).optional(),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const { projectId } = getRouterParams(event);

  const params = await readValidatedBody(event, (body) =>
    CreateProjectDocSchema.safeParse(body),
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

  if (params.data.section_id) {
    const section = await prisma.projectDocSection.findFirst({
      where: {
        id: params.data.section_id,
        projectId: project.id,
      },
      select: { id: true },
    });
    if (!section) {
      throw createError({ status: 400, statusText: "Invalid section" });
    }
  }

  const created = await prisma.projectDoc.create({
    data: {
      workspaceId: project.workspaceId,
      projectId: project.id,
      authorId: user.id,
      title: params.data.title,
      body: params.data.body,
      sectionId: params.data.section_id ?? null,
    },
    select: {
      id: true,
      title: true,
      body: true,
      isLocked: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return {
    doc: {
      id: created.id,
      title: created.title,
      body: created.body,
      isLocked: created.isLocked,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    },
  };
});
