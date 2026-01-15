import { createEventStream } from "h3";

import prisma from "~/server/lib/prisma";
import { requireUser } from "~/server/lib/permissions";
import { ensureWorkspaceAccess } from "~/server/lib/workspace";
import { registerConversationEventStream } from "~/server/lib/conversation-events";

const KEEPALIVE_INTERVAL_MS = 25_000;

export default defineEventHandler(async (event) => {
  const user = requireUser(event);

  const { conversation_id } = getQuery(event);
  if (!conversation_id || typeof conversation_id !== "string") {
    throw createError({
      status: 400,
      statusText: "Conversation ID required",
    });
  }

  const participant = await prisma.conversationParticipant.findFirst({
    where: {
      conversationId: conversation_id,
      userId: user.id,
    },
    include: {
      conversation: {
        select: { workspaceId: true },
      },
    },
  });

  if (!participant) {
    throw createError({ status: 404, statusText: "Conversation not found" });
  }

  await ensureWorkspaceAccess(event, participant.conversation.workspaceId);

  const stream = createEventStream(event);
  const unregister = registerConversationEventStream(conversation_id, stream);

  const sendPromise = stream.send();

  const keepAliveTimer = setInterval(() => {
    stream.push({ event: "ping", data: Date.now().toString() }).catch(() => {});
  }, KEEPALIVE_INTERVAL_MS);

  stream.onClosed(() => {
    clearInterval(keepAliveTimer);
    unregister();
  });

  await stream.push({ event: "connected", data: "ok" });
  await stream.push({ event: "ping", data: Date.now().toString() });
  return sendPromise;
});

