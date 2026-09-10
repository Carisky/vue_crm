import prisma from "~/server/lib/prisma";
import {
  requireUser,
  requireWorkspaceMembership,
} from "~/server/lib/permissions";
import { serializeTask } from "~/server/lib/serializers";
import { buildLeafProgressMap } from "~/lib/hierarchy";
import { requireProjectAccess } from "~/server/lib/project-access";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const { taskId } = getRouterParams(event);

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: true,
      creator: true,
      assignee: true,
      assigneeGroup: { include: { members: true } },
      media: { include: { variants: true } },
    },
  });

  if (!task) {
    throw createError({ status: 404, statusText: "Task not found" });
  }

  await requireProjectAccess(event, task.projectId);

  const branchTasks = await prisma.task.findMany({
    where: { workspaceId: task.workspaceId, projectId: task.projectId },
    select: { id: true, parentId: true, status: true },
  });
  const progress = buildLeafProgressMap(
    branchTasks.map((item) => ({
      id: item.id,
      parentId: item.parentId,
      done: item.status === "DONE",
    })),
  );
  const subtasks = await prisma.task.findMany({
    where: { parentId: task.id },
    orderBy: { createdAt: "asc" },
    include: {
      project: true,
      creator: true,
      assignee: true,
      assigneeGroup: { include: { members: true } },
      media: { include: { variants: true } },
    },
  });

  return {
    task: serializeTask(task, progress.get(task.id)),
    subtasks: subtasks.map((item) =>
      serializeTask(item, progress.get(item.id)),
    ),
  };
});
