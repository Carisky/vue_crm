import { MemberRole } from "@prisma/client";

import prisma from "~/server/lib/prisma";
import { ensureWorkspaceAccess } from "~/server/lib/workspace";
import { serializeMember } from "~/server/lib/serializers";

export default defineEventHandler(async (event) => {
  const { workspaceId } = getRouterParams(event);

  const { workspace, membership } = await ensureWorkspaceAccess(
    event,
    workspaceId,
  );

  const [memberships, projectCounts] = await Promise.all([
    prisma.member.findMany({
      where: { workspaceId },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.project.groupBy({
      by: ["creatorId"],
      where: { workspaceId },
      _count: { _all: true },
    }),
  ]);
  const projectCountByCreator = new Map(
    projectCounts.map((item) => [item.creatorId, item._count._all]),
  );

  const members = memberships.map((membership) => ({
    ...serializeMember(membership, workspace.ownerId),
    creator_project_count: projectCountByCreator.get(membership.userId) ?? 0,
  }));

  return {
    members,
    current_user_id: membership.userId,
    is_owner: workspace.ownerId === membership.userId,
    is_admin:
      workspace.ownerId === membership.userId ||
      membership.role === MemberRole.ADMIN,
  };
});
