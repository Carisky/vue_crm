import { MemberRole } from "@prisma/client";

import prisma from "~/server/lib/prisma";
import { requireUser } from "~/server/lib/permissions";
import { serializeWorkspace } from "~/server/lib/serializers";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);

  const memberships = await prisma.member.findMany({
    where: { userId: user.id },
    include: { workspace: true },
    orderBy: { createdAt: "desc" },
  });

  return {
    workspaces: memberships.map(({ workspace }) =>
      serializeWorkspace(workspace),
    ),
    memberships: memberships.map(({ id, workspaceId, role }) => ({
      id,
      workspaceId,
      role: role === MemberRole.ADMIN ? "admin" : "member",
    })),
  };
});
