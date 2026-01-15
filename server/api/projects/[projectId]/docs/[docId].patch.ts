import { z } from "zod";

import prisma from "~/server/lib/prisma";
import { requireUser, requireWorkspaceMembership } from "~/server/lib/permissions";

const UpdateProjectDocSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  body: z.string().trim().min(1).max(200_000).optional(),
  section_id: z.string().min(1).nullable().optional(),
  is_locked: z.boolean().optional(),
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const { projectId, docId } = getRouterParams(event);

  const params = await readValidatedBody(event, (body) =>
    UpdateProjectDocSchema.safeParse(body),
  );
  if (!params.success) {
    throw createError({ status: 400, statusText: params.error.message });
  }

  const existing = await prisma.projectDoc.findFirst({
    where: { id: docId, projectId },
    include: {
      project: { select: { workspaceId: true } },
    },
  });

  if (!existing) {
    throw createError({ status: 404, statusText: "Document not found" });
  }

  await requireWorkspaceMembership(event, existing.project.workspaceId);

  const isUnlocking =
    params.data.is_locked === false && existing.isLocked === true;
  const editingFieldsTouched =
    params.data.title !== undefined ||
    params.data.body !== undefined ||
    Object.prototype.hasOwnProperty.call(params.data, "section_id");

  if (existing.isLocked && editingFieldsTouched && !isUnlocking) {
    throw createError({
      status: 423,
      statusText: "Document is locked",
    });
  }

  if (Object.prototype.hasOwnProperty.call(params.data, "section_id")) {
    const sectionId = params.data.section_id;
    if (sectionId) {
      const section = await prisma.projectDocSection.findFirst({
        where: {
          id: sectionId,
          projectId: existing.projectId,
        },
        select: { id: true },
      });
      if (!section) {
        throw createError({ status: 400, statusText: "Invalid section" });
      }
    }
  }

  const updated = await prisma.projectDoc.update({
    where: { id: existing.id },
    data: {
      ...(params.data.title !== undefined ? { title: params.data.title } : {}),
      ...(params.data.body !== undefined ? { body: params.data.body } : {}),
      ...(Object.prototype.hasOwnProperty.call(params.data, "section_id")
        ? { sectionId: params.data.section_id }
        : {}),
      ...(params.data.is_locked !== undefined
        ? { isLocked: params.data.is_locked }
        : {}),
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
      id: updated.id,
      title: updated.title,
      body: updated.body,
      isLocked: updated.isLocked,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  };
});
