import { z } from "zod";

import prisma from "~/server/lib/prisma";
import { broadcastConversationEvent } from "~/server/lib/conversation-events";
import { broadcastInboxEvent } from "~/server/lib/inbox-events";
import { serializeConversationMessage } from "~/server/lib/serializers";
import { requireTelegramMiniAppUser } from "~/server/lib/telegram-mini-app";

const SendMessageSchema = z.object({
  body: z.string().trim().min(1).max(10_000),
});

export default defineEventHandler(async (event) => {
  const connection = await requireTelegramMiniAppUser(event);
  const { conversationId } = getRouterParams(event);
  const params = await readValidatedBody(event, (body) =>
    SendMessageSchema.safeParse(body),
  );
  if (!params.success) {
    throw createError({ status: 400, statusText: params.error.message });
  }

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
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.conversationMessage.create({
      data: {
        conversationId,
        senderId: connection.userId,
        body: params.data.body,
        createdAt: now,
      },
      include: { sender: true },
    });
    await tx.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId: connection.userId,
        },
      },
      data: { lastReadAt: now },
    });
    await tx.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: now },
    });
    return created;
  });

  try {
    broadcastConversationEvent(conversationId, {
      type: "MESSAGE_CREATED",
      conversationId,
      message: serializeConversationMessage(message),
    });
    broadcastInboxEvent(participant.conversation.workspaceId, {
      type: "MESSAGE_CREATED",
      workspaceId: participant.conversation.workspaceId,
      conversationId,
      senderId: connection.userId,
    });
  } catch {
    // Realtime delivery is best effort.
  }

  return { message: serializeConversationMessage(message) };
});
