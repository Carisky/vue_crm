import { z } from "zod";

import prisma from "~/server/lib/prisma";
import { requireUser, requireWorkspaceMembership } from "~/server/lib/permissions";
import { serializeTaskComment } from "~/server/lib/serializers";

const CreateTaskCommentSchema = z.object({
  body: z.string().trim().min(1).max(10_000),
  mention_ids: z.array(z.string().min(1)).optional(),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const { taskId } = getRouterParams(event);

  const params = await readValidatedBody(event, (body) =>
    CreateTaskCommentSchema.safeParse(body),
  );

  if (!params.success) {
    throw createError({ status: 400, statusText: params.error.message });
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      name: true,
      workspaceId: true,
      projectId: true,
    },
  });

  if (!task) {
    throw createError({ status: 404, statusText: "Task not found" });
  }

  await requireWorkspaceMembership(event, task.workspaceId);

  const mentionIds = Array.from(
    new Set((params.data.mention_ids ?? []).map((value) => value.trim())),
  ).filter(Boolean);

  if (mentionIds.length) {
    const members = await prisma.member.findMany({
      where: {
        workspaceId: task.workspaceId,
        userId: { in: mentionIds },
      },
      select: { userId: true },
    });
    const allowedIds = new Set(members.map((item) => item.userId));
    const invalidMention = mentionIds.find((id) => !allowedIds.has(id));
    if (invalidMention) {
      throw createError({ status: 400, statusText: "Invalid mention target" });
    }
  }

  const created = await prisma.taskComment.create({
    data: {
      taskId: task.id,
      workspaceId: task.workspaceId,
      authorId: user.id,
      body: params.data.body,
      mentions: mentionIds.length
        ? {
            create: mentionIds.map((userId) => ({
              userId,
            })),
          }
        : undefined,
    },
    include: {
      author: true,
      mentions: {
        include: { user: true },
      },
    },
  });

  const notificationRecipients = mentionIds.filter((id) => id !== user.id);
  if (notificationRecipients.length) {
    await prisma.notification.createMany({
      data: notificationRecipients.map((mentionedUserId) => ({
        userId: mentionedUserId,
        workspaceId: task.workspaceId,
        taskId: task.id,
        projectId: task.projectId,
        actorId: user.id,
        type: "TASK_COMMENT_MENTION",
        message: `You were mentioned in "${task.name}"`,
      })),
    });
  }

  return { comment: serializeTaskComment(created) };
});
