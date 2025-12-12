import { MemberRole } from "@prisma/client";

import prisma from "~/server/lib/prisma";
import { requireWorkspaceMembership } from "~/server/lib/permissions";

export default defineEventHandler(async (event) => {
  const { projectId } = getRouterParams(event);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    throw createError({ status: 404, statusText: "Project not found" });
  }

  await requireWorkspaceMembership(event, project.workspaceId, [
    MemberRole.ADMIN,
  ]);

  await prisma.project.delete({ where: { id: projectId } });

  return { ok: true };
});
