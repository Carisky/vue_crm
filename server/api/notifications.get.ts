import { ensureWorkspaceAccess } from "~/server/lib/workspace";
import { requireUser } from "~/server/lib/permissions";
import prisma from "~/server/lib/prisma";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const { workspace_id } = getQuery(event);
  const workspaceId = typeof workspace_id === "string" ? workspace_id : undefined;

  if (workspaceId) {
    await ensureWorkspaceAccess(event, workspaceId);
  }

  const notifications = await prisma.notification.findMany({
    where: {
      userId: user.id,
      workspaceId: workspaceId,
    },
    include: {
      task: {
        select: {
          id: true,
          name: true,
          estimatedHours: true,
        },
      },
      project: {
        select: {
          id: true,
          name: true,
        },
      },
      actor: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 50,
  });

  return {
    notifications: notifications.map((notification) => ({
      id: notification.id,
      workspaceId: notification.workspaceId,
      taskId: notification.taskId,
      projectId: notification.projectId,
      actorId: notification.actorId,
      actorName: notification.actor?.name ?? notification.actor?.email ?? null,
      taskName: notification.task?.name ?? null,
      projectName: notification.project?.name ?? null,
      type: notification.type,
      taskEstimatedHours: notification.task?.estimatedHours ?? null,
      message: notification.message,
      isRead: notification.isRead,
      createdAt: notification.createdAt.toISOString(),
    })),
    unreadCount: notifications.filter((item) => !item.isRead).length,
  };
});
