import prisma from "~/server/lib/prisma";
import { requireUser } from "~/server/lib/permissions";
import { ensureWorkspaceAccess } from "~/server/lib/workspace";
import {
  serializeConversationMessage,
  serializeConversationParticipant,
} from "~/server/lib/serializers";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const { conversationId } = getRouterParams(event);

  const participant = await prisma.conversationParticipant.findFirst({
    where: {
      conversationId,
      userId: user.id,
    },
    include: {
      conversation: {
        include: {
          participants: { include: { user: true } },
        },
      },
    },
  });

  if (!participant) {
    throw createError({ status: 404, statusText: "Conversation not found" });
  }

  await ensureWorkspaceAccess(event, participant.conversation.workspaceId);

  const messages = await prisma.conversationMessage.findMany({
    where: { conversationId },
    include: { sender: true },
    orderBy: { createdAt: "asc" },
    take: 300,
  });

  return {
    conversation: {
      id: participant.conversation.id,
      workspace_id: participant.conversation.workspaceId,
      participants: participant.conversation.participants.map(
        serializeConversationParticipant,
      ),
      my_last_read_at: participant.lastReadAt
        ? participant.lastReadAt.toISOString()
        : null,
      updatedAt: participant.conversation.updatedAt.toISOString(),
    },
    messages: messages.map(serializeConversationMessage),
  };
});

