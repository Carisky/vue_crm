import { ensureWorkspaceAccess } from "~/server/lib/workspace";
import { requireUser } from "~/server/lib/permissions";
import prisma from "~/server/lib/prisma";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const body = await readBody<{
    ids?: string[];
    workspaceId?: string;
  }>(event);

  if (body.workspaceId) {
    await ensureWorkspaceAccess(event, body.workspaceId);
  }

  const where: Record<string, unknown> = {
    userId: user.id,
    isRead: false,
  };

  if (body.ids?.length) {
    where.id = { in: body.ids };
  } else if (body.workspaceId) {
    where.workspaceId = body.workspaceId;
  }

  await prisma.notification.updateMany({
    where,
    data: {
      isRead: true,
    },
  });

  return { ok: true };
});
