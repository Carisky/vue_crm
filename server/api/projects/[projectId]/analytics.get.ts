import { MemberRole, TaskStatus } from "@prisma/client";

import { calculateTaskAnalytics } from "~/lib/task-analytics";
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
      select: {
        id: true,
        parentId: true,
        projectId: true,
        status: true,
        createdAt: true,
        dueDate: true,
        assigneeId: true,
        assigneeGroup: { select: { members: { select: { userId: true } } } },
      },
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
  const analyticData = calculateTaskAnalytics(
    workspaceTasks.filter((task) => task.projectId === projectId),
    user.id,
    now,
  );

  return {
    project: serializeProject(project, projectProgress),
    analytic_data: analyticData,
    is_owner: project.workspace.ownerId === user.id,
    is_admin: membership.role === MemberRole.ADMIN,
  };
});
