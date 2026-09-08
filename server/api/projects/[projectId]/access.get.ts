import prisma from "~/server/lib/prisma";
import { requireUser } from "~/server/lib/permissions";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const { projectId } = getRouterParams(event);
  const project = await prisma.project.findFirst({
    where: { id: projectId, creatorId: user.id },
    include: {
      creator: { select: { id: true, name: true, email: true } },
      accessGrants: { select: { userId: true } },
      workspace: {
        include: {
          members: {
            include: { user: { select: { id: true, name: true, email: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });
  if (!project) {
    throw createError({ status: 404, statusText: "Project not found" });
  }

  return {
    visibility: project.visibility.toLowerCase(),
    creator: project.creator,
    user_ids: project.accessGrants.map(({ userId }) => userId),
    members: project.workspace.members.map((member) => ({
      $id: member.user.id,
      name: member.user.name,
      email: member.user.email,
      role: member.role.toLowerCase(),
      is_owner: member.userId === project.workspace.ownerId,
    })),
  };
});
