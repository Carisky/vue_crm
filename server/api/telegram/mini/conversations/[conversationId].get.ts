import prisma from "~/server/lib/prisma";
import { serializeConversationMessage } from "~/server/lib/serializers";
import { requireTelegramMiniAppUser } from "~/server/lib/telegram-mini-app";
import { telegramConversationTitle } from "~/server/lib/telegram";

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
          participants: {
            include: {
              user: { select: { name: true, email: true } },
            },
          },
        },
      },
    },
  });
  if (!participant || !participant.conversation.workspace.members.length) {
    throw createError({ status: 404, statusText: "Conversation not found" });
  }

  const messages = await prisma.conversationMessage.findMany({
    where: { conversationId },
    include: { sender: true },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  return {
    conversation: {
      id: participant.conversation.id,
      title: telegramConversationTitle(
        participant.conversation,
        connection.userId,
      ),
      type: participant.conversation.type,
    },
    current_user_id: connection.userId,
    messages: messages.reverse().map(serializeConversationMessage),
  };
});
