import { z } from "zod";

import { requireUser } from "~/server/lib/permissions";
import prisma from "~/server/lib/prisma";
import { serializeConversationMessage } from "~/server/lib/serializers";
import { broadcastConversationEvent } from "~/server/lib/conversation-events";
import { broadcastInboxEvent } from "~/server/lib/inbox-events";
import {
  ConversationNotFoundError,
  createLocalConversationMessage,
  createPrismaLocalMessageDependencies,
} from "~/server/lib/mattermost/message-service";

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

  let result;
  try {
    result = await createLocalConversationMessage(
      { conversationId, senderId: user.id, body: params.data.body },
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
  } catch {
    // ignore realtime errors
  }

  try {
    broadcastInboxEvent(workspaceId, {
      type: "MESSAGE_CREATED",
      workspaceId,
      conversationId,
      senderId: user.id,
    });
  } catch {
    // ignore realtime errors
  }

  return { message: serializeConversationMessage(message) };
});
