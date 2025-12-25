import prisma from "~/server/lib/prisma";
import { requireUser, requireWorkspaceMembership } from "~/server/lib/permissions";
import { deleteTaskMediaFile } from "~/server/lib/task-media";

export default defineEventHandler(async (event) => {
  requireUser(event);

  const { path, workspace_id, media_id } = await readBody<{
    path?: string;
    workspace_id?: string;
    media_id?: string;
  }>(event);

  if (!path && !media_id) {
    throw createError({
      status: 400,
      statusText: "Media path or media ID required",
    });
  }

  if (media_id) {
    const media = await prisma.taskMedia.findUnique({
      where: { id: media_id },
      include: { task: true },
    });
    if (!media || !media.task) {
      throw createError({ status: 404, statusText: "Media not found" });
    }

    await requireWorkspaceMembership(event, media.task.workspaceId);
    await deleteTaskMediaFile(media.path);
    await prisma.taskMedia.delete({ where: { id: media_id } });
  } else {
    if (!workspace_id) {
      throw createError({ status: 400, statusText: "Workspace ID required" });
    }

    await requireWorkspaceMembership(event, workspace_id);
    await deleteTaskMediaFile(path ?? "");
  }

  return { ok: true };
});
