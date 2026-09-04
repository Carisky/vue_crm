import { z } from "zod";

import prisma from "~/server/lib/prisma";
import { broadcastConversationEvent } from "~/server/lib/conversation-events";
import { broadcastInboxEvent } from "~/server/lib/inbox-events";
import { serializeConversationMessage } from "~/server/lib/serializers";
import { requireTelegramMiniAppUser } from "~/server/lib/telegram-mini-app";
import {
  ConversationNotFoundError,
  createLocalConversationMessage,
  createPrismaLocalMessageDependencies,
} from "~/server/lib/mattermost/message-service";

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

  let result;
  try {
    result = await createLocalConversationMessage(
      {
        conversationId,
        senderId: connection.userId,
        body: params.data.body,
      },
      createPrismaLocalMessageDependencies(prisma),
    );
  } catch (error) {
    if (error instanceof ConversationNotFoundError) {
      throw createError({ status: 404, statusText: error.message });
    }
    throw error;
  }
  const { message, workspaceId } = result;

  try {
    broadcastConversationEvent(conversationId, {
      type: "MESSAGE_CREATED",
      conversationId,
      message: serializeConversationMessage(message),
    });
    broadcastInboxEvent(workspaceId, {
      type: "MESSAGE_CREATED",
      workspaceId,
      conversationId,
      senderId: connection.userId,
    });
  } catch {
    // Realtime delivery is best effort.
  }

  return { message: serializeConversationMessage(message) };
});
