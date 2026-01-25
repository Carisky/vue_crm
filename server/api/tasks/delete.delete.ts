import { MemberRole } from "@prisma/client";

import prisma from "~/server/lib/prisma";
import {
  requireUser,
  requireWorkspaceMembership,
} from "~/server/lib/permissions";
import { deleteTaskMediaFile } from "~/server/lib/task-media";
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

  if (task.media?.length) {
    await Promise.all(
      task.media.flatMap((media) => [
        deleteTaskMediaFile(media.path),
        ...(media.variants ?? []).map((variant) =>
          deleteTaskMediaFile(variant.path),
        ),
      ]),
    );
  }

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
