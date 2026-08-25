import { Prisma, TaskStatus } from "@prisma/client";
import { endOfDay, startOfDay } from "date-fns";

import prisma from "~/server/lib/prisma";
import {
  requireUser,
  requireWorkspaceMembership,
} from "~/server/lib/permissions";
import { serializeTask } from "~/server/lib/serializers";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const {
    workspace_id,
    project_id,
    assignee_id,
    group_id,
    mine,
    status,
    search,
    due_date,
    started_at,
  } = getQuery(event);

  if (!workspace_id || typeof workspace_id !== "string") {
    throw createError({ status: 400, statusText: "Workspace ID required" });
  }

  await requireWorkspaceMembership(event, workspace_id);

  const where: Prisma.TaskWhereInput = {
    workspaceId: workspace_id,
  };

  if (project_id && typeof project_id === "string") {
    where.projectId = project_id;
  }
  if (assignee_id && typeof assignee_id === "string") {
    where.assigneeId = assignee_id;
  }
  if (group_id && typeof group_id === "string") {
    where.assigneeGroupId = group_id;
  }
  if (mine === "1" || mine === "true") {
    where.OR = [
      { assigneeId: user.id },
      { assigneeGroup: { members: { some: { userId: user.id } } } },
    ];
  }
  if (status && typeof status === "string") {
    if (!Object.values(TaskStatus).includes(status as TaskStatus)) {
      throw createError({ status: 400, statusText: "Invalid task status" });
    }
    where.status = status as TaskStatus;
  }
  if (search && typeof search === "string") {
    where.name = { contains: search };
  }
  if (due_date && typeof due_date === "string") {
    const date = new Date(due_date);
    if (!isNaN(date.getTime())) {
      where.dueDate = {
        gte: startOfDay(date),
        lte: endOfDay(date),
      };
    }
  }
  if (started_at && typeof started_at === "string") {
    const date = new Date(started_at);
    if (!isNaN(date.getTime())) {
      where.startedAt = {
        gte: startOfDay(date),
        lte: endOfDay(date),
      };
    }
  }

  const tasks = await prisma.task.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      project: true,
      assignee: true,
      assigneeGroup: { include: { members: true } },
      media: { include: { variants: true } },
    },
  });

  const serializedTasks = tasks.map((task) => serializeTask(task));

  return { tasks: serializedTasks };
});
