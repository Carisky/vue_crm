import prisma from "~/server/lib/prisma";
import { ensureWorkspaceAccess } from "~/server/lib/workspace";
import { serializeMember } from "~/server/lib/serializers";

export default defineEventHandler(async (event) => {
  const { workspaceId } = getRouterParams(event);

  const { workspace } = await ensureWorkspaceAccess(event, workspaceId);

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
  };
});
