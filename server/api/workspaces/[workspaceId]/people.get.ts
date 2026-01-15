import prisma from "~/server/lib/prisma";
import { ensureWorkspaceAccess } from "~/server/lib/workspace";

export default defineEventHandler(async (event) => {
  const { workspaceId } = getRouterParams(event);
  await ensureWorkspaceAccess(event, workspaceId);

  const memberships = await prisma.member.findMany({
    where: { workspaceId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return {
    people: memberships.map((membership) => ({
      $id: membership.user.id,
      name: membership.user.name,
      email: membership.user.email,
      avatar_url: membership.user.avatarUrl,
    })),
  };
});

