import { createError } from "h3";
import type { H3Event } from "h3";
import { Prisma, TaskPriority, TaskStatus } from "@prisma/client";

import { CreateTasksSchema } from "~/lib/schema/createTask";
import prisma from "./prisma";
import { requireWorkspaceMembership } from "./permissions";
import { getTaskPriorityLabel, sendTaskNotificationEmails } from "./email";
import { serializeTask } from "./serializers";
import { broadcastTaskEvent } from "./task-events";
import { attachMediaToTask } from "./task-media-service";

export async function updateTask(
  event: H3Event,
  taskId: string,
  payload: unknown,
  options?: { skipErrors?: boolean },
) {
  const params = CreateTasksSchema.partial().safeParse(payload);

  if (!params.success) {
    if (options?.skipErrors) return null;
    throw createError({
      status: 400,
      statusText: params.error.message,
    });
  }

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    if (options?.skipErrors) return null;
    throw createError({ status: 404, statusText: "Task not found" });
  }

  await requireWorkspaceMembership(event, task.workspaceId);

  if (params.data.assignee_id) {
    const membership = await prisma.member.findFirst({
      where: {
        workspaceId: task.workspaceId,
        userId: params.data.assignee_id,
      },
    });
    if (!membership) {
      if (options?.skipErrors) return null;
      throw createError({
        status: 400,
        statusText: "Unauthorized assignee",
      });
    }
  }

  if (params.data.project_id) {
    const project = await prisma.project.findUnique({
      where: { id: params.data.project_id },
    });
    if (!project || project.workspaceId !== task.workspaceId) {
      if (options?.skipErrors) return null;
      throw createError({
        status: 400,
        statusText: "Project not found",
      });
    }
  }

  const updateData: Prisma.TaskUncheckedUpdateInput = {};

  if (params.data.name) updateData.name = params.data.name;
  if (params.data.project_id) updateData.projectId = params.data.project_id;
  if (params.data.status)
    updateData.status = params.data.status as TaskStatus;
  if (params.data.priority)
    updateData.priority = params.data.priority as TaskPriority;
  if (Object.prototype.hasOwnProperty.call(params.data, "due_date"))
    updateData.dueDate = params.data.due_date as Date | null;
  if (Object.prototype.hasOwnProperty.call(params.data, "assignee_id"))
    updateData.assigneeId = params.data.assignee_id ?? null;
  if (params.data.description !== undefined)
    updateData.description = params.data.description;
  if (params.data.position !== undefined)
    updateData.position = params.data.position;
  if (Object.prototype.hasOwnProperty.call(params.data, "estimated_hours"))
    updateData.estimatedHours = params.data.estimated_hours ?? null;
  if (Object.prototype.hasOwnProperty.call(params.data, "actual_hours"))
    updateData.actualHours = params.data.actual_hours ?? null;
  if (Object.prototype.hasOwnProperty.call(params.data, "started_at"))
    updateData.startedAt = params.data.started_at ?? null;
  const updatedTask = await prisma.task.update({
    where: { id: taskId },
    data: updateData,
    include: {
      project: true,
      assignee: true,
    },
  });

  const mediaPayload = params.data.media?.length ? params.data.media : undefined;
  if (mediaPayload?.length) {
    await attachMediaToTask(taskId, mediaPayload);
  }

  const updatedTaskWithMedia = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: true,
      assignee: true,
      media: { include: { variants: true } },
    },
  });
  const finalUpdatedTask = updatedTaskWithMedia ?? updatedTask;

  const priorityChangedToUrgent =
    params.data.priority &&
    (params.data.priority === TaskPriority.HIGH ||
      params.data.priority === TaskPriority.REAL_TIME) &&
    params.data.priority !== task.priority;

  if (priorityChangedToUrgent && updatedTask) {
    const actor = event.context.user;
    if (actor) {
      const [workspace, workspaceMembers] = await Promise.all([
        prisma.workspace.findUnique({ where: { id: updatedTask.workspaceId } }),
        prisma.member.findMany({
          where: {
            workspaceId: updatedTask.workspaceId,
            userId: { not: actor.id },
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
        }),
      ]);

      if (workspace && workspaceMembers.length) {
        const priorityLabel = getTaskPriorityLabel(updatedTask.priority);
        const notificationMessage = `Task "${updatedTask.name}" priority set to ${priorityLabel}`;

        await prisma.notification.createMany({
          data: workspaceMembers.map((member) => ({
            userId: member.userId,
            workspaceId: updatedTask.workspaceId,
            taskId: updatedTask.id,
            projectId: updatedTask.projectId,
            actorId: actor.id,
            type: "TASK_PRIORITY_ESCALATED",
            message: notificationMessage,
          })),
        });

        await sendTaskNotificationEmails(event, {
          type: "TASK_PRIORITY_ESCALATED",
          task: {
            id: updatedTask.id,
            name: updatedTask.name,
            status: updatedTask.status,
            priority: updatedTask.priority,
            workspaceId: updatedTask.workspaceId,
          },
          project: updatedTask.project
            ? { name: updatedTask.project.name }
            : null,
          workspace: { name: workspace.name },
          actor: { name: actor.name ?? null, email: actor.email },
          recipients: workspaceMembers.map((member) => member.user),
        });
      }
    }
  }

  try {
      if (finalUpdatedTask) {
        broadcastTaskEvent(finalUpdatedTask.workspaceId, {
          type: "TASK_UPDATED",
          workspaceId: finalUpdatedTask.workspaceId,
          task: serializeTask(finalUpdatedTask),
        });
      }
  } catch {
    // ignore realtime errors
  }

  return finalUpdatedTask;
}
