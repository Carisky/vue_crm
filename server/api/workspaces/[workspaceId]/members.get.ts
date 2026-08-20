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

  const memberships = await prisma.member.findMany({
    where: { workspaceId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });

  const members = memberships.map((membership) => ({
    ...serializeMember(membership, workspace.ownerId),
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
