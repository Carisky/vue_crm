import { MemberRole, TaskStatus } from "@prisma/client";
import { endOfMonth, startOfMonth, subMonths } from "date-fns";

import prisma from "~/server/lib/prisma";
import { requireUser } from "~/server/lib/permissions";
import { ensureWorkspaceAccess } from "~/server/lib/workspace";
import {
  serializeMember,
  serializeProject,
  serializeTask,
  serializeWorkspace,
} from "~/server/lib/serializers";

export default defineEventHandler(async (event) => {
  const { workspaceId } = getRouterParams(event);
  const user = requireUser(event);

  const { workspace, membership } = await ensureWorkspaceAccess(
    event,
    workspaceId,
  );

  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd = endOfMonth(subMonths(now, 1));

  const [
    projects,
    members,
    tasks,
    thisMonthTasks,
    lastMonthTasks,
    thisMonthAssignedTasks,
    lastMonthAssignedTasks,
    thisMonthCompletedTasks,
    lastMonthCompletedTasks,
    thisMonthOverdueTasks,
    lastMonthOverdueTasks,
  ] = await Promise.all([
    prisma.project.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.member.findMany({
      where: { workspaceId },
      include: { user: true },
    }),
    prisma.task.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      include: {
        project: true,
        assignee: true,
      },
    }),
    prisma.task.count({
      where: {
        workspaceId,
        createdAt: { gte: thisMonthStart, lte: thisMonthEnd },
      },
    }),
    prisma.task.count({
      where: {
        workspaceId,
        createdAt: { gte: lastMonthStart, lte: lastMonthEnd },
      },
    }),
    prisma.task.count({
      where: {
        workspaceId,
        assigneeId: user.id,
        createdAt: { gte: thisMonthStart, lte: thisMonthEnd },
      },
    }),
    prisma.task.count({
      where: {
        workspaceId,
        assigneeId: user.id,
        createdAt: { gte: lastMonthStart, lte: lastMonthEnd },
      },
    }),
    prisma.task.count({
      where: {
        workspaceId,
        status: TaskStatus.DONE,
        createdAt: { gte: thisMonthStart, lte: thisMonthEnd },
      },
    }),
    prisma.task.count({
      where: {
        workspaceId,
        status: TaskStatus.DONE,
        createdAt: { gte: lastMonthStart, lte: lastMonthEnd },
      },
    }),
    prisma.task.count({
      where: {
        workspaceId,
        status: { not: TaskStatus.DONE },
        dueDate: { lt: now },
        createdAt: { gte: thisMonthStart, lte: thisMonthEnd },
      },
    }),
    prisma.task.count({
      where: {
        workspaceId,
        status: { not: TaskStatus.DONE },
        dueDate: { lt: now },
        createdAt: { gte: lastMonthStart, lte: lastMonthEnd },
      },
    }),
  ]);

  const membersPayload = members.map((member) =>
    serializeMember(member, workspace.ownerId),
  );

  const tasksPayload = tasks.map((task) => serializeTask(task));

  const task_count = thisMonthTasks;
  const task_diff = thisMonthTasks - lastMonthTasks;
  const assigned_task_count = thisMonthAssignedTasks;
  const assigned_task_diff = thisMonthAssignedTasks - lastMonthAssignedTasks;
  const completed_task_count = thisMonthCompletedTasks;
  const completed_task_diff = thisMonthCompletedTasks - lastMonthCompletedTasks;
  const incompleted_task_count = task_count - completed_task_count;
  const incompleted_task_diff =
    incompleted_task_count -
    (lastMonthTasks - lastMonthCompletedTasks);
  const overdue_task_count = thisMonthOverdueTasks;
  const overdue_task_diff = thisMonthOverdueTasks - lastMonthOverdueTasks;

  return {
    workspace: serializeWorkspace(workspace),
    projects: projects.map((project) => serializeProject(project)),
    members: membersPayload,
    tasks: tasksPayload,
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
    is_owner: workspace.ownerId === user.id,
    is_admin: membership.role === MemberRole.ADMIN,
  };
});
