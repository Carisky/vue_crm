import { createError } from "h3";
import type { H3Event } from "h3";
import { Prisma, TaskPriority, TaskStatus } from "@prisma/client";

import { CreateTasksSchema } from "~/lib/schema/createTask";
import prisma from "./prisma";
import { requireWorkspaceMembership } from "./permissions";

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
      media: true,
    },
  });

  return updatedTask;
}
