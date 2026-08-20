import { UpdateMemberRoleSchema } from "~/lib/schema/updateRole";
import { canChangeWorkspaceMemberRole } from "~/server/lib/member-role-policy";
import prisma from "~/server/lib/prisma";
import { requireUser } from "~/server/lib/permissions";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const params = UpdateMemberRoleSchema.safeParse(await readBody(event));

  if (!params.success) {
    throw createError({ status: 400, statusText: "Invalid role change" });
  }

  const membership = await prisma.member.findUnique({
    where: { id: params.data.membershipId },
    include: { workspace: true },
  });

  if (!membership) {
    throw createError({ status: 404, statusText: "Member not found" });
  }

  const currentMembership = await prisma.member.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: membership.workspaceId,
        userId: user.id,
      },
    },
  });

  if (
    !currentMembership ||
    !canChangeWorkspaceMemberRole({
      actorUserId: user.id,
      actorRole: currentMembership.role,
      targetUserId: membership.userId,
      targetRole: membership.role,
      nextRole: params.data.role,
      ownerId: membership.workspace.ownerId,
    })
  ) {
    throw createError({ status: 403, statusText: "Forbidden" });
  }

  await prisma.member.update({
    where: { id: membership.id },
    data: { role: params.data.role },
  });

  return { ok: true, role: params.data.role };
});
