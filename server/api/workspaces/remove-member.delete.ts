import { MemberRole } from "@prisma/client";

import prisma from "~/server/lib/prisma";
import { requireUser } from "~/server/lib/permissions";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const { membershipId } = await readBody<{
    membershipId?: string;
  }>(event);

  if (!membershipId) {
    throw createError({ status: 400, statusText: "Member ID required" });
  }

  const membershipToDelete = await prisma.member.findUnique({
    where: { id: membershipId },
    include: { workspace: true },
  });

  if (!membershipToDelete) {
    throw createError({ status: 404, statusText: "Member not found" });
  }

  const memberships = await prisma.member.findMany({
    where: { workspaceId: membershipToDelete.workspaceId },
  });

  const currentMembership = memberships.find(
    (membership) => membership.userId === user.id,
  );

  if (!currentMembership) {
    throw createError({ status: 401, statusText: "Unauthorized" });
  }

  const deletingSelf = membershipToDelete.userId === user.id;
  const isAdmin = currentMembership.role === MemberRole.ADMIN;

  if (!deletingSelf && !isAdmin) {
    throw createError({ status: 401, statusText: "Unauthorized" });
  }

  if (
    !deletingSelf &&
    membershipToDelete.role === MemberRole.ADMIN &&
    membershipToDelete.workspace.ownerId !== user.id
  ) {
    throw createError({ status: 401, statusText: "Unauthorized" });
  }

  if (memberships.length === 1) {
    throw createError({
      status: 400,
      statusText: "Cannot delete the only workspace member",
    });
  }

  await prisma.member.delete({ where: { id: membershipToDelete.id } });

  return { ok: true };
});
