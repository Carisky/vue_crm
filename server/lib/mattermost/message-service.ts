import type { Prisma, PrismaClient } from "@prisma/client";
import { enqueueMessageCreate } from "./domain-events.ts";

export type CreateLocalConversationMessageInput = {
  conversationId: string;
  senderId: string;
  body: string;
  createdAt?: Date;
};

type MessageOutboxInput = {
  kind: "message.create";
  idempotencyKey: string;
  payload: { message_id: string };
};

export type LocalMessageDependencies<TTransaction, TMessage extends { id: string }> = {
  transaction<T>(
    callback: (transaction: TTransaction) => Promise<T>,
  ): Promise<T>;
  authorize(
    transaction: TTransaction,
    input: Pick<CreateLocalConversationMessageInput, "conversationId" | "senderId">,
  ): Promise<{ workspaceId: string } | null>;
  createMessage(
    transaction: TTransaction,
    input: Required<CreateLocalConversationMessageInput>,
  ): Promise<TMessage>;
  markRead(
    transaction: TTransaction,
    input: Pick<
      Required<CreateLocalConversationMessageInput>,
      "conversationId" | "senderId" | "createdAt"
    >,
  ): Promise<void>;
  touchConversation(
    transaction: TTransaction,
    input: Pick<
      Required<CreateLocalConversationMessageInput>,
      "conversationId" | "createdAt"
    >,
  ): Promise<void>;
  enqueue(
    transaction: TTransaction,
    input: MessageOutboxInput,
  ): Promise<void>;
};

export class ConversationNotFoundError extends Error {
  constructor() {
    super("Conversation not found");
    this.name = "ConversationNotFoundError";
  }
}

export async function createLocalConversationMessage<
  TTransaction,
  TMessage extends { id: string },
>(
  input: CreateLocalConversationMessageInput,
  dependencies: LocalMessageDependencies<TTransaction, TMessage>,
) {
  const createdAt = input.createdAt ?? new Date();
  return dependencies.transaction(async (transaction) => {
    const access = await dependencies.authorize(transaction, input);
    if (!access) throw new ConversationNotFoundError();

    const message = await dependencies.createMessage(transaction, {
      ...input,
      createdAt,
    });
    await dependencies.markRead(transaction, {
      conversationId: input.conversationId,
      senderId: input.senderId,
      createdAt,
    });
    await dependencies.touchConversation(transaction, {
      conversationId: input.conversationId,
      createdAt,
    });
    await dependencies.enqueue(transaction, {
      kind: "message.create",
      idempotencyKey: `message.create:${message.id}`,
      payload: { message_id: message.id },
    });
    return { message, workspaceId: access.workspaceId };
  });
}

export function createPrismaLocalMessageDependencies(database: PrismaClient) {
  return {
    transaction<T>(callback: (transaction: Prisma.TransactionClient) => Promise<T>) {
      return database.$transaction(callback);
    },
    async authorize(
      transaction: Prisma.TransactionClient,
      input: Pick<CreateLocalConversationMessageInput, "conversationId" | "senderId">,
    ) {
      const participant = await transaction.conversationParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId: input.conversationId,
            userId: input.senderId,
          },
        },
        include: {
          conversation: {
            include: {
              workspace: {
                include: {
                  members: {
                    where: { userId: input.senderId },
                    select: { id: true },
                  },
                },
              },
            },
          },
        },
      });
      return participant?.conversation.workspace.members.length
        ? { workspaceId: participant.conversation.workspaceId }
        : null;
    },
    createMessage(
      transaction: Prisma.TransactionClient,
      input: Required<CreateLocalConversationMessageInput>,
    ) {
      return transaction.conversationMessage.create({
        data: {
          conversationId: input.conversationId,
          senderId: input.senderId,
          body: input.body,
          createdAt: input.createdAt,
        },
        include: { sender: true },
      });
    },
    async markRead(
      transaction: Prisma.TransactionClient,
      input: Pick<
        Required<CreateLocalConversationMessageInput>,
        "conversationId" | "senderId" | "createdAt"
      >,
    ) {
      await transaction.conversationParticipant.update({
        where: {
          conversationId_userId: {
            conversationId: input.conversationId,
            userId: input.senderId,
          },
        },
        data: { lastReadAt: input.createdAt },
      });
    },
    async touchConversation(
      transaction: Prisma.TransactionClient,
      input: Pick<
        Required<CreateLocalConversationMessageInput>,
        "conversationId" | "createdAt"
      >,
    ) {
      await transaction.conversation.update({
        where: { id: input.conversationId },
        data: { updatedAt: input.createdAt },
      });
    },
    async enqueue(
      transaction: Prisma.TransactionClient,
      input: MessageOutboxInput,
    ) {
      await enqueueMessageCreate(transaction, {
        messageId: input.payload.message_id,
      });
    },
  } satisfies LocalMessageDependencies<
    Prisma.TransactionClient,
    Prisma.ConversationMessageGetPayload<{ include: { sender: true } }>
  >;
}
