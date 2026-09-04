import { Prisma } from "@prisma/client";
import { z } from "zod";
import { broadcastConversationEvent } from "~/server/lib/conversation-events";
import { broadcastInboxEvent } from "~/server/lib/inbox-events";
import {
  createPrismaMattermostInboundDependencies,
  ingestMattermostPost,
  MattermostInboundError,
} from "~/server/lib/mattermost/inbound";
import { getMattermostConfig } from "~/server/lib/mattermost/client";
import { verifyMattermostRequest } from "~/server/lib/mattermost/signature";
import prisma from "~/server/lib/prisma";
import { serializeConversationMessage } from "~/server/lib/serializers";

const CALLBACK_PATH = "/api/integrations/mattermost/events";

const PluginPostEventSchema = z.object({
  event_id: z.string().min(1).max(191),
  post_id: z.string().min(1),
  channel_id: z.string().min(1),
  user_id: z.string().min(1),
  message: z.string().min(1).max(10_000),
  create_at: z.number().int().nonnegative(),
}).strict();

export default defineEventHandler(async (event) => {
  const rawBody = (await readRawBody(event, "utf8")) ?? "";
  const timestamp = Number(getHeader(event, "x-crm-timestamp"));
  const nonce = getHeader(event, "x-crm-nonce") ?? "";
  const signature = getHeader(event, "x-crm-signature") ?? "";
  const config = getMattermostConfig(
    useRuntimeConfig(event) as unknown as Record<string, unknown>,
  );
  if (!config.enabled || !config.pluginSecret) {
    throw createError({
      statusCode: 503,
      statusMessage: "Mattermost synchronization is unavailable",
    });
  }

  const verified = await verifyMattermostRequest(
    {
      body: rawBody,
      method: event.method,
      nonce,
      path: CALLBACK_PATH,
      secret: config.pluginSecret,
      timestamp,
      signature,
    },
    {
      claimNonce: async (claimedNonce, expiresAt) => {
        try {
          await prisma.mattermostWebhookNonce.create({
            data: { nonce: claimedNonce, expiresAt: new Date(expiresAt) },
          });
          return true;
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            return false;
          }
          throw error;
        }
      },
    },
  );
  if (!verified) {
    throw createError({ statusCode: 401, statusMessage: "Invalid signature" });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw createError({ statusCode: 400, statusMessage: "Invalid JSON" });
  }
  const validated = PluginPostEventSchema.safeParse(parsed);
  if (!validated.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid Mattermost event",
    });
  }

  let result;
  try {
    result = await ingestMattermostPost(
      validated.data,
      createPrismaMattermostInboundDependencies(prisma, (input) => {
        try {
          broadcastConversationEvent(input.conversationId, {
            type: "MESSAGE_CREATED",
            conversationId: input.conversationId,
            message: serializeConversationMessage(input.message),
          });
          broadcastInboxEvent(input.workspaceId, {
            type: "MESSAGE_CREATED",
            workspaceId: input.workspaceId,
            conversationId: input.conversationId,
            senderId: input.senderId,
          });
        } catch {
          // Realtime delivery is best effort after the database commit.
        }
      }),
    );
  } catch (error) {
    if (error instanceof MattermostInboundError) {
      throw createError({
        statusCode: error.status,
        statusMessage: error.message,
      });
    }
    throw error;
  }

  setResponseStatus(event, result.duplicate ? 200 : 202);
  return result;
});
