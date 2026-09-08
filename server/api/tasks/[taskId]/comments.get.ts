import prisma from "~/server/lib/prisma";
import { requireUser, requireWorkspaceMembership } from "~/server/lib/permissions";
import { serializeTaskComment } from "~/server/lib/serializers";
import { requireProjectAccess } from "~/server/lib/project-access";

export default defineEventHandler(async (event) => {
  requireUser(event);
  const { taskId } = getRouterParams(event);

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, workspaceId: true, projectId: true },
  });

  if (!task) {
    throw createError({ status: 404, statusText: "Task not found" });
  }

  await requireWorkspaceMembership(event, task.workspaceId);
  await requireProjectAccess(event, task.projectId);

  const comments = await prisma.taskComment.findMany({
    where: { taskId: task.id },
    orderBy: { createdAt: "asc" },
    include: {
      author: true,
      mentions: {
        include: { user: true },
      },
    },
    take: 200,
  });

  return { comments: comments.map(serializeTaskComment) };
});

