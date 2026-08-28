import prisma from "~/server/lib/prisma";
import { requireTelegramMiniAppUser } from "~/server/lib/telegram-mini-app";
import { telegramConversationTitle } from "~/server/lib/telegram";

export default defineEventHandler(async (event) => {
  const connection = await requireTelegramMiniAppUser(event);
  const memberships = await prisma.conversationParticipant.findMany({
    where: {
      userId: connection.userId,
      conversation: {
        workspace: { members: { some: { userId: connection.userId } } },
      },
    },
    include: {
      conversation: {
        include: {
          workspace: { select: { id: true, name: true } },
          participants: {
            include: {
              user: { select: { name: true, email: true } },
            },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { sender: { select: { name: true, email: true } } },
          },
        },
      },
    },
    orderBy: { conversation: { updatedAt: "desc" } },
    take: 100,
  });

  const unreadCounts = await Promise.all(
    memberships.map((membership) =>
      prisma.conversationMessage.count({
        where: {
          conversationId: membership.conversationId,
          senderId: { not: connection.userId },
          ...(membership.lastReadAt
            ? { createdAt: { gt: membership.lastReadAt } }
            : {}),
        },
      }),
    ),
  );

  return {
    user: {
      id: connection.user.id,
      name: connection.user.name ?? connection.user.email,
    },
    conversations: memberships.map((membership, index) => {
      const conversation = membership.conversation;
      const lastMessage = conversation.messages[0];
      return {
        id: conversation.id,
        workspace_id: conversation.workspace.id,
        workspace_name: conversation.workspace.name,
        type: conversation.type,
        title: telegramConversationTitle(conversation, connection.userId),
        unread_count: unreadCounts[index] ?? 0,
        updated_at: conversation.updatedAt.toISOString(),
        last_message: lastMessage
          ? {
              body: lastMessage.body,
              sender_name: lastMessage.sender.name ?? lastMessage.sender.email,
              created_at: lastMessage.createdAt.toISOString(),
            }
          : null,
      };
    }),
  };
});
