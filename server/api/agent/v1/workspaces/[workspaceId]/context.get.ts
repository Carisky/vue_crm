import { requireAgentApiKey } from "~/server/lib/agent-api-key";
import prisma from "~/server/lib/prisma";

export default defineEventHandler(async (event) => {
  const key = await requireAgentApiKey(event);
  const { workspaceId } = getRouterParams(event);
  const membership = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: key.userId } },
    include: { workspace: true },
  });
  if (!membership) {
    throw createError({ status: 404, statusText: "Workspace not found" });
  }

  const [projects, tasks, members, groups] = await Promise.all([
    prisma.project.findMany({
      where: { workspaceId },
      orderBy: [{ parentId: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, parentId: true, createdAt: true, updatedAt: true },
    }),
    prisma.task.findMany({
      where: { workspaceId },
      orderBy: [{ projectId: "asc" }, { position: "asc" }],
      select: {
        id: true,
        name: true,
        description: true,
        projectId: true,
        parentId: true,
        status: true,
        priority: true,
        dueDate: true,
        startedAt: true,
        assigneeId: true,
        assigneeGroupId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.member.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.workspaceGroup.findMany({
      where: { workspaceId },
      select: { id: true, name: true, description: true },
    }),
  ]);
  return {
    workspace: { id: membership.workspace.id, name: membership.workspace.name },
    role: membership.role,
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      parent_project_id: project.parentId,
      created_at: project.createdAt.toISOString(),
      updated_at: project.updatedAt.toISOString(),
    })),
    tasks: tasks.map((task) => ({
      id: task.id,
      name: task.name,
      description: task.description,
      project_id: task.projectId,
      parent_task_id: task.parentId,
      status: task.status,
      priority: task.priority,
      due_date: task.dueDate?.toISOString() ?? null,
      started_at: task.startedAt?.toISOString() ?? null,
      assignee_id: task.assigneeId,
      assignee_group_id: task.assigneeGroupId,
      created_at: task.createdAt.toISOString(),
      updated_at: task.updatedAt.toISOString(),
    })),
    members: members.map(({ role, user }) => ({ ...user, role })),
    groups,
  };
});
