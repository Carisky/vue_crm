import prisma from "~/server/lib/prisma";
import { requireUser } from "~/server/lib/permissions";
import { ensureWorkspaceAccess } from "~/server/lib/workspace";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const { conversationId } = getRouterParams(event);

  const participant = await prisma.conversationParticipant.findFirst({
    where: {
      conversationId,
      userId: user.id,
    },
    include: {
      conversation: { select: { workspaceId: true } },
    },
  });

  if (!participant) {
    throw createError({ status: 404, statusText: "Conversation not found" });
  }

  await ensureWorkspaceAccess(event, participant.conversation.workspaceId);

  await prisma.conversationParticipant.update({
    where: {
      conversationId_userId: {
        conversationId,
        userId: user.id,
      },
    },
    data: {
      lastReadAt: new Date(),
    },
  });

  return { ok: true };
});

