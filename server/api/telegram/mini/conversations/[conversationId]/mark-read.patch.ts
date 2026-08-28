import prisma from "~/server/lib/prisma";
import { broadcastConversationEvent } from "~/server/lib/conversation-events";
import { broadcastInboxEvent } from "~/server/lib/inbox-events";
import { requireTelegramMiniAppUser } from "~/server/lib/telegram-mini-app";

export default defineEventHandler(async (event) => {
  const connection = await requireTelegramMiniAppUser(event);
  const { conversationId } = getRouterParams(event);
  const participant = await prisma.conversationParticipant.findUnique({
    where: {
      conversationId_userId: {
        conversationId,
        userId: connection.userId,
      },
    },
    include: {
      conversation: {
        include: {
          workspace: {
            include: {
              members: {
                where: { userId: connection.userId },
                select: { id: true },
              },
            },
          },
        },
      },
    },
  });
  if (!participant || !participant.conversation.workspace.members.length) {
    throw createError({ status: 404, statusText: "Conversation not found" });
  }

  const now = new Date();
  await prisma.conversationParticipant.update({
    where: {
      conversationId_userId: {
        conversationId,
        userId: connection.userId,
      },
    },
    data: { lastReadAt: now },
  });

  try {
    broadcastConversationEvent(conversationId, {
      type: "READ_UPDATED",
      conversationId,
      userId: connection.userId,
      lastReadAt: now.toISOString(),
    });
    broadcastInboxEvent(participant.conversation.workspaceId, {
      type: "INBOX_UPDATED",
      workspaceId: participant.conversation.workspaceId,
    });
  } catch {
    // Realtime delivery is best effort.
  }
  return { last_read_at: now.toISOString() };
});
