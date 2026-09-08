import prisma from "~/server/lib/prisma";
import { ProjectAccessSchema } from "~/lib/schema/projectAccess";
import { requireUser } from "~/server/lib/permissions";
import { getVisibleProjectIdsForUser } from "~/server/lib/project-access";
import { refreshWorkspaceTaskStreamAccess } from "~/server/lib/task-events";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const { projectId } = getRouterParams(event);
  const params = ProjectAccessSchema.safeParse(await readBody(event));
  if (!params.success) {
    throw createError({ status: 400, statusText: params.error.message });
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, creatorId: user.id },
    select: { id: true, workspaceId: true },
  });
  if (!project) {
    throw createError({ status: 404, statusText: "Project not found" });
  }

  const userIds = [...new Set(params.data.user_ids)].filter((id) => id !== user.id);
  if (userIds.length) {
    const memberCount = await prisma.member.count({
      where: { workspaceId: project.workspaceId, userId: { in: userIds } },
    });
    if (memberCount !== userIds.length) {
      throw createError({ status: 400, statusText: "Invalid project members" });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: project.id },
      data: { visibility: params.data.visibility },
    });
    await tx.projectAccess.deleteMany({ where: { projectId: project.id } });
    if (params.data.visibility === "PRIVATE" && userIds.length) {
      await tx.projectAccess.createMany({
        data: userIds.map((userId) => ({ projectId: project.id, userId })),
      });
    }
  });

  const memberships = await prisma.member.findMany({
    where: { workspaceId: project.workspaceId },
    select: { userId: true },
  });
  const visibleByUserId = new Map<string, Set<string>>();
  await Promise.all(memberships.map(async ({ userId }) => {
    visibleByUserId.set(userId, await getVisibleProjectIdsForUser(prisma, {
      workspaceId: project.workspaceId,
      userId,
    }));
  }));
  refreshWorkspaceTaskStreamAccess(project.workspaceId, visibleByUserId);

  return { ok: true };
});
