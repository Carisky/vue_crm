import { MemberRole } from "@prisma/client";

import prisma from "~/server/lib/prisma";
import { requireWorkspaceMembership } from "~/server/lib/permissions";
import { collectDescendantIds } from "~/lib/hierarchy";
import { deleteTaskMediaObjects } from "~/server/lib/task-media-delete";
import { getPrivateStorage } from "~/server/lib/storage";

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

  const workspaceProjects = await prisma.project.findMany({
    where: { workspaceId: project.workspaceId },
    select: { id: true, parentId: true },
  });
  const projectIds = collectDescendantIds(workspaceProjects, project.id);
  const branchMedia = await prisma.taskMedia.findMany({
    where: { task: { projectId: { in: projectIds } } },
    include: { variants: true },
  });

  await deleteTaskMediaObjects(branchMedia, getPrivateStorage().storage);

  await prisma.project.delete({ where: { id: projectId } });

  return { ok: true };
});
