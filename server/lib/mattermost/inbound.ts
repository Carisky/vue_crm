import { Prisma, type PrismaClient } from "@prisma/client";
import type { PluginPostEvent } from "./contracts.ts";

export type MattermostInboundDependencies<
  TTransaction,
  TMessage extends { id: string },
> = {
  transaction<T>(
    callback: (transaction: TTransaction) => Promise<T>,
  ): Promise<T>;
  claimEvent(transaction: TTransaction, event: PluginPostEvent): Promise<void>;
  resolveConversation(
    transaction: TTransaction,
    channelId: string,
  ): Promise<{ conversationId: string; workspaceId: string } | null>;
  resolveUser(
    transaction: TTransaction,
    mattermostUserId: string,
  ): Promise<{ userId: string } | null>;
  isParticipant(
    transaction: TTransaction,
    conversationId: string,
    userId: string,
  ): Promise<boolean>;
  createMessage(
    transaction: TTransaction,
    input: {
      conversationId: string;
      senderId: string;
      body: string;
      createdAt: Date;
    },
  ): Promise<TMessage>;
  linkPost(
    transaction: TTransaction,
    input: { messageId: string; postId: string },
  ): Promise<void>;
  touchConversation(
    transaction: TTransaction,
    conversationId: string,
    createdAt: Date,
  ): Promise<void>;
  finishEvent(transaction: TTransaction, eventId: string): Promise<void>;
  isUniqueViolation(error: unknown): boolean;
  broadcast(input: {
    conversationId: string;
    workspaceId: string;
    senderId: string;
    message: TMessage;
  }): void;
};

export class MattermostInboundError extends Error {
  readonly status: number;

  constructor(message: string, status = 422) {
    super(message);
    this.name = "MattermostInboundError";
    this.status = status;
  }
}

export async function ingestMattermostPost<
  TTransaction,
  TMessage extends { id: string },
>(
  event: PluginPostEvent,
  dependencies: MattermostInboundDependencies<TTransaction, TMessage>,
): Promise<{ duplicate: true } | { duplicate: false; messageId: string }> {
  let committed:
    | {
        conversationId: string;
        workspaceId: string;
        senderId: string;
        message: TMessage;
      }
    | undefined;
  try {
    committed = await dependencies.transaction(async (transaction) => {
      await dependencies.claimEvent(transaction, event);
      const conversation = await dependencies.resolveConversation(
        transaction,
        event.channel_id,
      );
      if (!conversation) {
        throw new MattermostInboundError("Mattermost channel is not mapped");
      }
      const user = await dependencies.resolveUser(transaction, event.user_id);
      if (!user) {
        throw new MattermostInboundError("Mattermost user is not mapped");
      }
      if (
        !(await dependencies.isParticipant(
          transaction,
          conversation.conversationId,
          user.userId,
        ))
      ) {
        throw new MattermostInboundError("Mattermost participant is revoked");
      }

      const createdAt = new Date(event.create_at);
      const message = await dependencies.createMessage(transaction, {
        conversationId: conversation.conversationId,
        senderId: user.userId,
        body: event.message,
        createdAt,
      });
      await dependencies.linkPost(transaction, {
        messageId: message.id,
        postId: event.post_id,
      });
      await dependencies.touchConversation(
        transaction,
        conversation.conversationId,
        createdAt,
      );
      await dependencies.finishEvent(transaction, event.event_id);
      return {
        conversationId: conversation.conversationId,
        workspaceId: conversation.workspaceId,
        senderId: user.userId,
        message,
      };
    });
  } catch (error) {
    if (dependencies.isUniqueViolation(error)) return { duplicate: true };
    throw error;
  }

  dependencies.broadcast(committed);
  return { duplicate: false, messageId: committed.message.id };
}

export function createPrismaMattermostInboundDependencies(
  database: PrismaClient,
  broadcast: MattermostInboundDependencies<
    Prisma.TransactionClient,
    Prisma.ConversationMessageGetPayload<{ include: { sender: true } }>
  >["broadcast"],
) {
  return {
    transaction<T>(callback: (transaction: Prisma.TransactionClient) => Promise<T>) {
      return database.$transaction(callback);
    },
    async claimEvent(transaction: Prisma.TransactionClient, event: PluginPostEvent) {
      await transaction.mattermostInboundEvent.create({
        data: { eventId: event.event_id, mattermostPostId: event.post_id },
      });
    },
    async resolveConversation(
      transaction: Prisma.TransactionClient,
      channelId: string,
    ) {
      const link = await transaction.mattermostConversationLink.findUnique({
        where: { mattermostChannelId: channelId },
        include: { conversation: { select: { id: true, workspaceId: true } } },
      });
      return link
        ? {
            conversationId: link.conversation.id,
            workspaceId: link.conversation.workspaceId,
          }
        : null;
    },
    async resolveUser(
      transaction: Prisma.TransactionClient,
      mattermostUserId: string,
    ) {
      const link = await transaction.mattermostUserLink.findUnique({
        where: { mattermostUserId },
        select: { userId: true },
      });
      return link;
    },
    async isParticipant(
      transaction: Prisma.TransactionClient,
      conversationId: string,
      userId: string,
    ) {
      return Boolean(
        await transaction.conversationParticipant.findUnique({
          where: { conversationId_userId: { conversationId, userId } },
          select: { id: true },
        }),
      );
    },
    createMessage(
      transaction: Prisma.TransactionClient,
      input: {
        conversationId: string;
        senderId: string;
        body: string;
        createdAt: Date;
      },
    ) {
      return transaction.conversationMessage.create({
        data: input,
        include: { sender: true },
      });
    },
    async linkPost(
      transaction: Prisma.TransactionClient,
      input: { messageId: string; postId: string },
    ) {
      await transaction.mattermostMessageLink.create({
        data: {
          messageId: input.messageId,
          mattermostPostId: input.postId,
          origin: "MATTERMOST",
          syncState: "SYNCED",
          lastSyncedAt: new Date(),
        },
      });
    },
    async touchConversation(
      transaction: Prisma.TransactionClient,
      conversationId: string,
      createdAt: Date,
    ) {
      await transaction.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: createdAt },
      });
    },
    async finishEvent(transaction: Prisma.TransactionClient, eventId: string) {
      await transaction.mattermostInboundEvent.update({
        where: { eventId },
        data: { processedAt: new Date() },
      });
    },
    isUniqueViolation(error: unknown) {
      return (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      );
    },
    broadcast,
  } satisfies MattermostInboundDependencies<
    Prisma.TransactionClient,
    Prisma.ConversationMessageGetPayload<{ include: { sender: true } }>
  >;
}

export async function deleteExpiredMattermostNonces(
  injectedDatabase?: Pick<PrismaClient, "mattermostWebhookNonce">,
) {
  const database =
    injectedDatabase ??
    ((await import("../prisma.ts")).default as Pick<
      PrismaClient,
      "mattermostWebhookNonce"
    >);
  await database.mattermostWebhookNonce.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });
}
