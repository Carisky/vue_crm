import { MemberRole } from "@prisma/client";

import prisma from "~/server/lib/prisma";
import {
  requireUser,
  requireWorkspaceMembership,
} from "~/server/lib/permissions";
import { deleteTaskMediaFile } from "~/server/lib/task-media";

export default defineEventHandler(async (event) => {
  requireUser(event);

  const { taskId } = await readBody<{ taskId?: string }>(event);
  if (!taskId) {
    throw createError({ status: 400, statusText: "Task ID required" });
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { media: true },
  });
  if (!task) {
    throw createError({ status: 404, statusText: "Task not found" });
  }

  await requireWorkspaceMembership(event, task.workspaceId, [
    MemberRole.ADMIN,
  ]);

  if (task.media?.length) {
    await Promise.all(
      task.media.map((media) => deleteTaskMediaFile(media.path)),
    );
  }

  await prisma.task.delete({ where: { id: taskId } });

  return { ok: true };
});
