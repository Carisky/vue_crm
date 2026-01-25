import prisma from "~/server/lib/prisma";
import {
  requireUser,
  requireWorkspaceMembership,
} from "~/server/lib/permissions";
import { serializeTask } from "~/server/lib/serializers";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const { taskId } = getRouterParams(event);

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: true,
      assignee: true,
      media: { include: { variants: true } },
    },
  });

  if (!task) {
    throw createError({ status: 404, statusText: "Task not found" });
  }

  await requireWorkspaceMembership(event, task.workspaceId);

  return {
    task: serializeTask(task),
  };
});
