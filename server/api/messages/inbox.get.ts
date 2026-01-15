import prisma from "~/server/lib/prisma";
import { ensureWorkspaceAccess } from "~/server/lib/workspace";
import { requireUser } from "~/server/lib/permissions";
import {
  serializeConversationMessage,
  serializeConversationParticipant,
} from "~/server/lib/serializers";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const { workspace_id } = getQuery(event);

  if (!workspace_id || typeof workspace_id !== "string") {
    throw createError({ status: 400, statusText: "Workspace ID required" });
  }

  await ensureWorkspaceAccess(event, workspace_id);

  const mentionNotifications = await prisma.notification.findMany({
    where: {
      userId: user.id,
      workspaceId: workspace_id,
      type: "TASK_COMMENT_MENTION",
    },
    include: {
      task: { select: { id: true, name: true } },
      actor: { select: { id: true, name: true, email: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const mentions = mentionNotifications.map((notification) => ({
    id: notification.id,
    workspaceId: notification.workspaceId,
    taskId: notification.taskId,
    projectId: notification.projectId,
    actorId: notification.actorId,
    actorName: notification.actor?.name ?? notification.actor?.email ?? null,
    taskName: notification.task?.name ?? null,
    projectName: notification.project?.name ?? null,
    type: notification.type,
    message: notification.message,
    isRead: notification.isRead,
    createdAt: notification.createdAt.toISOString(),
  }));

  const unreadMentionsCount = mentionNotifications.filter(
    (item) => !item.isRead,
  ).length;

  const myConversations = await prisma.conversationParticipant.findMany({
    where: {
      userId: user.id,
      conversation: {
        workspaceId: workspace_id,
      },
    },
    include: {
      conversation: {
        include: {
          participants: {
            include: {
              user: true,
            },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { sender: true },
          },
        },
      },
    },
    orderBy: {
      conversation: {
        updatedAt: "desc",
      },
    },
    take: 50,
  });

  const unreadByConversation = await Promise.all(
    myConversations.map(async (entry) => {
      const unreadCount = await prisma.conversationMessage.count({
        where: {
          conversationId: entry.conversationId,
          senderId: { not: user.id },
          ...(entry.lastReadAt ? { createdAt: { gt: entry.lastReadAt } } : {}),
        },
      });
      return { conversationId: entry.conversationId, unreadCount };
    }),
  );

  const unreadCountMap = unreadByConversation.reduce<Record<string, number>>(
    (acc, entry) => {
      acc[entry.conversationId] = entry.unreadCount;
      return acc;
    },
    {},
  );

  const conversations = myConversations.map((entry) => ({
    id: entry.conversationId,
    workspace_id: entry.conversation.workspaceId,
    participants: entry.conversation.participants.map(
      serializeConversationParticipant,
    ),
    last_message: entry.conversation.messages[0]
      ? serializeConversationMessage(entry.conversation.messages[0])
      : null,
    unread_count: unreadCountMap[entry.conversationId] ?? 0,
    updatedAt: entry.conversation.updatedAt.toISOString(),
  }));

  const unreadChatsCount = conversations.reduce(
    (acc, item) => acc + (item.unread_count ?? 0),
    0,
  );

  return {
    mentions,
    unreadMentionsCount,
    conversations,
    unreadChatsCount,
    unreadCount: unreadMentionsCount + unreadChatsCount,
  };
});

