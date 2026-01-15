import prisma from "~/server/lib/prisma";
import { requireUser, requireWorkspaceMembership } from "~/server/lib/permissions";

export default defineEventHandler(async (event) => {
  requireUser(event);
  const { projectId, docId } = getRouterParams(event);

  const doc = await prisma.projectDoc.findFirst({
    where: { id: docId, projectId },
    include: {
      author: { select: { id: true, name: true, email: true } },
      project: { select: { id: true, workspaceId: true } },
    },
  });

  if (!doc) {
    throw createError({ status: 404, statusText: "Document not found" });
  }

  await requireWorkspaceMembership(event, doc.project.workspaceId);

  return {
    doc: {
      id: doc.id,
      projectId: doc.projectId,
      workspaceId: doc.workspaceId,
      title: doc.title,
      body: doc.body,
      isLocked: doc.isLocked,
      author: {
        id: doc.author.id,
        name: doc.author.name,
        email: doc.author.email,
      },
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    },
  };
});
