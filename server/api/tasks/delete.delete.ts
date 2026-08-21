import { MemberRole } from "@prisma/client";

import prisma from "~/server/lib/prisma";
import {
  requireUser,
  requireWorkspaceMembership,
} from "~/server/lib/permissions";
import { deleteTaskMediaObjects } from "~/server/lib/task-media-delete";
import { getPrivateStorage } from "~/server/lib/storage";
import { broadcastTaskEvent } from "~/server/lib/task-events";

export default defineEventHandler(async (event) => {
  requireUser(event);

  const { taskId } = await readBody<{ taskId?: string }>(event);
  if (!taskId) {
    throw createError({ status: 400, statusText: "Task ID required" });
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { media: { include: { variants: true } } },
  });
  if (!task) {
    throw createError({ status: 404, statusText: "Task not found" });
  }

  await requireWorkspaceMembership(event, task.workspaceId, [
    MemberRole.ADMIN,
  ]);

  await deleteTaskMediaObjects(task.media, getPrivateStorage().storage);

  await prisma.task.delete({ where: { id: taskId } });

  try {
    broadcastTaskEvent(task.workspaceId, {
      type: "TASK_DELETED",
      workspaceId: task.workspaceId,
      taskId,
    });
  } catch {
    // ignore realtime errors
  }

  return { ok: true };
});
