import { MemberRole } from "@prisma/client";

import prisma from "~/server/lib/prisma";
import {
  requireUser,
  requireWorkspaceMembership,
} from "~/server/lib/permissions";
import { serializeProject } from "~/server/lib/serializers";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const { projectId } = getRouterParams(event);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { workspace: true },
  });

  if (!project) {
    throw createError({ status: 404, statusText: "Project not found" });
  }

  const membership = await requireWorkspaceMembership(
    event,
    project.workspaceId,
  );

  return {
    project: serializeProject(project),
    is_owner: project.workspace.ownerId === user.id,
    is_admin: membership.role === MemberRole.ADMIN,
  };
});
