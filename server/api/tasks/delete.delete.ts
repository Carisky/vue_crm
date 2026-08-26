import { MemberRole } from "@prisma/client";

import prisma from "~/server/lib/prisma";
import {
  requireUser,
  requireWorkspaceMembership,
} from "~/server/lib/permissions";
import { deleteTaskMediaObjects } from "~/server/lib/task-media-delete";
import { getPrivateStorage } from "~/server/lib/storage";
import { broadcastTaskEvent } from "~/server/lib/task-events";
import { collectDescendantIds } from "~/lib/hierarchy";

export default defineEventHandler(async (event) => {
  requireUser(event);

  const { taskId } = await readBody<{ taskId?: string }>(event);
  if (!taskId) {
    throw createError({ status: 400, statusText: "Task ID required" });
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
  });
  if (!task) {
    throw createError({ status: 404, statusText: "Task not found" });
  }

  await requireWorkspaceMembership(event, task.workspaceId, [
    MemberRole.ADMIN,
  ]);

  const workspaceTasks = await prisma.task.findMany({
    where: { workspaceId: task.workspaceId },
    select: { id: true, parentId: true },
  });
  const taskIds = collectDescendantIds(workspaceTasks, task.id);
  const branchMedia = await prisma.taskMedia.findMany({
    where: { taskId: { in: taskIds } },
    include: { variants: true },
  });

  await deleteTaskMediaObjects(branchMedia, getPrivateStorage().storage);

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
