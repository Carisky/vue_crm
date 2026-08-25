import { TaskPriority, TaskStatus } from "@prisma/client";

import { CreateTasksSchema } from "~/lib/schema/createTask";
import prisma from "~/server/lib/prisma";
import {
  requireUser,
  requireWorkspaceMembership,
} from "~/server/lib/permissions";
import { serializeTask } from "~/server/lib/serializers";
import {
  sendTaskMediaUploadedEmails,
  sendTaskNotificationEmails,
} from "~/server/lib/email";
import { broadcastTaskEvent } from "~/server/lib/task-events";
import { assertAndAttachPendingMedia } from "~/server/lib/task-media-service";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);

  const params = await readValidatedBody(event, (body) =>
    CreateTasksSchema.safeParse(body),
  );

  if (!params.success) {
    throw createError({
      status: 400,
      statusText: params.error.message,
    });
  }

  const data = params.data;

  await requireWorkspaceMembership(event, data.workspace_id);

  const assigneeId =
    typeof data.assignee_id === "string" && data.assignee_id.trim().length
      ? data.assignee_id.trim()
      : null;
  const assigneeGroupId =
    typeof data.assignee_group_id === "string" &&
    data.assignee_group_id.trim().length
      ? data.assignee_group_id.trim()
      : null;

  if (assigneeId && assigneeGroupId) {
    throw createError({
      status: 400,
      statusText: "A task can be assigned to a user or a group, not both",
    });
  }

  if (assigneeId) {
    const assigneeMembership = await prisma.member.findFirst({
      where: {
        workspaceId: data.workspace_id,
        userId: assigneeId,
      },
    });
    if (!assigneeMembership) {
      throw createError({ status: 400, statusText: "Unauthorized assignee" });
    }
  }

  if (assigneeGroupId) {
    const group = await prisma.workspaceGroup.findFirst({
      where: { id: assigneeGroupId, workspaceId: data.workspace_id },
      select: { id: true },
    });
    if (!group) {
      throw createError({ status: 400, statusText: "Unauthorized group" });
    }
  }

  const [workspace, project] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: data.workspace_id } }),
    prisma.project.findUnique({ where: { id: data.project_id } }),
  ]);

  let assignee = null;
  if (assigneeId) {
    assignee = await prisma.user.findUnique({ where: { id: assigneeId } });
  }

  if (!workspace) {
    throw createError({ status: 400, statusText: "Workspace not found" });
  }
  if (!project || project.workspaceId !== workspace.id) {
    throw createError({ status: 400, statusText: "Project not found" });
  }
  if (assigneeId && !assignee) {
    throw createError({ status: 400, statusText: "Assignee not found" });
  }

  const highestPositionTask = await prisma.task.findFirst({
    where: {
      workspaceId: data.workspace_id,
      status: data.status as TaskStatus,
    },
    orderBy: { position: "desc" },
  });
  const position = (highestPositionTask?.position ?? 1000) + 1;

  const task = await prisma.$transaction(async (tx) => {
    const createdTask = await tx.task.create({
      data: {
        name: data.name,
        workspaceId: data.workspace_id,
        projectId: data.project_id,
        status: data.status as TaskStatus,
        priority: data.priority as TaskPriority,
        dueDate: data.due_date ?? null,
        assigneeId: assigneeId ?? undefined,
        assigneeGroupId: assigneeGroupId ?? undefined,
        description: data.description,
        position,
        startedAt: data.started_at === undefined ? undefined : data.started_at,
      },
      include: {
        project: true,
        assignee: true,
        assigneeGroup: { include: { members: true } },
      },
    });

    await assertAndAttachPendingMedia({
      taskId: createdTask.id,
      mediaIds: data.media_ids ?? [],
      workspaceId: data.workspace_id,
      userId: user.id,
      db: tx,
    });

    return tx.task.findUniqueOrThrow({
      where: { id: createdTask.id },
      include: {
        project: true,
        assignee: true,
        assigneeGroup: { include: { members: true } },
        media: { include: { variants: true } },
      },
    });
  });

  const finalTask = task;
  const attachedMediaIds = new Set(data.media_ids ?? []);
  const newlyAttachedMedia = task.media.filter((media) =>
    attachedMediaIds.has(media.id),
  );

  try {
    const workspaceMembers = await prisma.member.findMany({
      where: {
        workspaceId: data.workspace_id,
        userId: { not: user.id },
      },
      select: {
        userId: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            emailNotificationsEnabled: true,
          },
        },
      },
    });

    if (workspaceMembers.length) {
      const notificationMessage = `New task "${task.name}" in ${
        project?.name ?? "workspace"
      }`;
      await prisma.notification.createMany({
        data: workspaceMembers.map((member) => ({
          userId: member.userId,
          workspaceId: data.workspace_id,
          taskId: task.id,
          projectId: task.projectId,
          actorId: user.id,
          type: "TASK_CREATED",
          message: notificationMessage,
        })),
      });

      await sendTaskNotificationEmails(event, {
        type: "TASK_CREATED",
        task: {
          id: task.id,
          name: task.name,
          status: task.status,
          priority: task.priority,
          workspaceId: task.workspaceId,
        },
        project: project ? { name: project.name } : null,
        workspace: { name: workspace.name },
        actor: { name: user.name ?? null, email: user.email },
        recipients: workspaceMembers.map((member) => member.user),
      });

      if (newlyAttachedMedia.length) {
        await sendTaskMediaUploadedEmails(event, {
          task: {
            id: task.id,
            name: task.name,
            workspaceId: task.workspaceId,
          },
          project: project ? { name: project.name } : null,
          workspace: { name: workspace.name },
          actor: { name: user.name ?? null, email: user.email },
          recipients: workspaceMembers.map((member) => member.user),
          media: newlyAttachedMedia,
        });
      }
    }
  } catch (error) {
    console.error("[tasks] Failed to send task creation notifications", {
      taskId: task.id,
      error,
    });
  }

  try {
    broadcastTaskEvent(finalTask.workspaceId, {
      type: "TASK_CREATED",
      workspaceId: finalTask.workspaceId,
      task: serializeTask(finalTask),
    });
  } catch {
    // ignore realtime errors
  }

  return {
    task: serializeTask(finalTask),
  };
});
