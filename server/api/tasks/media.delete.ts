import { createError, readBody } from "h3";
import prisma from "~/server/lib/prisma";
import { requireUser } from "~/server/lib/permissions";
import { getPrivateStorage } from "~/server/lib/storage";
import { deleteTaskMediaById, MediaDeleteForbiddenError, MediaDeleteNotFoundError } from "~/server/lib/task-media-delete";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const body = await readBody<{ media_id?: unknown }>(event);
  if (typeof body?.media_id !== "string" || !body.media_id) throw createError({ statusCode: 400, statusMessage: "Media ID required" });
  try {
    return await deleteTaskMediaById({ mediaId: body.media_id, userId: user.id }, {
      media: {
        findById: (id) => prisma.taskMedia.findUnique({ where: { id }, select: { id: true, taskId: true, workspaceId: true, uploadedById: true, storageKey: true, variants: { select: { storageKey: true } } } }),
        deleteById: async (id) => { await prisma.taskMedia.delete({ where: { id } }); },
      },
      membership: { async exists(input) { return Boolean(await prisma.member.findFirst({ where: input, select: { id: true } })); } },
      storage: getPrivateStorage().storage,
    }).then(() => ({ ok: true }));
  } catch (error) {
    if (error instanceof MediaDeleteNotFoundError || error instanceof MediaDeleteForbiddenError) throw createError({ statusCode: 404, statusMessage: "Media not found" });
    throw error;
  }
});
