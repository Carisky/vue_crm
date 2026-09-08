import { MemberRole } from "@prisma/client";

import prisma from "~/server/lib/prisma";
import {
  requireUser,
} from "~/server/lib/permissions";
import { serializeProject } from "~/server/lib/serializers";
import { requireProjectAccess } from "~/server/lib/project-access";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const { projectId } = getRouterParams(event);

  const { project: accessibleProject, membership } = await requireProjectAccess(event, projectId);
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      workspace: true,
      creator: { select: { id: true, name: true, email: true } },
    },
  });

  if (!project) {
    throw createError({ status: 404, statusText: "Project not found" });
  }

  return {
    project: serializeProject(project),
    creator: project.creator,
    is_owner: project.workspace.ownerId === user.id,
    is_admin: membership.role === MemberRole.ADMIN,
    can_manage_access: accessibleProject.creatorId === user.id,
  };
});
