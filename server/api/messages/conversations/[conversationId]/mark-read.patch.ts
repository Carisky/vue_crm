import prisma from "~/server/lib/prisma";
import { requireUser } from "~/server/lib/permissions";
import { ensureWorkspaceAccess } from "~/server/lib/workspace";
import { broadcastConversationEvent } from "~/server/lib/conversation-events";
import { broadcastInboxEvent } from "~/server/lib/inbox-events";

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

  const now = new Date();
  await prisma.conversationParticipant.update({
    where: {
      conversationId_userId: {
        conversationId,
        userId: user.id,
      },
    },
    data: {
      lastReadAt: now,
    },
  });

  try {
    broadcastConversationEvent(conversationId, {
      type: "READ_UPDATED",
      conversationId,
      userId: user.id,
      lastReadAt: now.toISOString(),
    });
  } catch {
    // ignore realtime errors
  }

  try {
    const workspaceId = participant.conversation.workspaceId;
    broadcastInboxEvent(workspaceId, {
      type: "INBOX_UPDATED",
      workspaceId,
    });
  } catch {
    // ignore realtime errors
  }

  return { ok: true };
});
