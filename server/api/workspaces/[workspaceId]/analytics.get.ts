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
import { getVisibleProjectIds } from "~/server/lib/project-access";
import { calculateEffectivelyRestrictedProjectIds } from "~/server/lib/project-access-policy";
import { buildWorkspaceAnalyticsScopes } from "~/server/lib/workspace-analytics-scope";

export default defineEventHandler(async (event) => {
  const { workspaceId } = getRouterParams(event);
  const user = requireUser(event);

  const { workspace, membership } = await ensureWorkspaceAccess(
    event,
    workspaceId,
  );
  const visibleProjectIds = await getVisibleProjectIds(event, workspaceId);
  const scopes = buildWorkspaceAnalyticsScopes(workspaceId, visibleProjectIds);

  const [projects, members, tasks] = await Promise.all([
    prisma.project.findMany({
      where: scopes.projects,
      orderBy: { createdAt: "desc" },
    }),
    prisma.member.findMany({
      where: scopes.members,
      include: { user: true },
    }),
    prisma.task.findMany({
      where: scopes.tasks,
      orderBy: { createdAt: "desc" },
      include: {
        project: true,
        creator: true,
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
  const restrictedProjectIds =
    calculateEffectivelyRestrictedProjectIds(projects);

  return {
    workspace: serializeWorkspace(workspace),
    projects: projects.map((project) => ({
      ...serializeProject(project),
      is_effectively_restricted: restrictedProjectIds.has(project.id),
      can_manage_access: project.creatorId === user.id,
    })),
    members: membersPayload,
    tasks: tasksPayload,
    analytic_data: analyticData,
    is_owner: workspace.ownerId === user.id,
    is_admin:
      workspace.ownerId === user.id || membership.role === MemberRole.ADMIN,
  };
});
