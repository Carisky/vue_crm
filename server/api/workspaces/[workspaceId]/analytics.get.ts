import { MemberRole } from "@prisma/client";

import { calculateTaskAnalytics } from "~/lib/task-analytics";
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

  const [projects, members, tasks] = await Promise.all([
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
        assigneeGroup: { include: { members: true } },
      },
    }),
  ]);

  const membersPayload = members.map((member) =>
    serializeMember(member, workspace.ownerId),
  );

  const tasksPayload = tasks.map((task) => serializeTask(task));

  const analyticData = calculateTaskAnalytics(tasks, user.id);

  return {
    workspace: serializeWorkspace(workspace),
    projects: projects.map((project) => serializeProject(project)),
    members: membersPayload,
    tasks: tasksPayload,
    analytic_data: analyticData,
    is_owner: workspace.ownerId === user.id,
    is_admin:
      workspace.ownerId === user.id || membership.role === MemberRole.ADMIN,
  };
});
