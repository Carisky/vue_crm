import { MemberRole } from "@prisma/client";

import prisma from "~/server/lib/prisma";
import { ensureWorkspaceAccess } from "~/server/lib/workspace";

export default defineEventHandler(async (event) => {
  const { workspaceId } = getRouterParams(event);

  await ensureWorkspaceAccess(event, workspaceId, [MemberRole.ADMIN]);

  await prisma.workspace.delete({
    where: { id: workspaceId },
  });

  return { ok: true };
});
