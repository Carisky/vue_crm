import { MemberRole } from "@prisma/client";

import prisma from "~/server/lib/prisma";
import { requireUser } from "~/server/lib/permissions";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const { membershipId } = await readBody<{ membershipId?: string }>(event);

  if (!membershipId) {
    throw createError({ status: 400, statusText: "Member ID required" });
  }

  const membership = await prisma.member.findUnique({
    where: { id: membershipId },
    include: { workspace: true },
  });

  if (!membership) {
    throw createError({ status: 404, statusText: "Member not found" });
  }

  if (membership.workspace.ownerId !== user.id) {
    throw createError({ status: 401, statusText: "Unauthorized" });
  }

  const updatingOther = membership.userId !== user.id;

  if (!updatingOther && membership.role === MemberRole.MEMBER) {
    throw createError({ status: 401, statusText: "Unauthorized" });
  }

  const newRole =
    membership.role === MemberRole.ADMIN
      ? MemberRole.MEMBER
      : MemberRole.ADMIN;

  await prisma.member.update({
    where: { id: membership.id },
    data: { role: newRole },
  });

  return { ok: true };
});
