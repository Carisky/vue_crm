import { ConversationType, type Prisma } from "@prisma/client";

import prisma from "./prisma";

type ChannelDatabase = Prisma.TransactionClient | typeof prisma;

export async function ensureWorkspaceGeneralConversation(
  workspaceId: string,
  db: ChannelDatabase = prisma,
) {
  const now = new Date();
  const conversation = await db.conversation.upsert({
    where: {
      workspaceId_channelKey: {
        workspaceId,
        channelKey: "workspace",
      },
    },
    create: {
      workspaceId,
      type: ConversationType.WORKSPACE,
      name: "General",
      channelKey: "workspace",
    },
    update: {
      type: ConversationType.WORKSPACE,
    },
    select: { id: true },
  });

  const members = await db.member.findMany({
    where: { workspaceId },
    select: { userId: true },
  });
  if (members.length) {
    await db.conversationParticipant.createMany({
      data: members.map((member) => ({
        conversationId: conversation.id,
        userId: member.userId,
        lastReadAt: now,
      })),
      skipDuplicates: true,
    });
  }

  return conversation;
}

export async function syncConversationParticipants(
  db: Prisma.TransactionClient,
  conversationId: string,
  userIds: string[],
) {
  const uniqueUserIds = [...new Set(userIds)];
  await db.conversationParticipant.deleteMany({
    where: {
      conversationId,
      ...(uniqueUserIds.length ? { userId: { notIn: uniqueUserIds } } : {}),
    },
  });

  if (uniqueUserIds.length) {
    const now = new Date();
    await db.conversationParticipant.createMany({
      data: uniqueUserIds.map((userId) => ({
        conversationId,
        userId,
        lastReadAt: now,
      })),
      skipDuplicates: true,
    });
  }
}
