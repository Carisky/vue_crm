import { MemberRole, TaskStatus } from "@prisma/client";
import { endOfMonth, startOfMonth, subMonths } from "date-fns";

import prisma from "~/server/lib/prisma";
import {
  requireUser,
  requireWorkspaceMembership,
} from "~/server/lib/permissions";
import { serializeProject } from "~/server/lib/serializers";
import { buildProjectProgressMap } from "~/lib/hierarchy";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const { projectId } = getRouterParams(event);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { workspace: true },
  });

  if (!project) {
    throw createError({ status: 404, statusText: "Project not found" });
  }

  const membership = await requireWorkspaceMembership(
    event,
    project.workspaceId,
  );

  const now = new Date();
  const [workspaceProjects, workspaceTasks] = await Promise.all([
    prisma.project.findMany({
      where: { workspaceId: project.workspaceId },
      select: { id: true, parentId: true },
    }),
    prisma.task.findMany({
      where: { workspaceId: project.workspaceId },
      select: { id: true, parentId: true, projectId: true, status: true },
    }),
  ]);
  const projectProgress = buildProjectProgressMap(
    workspaceProjects,
    workspaceTasks.map((task) => ({
      id: task.id,
      parentId: task.parentId,
      projectId: task.projectId,
      done: task.status === TaskStatus.DONE,
    })),
  ).get(project.id);
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd = endOfMonth(subMonths(now, 1));

  const [
    thisMonthTasks,
    lastMonthTasks,
    thisMonthAssignedTasks,
    lastMonthAssignedTasks,
    thisMonthCompletedTasks,
    lastMonthCompletedTasks,
    thisMonthOverdueTasks,
    lastMonthOverdueTasks,
  ] = await Promise.all([
    prisma.task.count({
      where: {
        projectId,
        createdAt: { gte: thisMonthStart, lte: thisMonthEnd },
      },
    }),
    prisma.task.count({
      where: {
        projectId,
        createdAt: { gte: lastMonthStart, lte: lastMonthEnd },
      },
    }),
    prisma.task.count({
      where: {
        projectId,
        OR: [
          { assigneeId: user.id },
          { assigneeGroup: { members: { some: { userId: user.id } } } },
        ],
        createdAt: { gte: thisMonthStart, lte: thisMonthEnd },
      },
    }),
    prisma.task.count({
      where: {
        projectId,
        OR: [
          { assigneeId: user.id },
          { assigneeGroup: { members: { some: { userId: user.id } } } },
        ],
        createdAt: { gte: lastMonthStart, lte: lastMonthEnd },
      },
    }),
    prisma.task.count({
      where: {
        projectId,
        status: TaskStatus.DONE,
        createdAt: { gte: thisMonthStart, lte: thisMonthEnd },
      },
    }),
    prisma.task.count({
      where: {
        projectId,
        status: TaskStatus.DONE,
        createdAt: { gte: lastMonthStart, lte: lastMonthEnd },
      },
    }),
    prisma.task.count({
      where: {
        projectId,
        status: { not: TaskStatus.DONE },
        dueDate: { lt: now },
        createdAt: { gte: thisMonthStart, lte: thisMonthEnd },
      },
    }),
    prisma.task.count({
      where: {
        projectId,
        status: { not: TaskStatus.DONE },
        dueDate: { lt: now },
        createdAt: { gte: lastMonthStart, lte: lastMonthEnd },
      },
    }),
  ]);

  const task_count = thisMonthTasks;
  const task_diff = thisMonthTasks - lastMonthTasks;
  const assigned_task_count = thisMonthAssignedTasks;
  const assigned_task_diff = thisMonthAssignedTasks - lastMonthAssignedTasks;
  const completed_task_count = thisMonthCompletedTasks;
  const completed_task_diff = thisMonthCompletedTasks - lastMonthCompletedTasks;
  const incompleted_task_count = task_count - completed_task_count;
  const incompleted_task_diff =
    incompleted_task_count - (lastMonthTasks - lastMonthCompletedTasks);
  const overdue_task_count = thisMonthOverdueTasks;
  const overdue_task_diff = thisMonthOverdueTasks - lastMonthOverdueTasks;

  return {
    project: serializeProject(project, projectProgress),
    analytic_data: {
      task_count,
      task_diff,
      assigned_task_count,
      assigned_task_diff,
      completed_task_count,
      completed_task_diff,
      incompleted_task_count,
      incompleted_task_diff,
      overdue_task_count,
      overdue_task_diff,
    },
    is_owner: project.workspace.ownerId === user.id,
    is_admin: membership.role === MemberRole.ADMIN,
  };
});
