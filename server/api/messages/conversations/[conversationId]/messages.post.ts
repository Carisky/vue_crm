import { z } from "zod";

import prisma from "~/server/lib/prisma";
import { requireUser } from "~/server/lib/permissions";
import { ensureWorkspaceAccess } from "~/server/lib/workspace";
import { serializeConversationMessage } from "~/server/lib/serializers";

const SendMessageSchema = z.object({
  body: z.string().trim().min(1).max(10_000),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const { conversationId } = getRouterParams(event);

  const params = await readValidatedBody(event, (body) =>
    SendMessageSchema.safeParse(body),
  );

  if (!params.success) {
    throw createError({ status: 400, statusText: params.error.message });
  }

  const participant = await prisma.conversationParticipant.findFirst({
    where: {
      conversationId,
      userId: user.id,
    },
    include: {
      conversation: { select: { id: true, workspaceId: true } },
    },
  });

  if (!participant) {
    throw createError({ status: 404, statusText: "Conversation not found" });
  }

  await ensureWorkspaceAccess(event, participant.conversation.workspaceId);

  const now = new Date();
  const message = await prisma.conversationMessage.create({
    data: {
      conversationId,
      senderId: user.id,
      body: params.data.body,
      createdAt: now,
    },
    include: {
      sender: true,
    },
  });

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

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: now },
  });

  return { message: serializeConversationMessage(message) };
});

