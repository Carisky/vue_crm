import { TaskStatus } from "@prisma/client";
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
    status,
    search,
    due_date,
    started_at,
  } = getQuery(event);

  if (!workspace_id || typeof workspace_id !== "string") {
    throw createError({ status: 400, statusText: "Workspace ID required" });
  }

  await requireWorkspaceMembership(event, workspace_id);

  const where: any = {
    workspaceId: workspace_id,
  };

  if (project_id && typeof project_id === "string") {
    where.projectId = project_id;
  }
  if (assignee_id && typeof assignee_id === "string") {
    where.assigneeId = assignee_id;
  }
  if (status && typeof status === "string") {
    where.status = status as TaskStatus;
  }
  if (search && typeof search === "string") {
    where.name = { contains: search, mode: "insensitive" };
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
    include: { project: true, assignee: true, media: true },
  });

  const serializedTasks = tasks.map((task) => serializeTask(task));

  return { tasks: serializedTasks };
});
