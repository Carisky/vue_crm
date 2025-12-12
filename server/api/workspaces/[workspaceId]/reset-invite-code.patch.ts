import { MemberRole } from "@prisma/client";

import prisma from "~/server/lib/prisma";
import { ensureWorkspaceAccess } from "~/server/lib/workspace";
import { generateWorkspaceInviteCode } from "~/server/lib/invite";

export default defineEventHandler(async (event) => {
  const { workspaceId } = getRouterParams(event);

  await ensureWorkspaceAccess(event, workspaceId, [MemberRole.ADMIN]);

  const inviteCode = await generateWorkspaceInviteCode();

  const workspace = await prisma.workspace.update({
    where: { id: workspaceId },
    data: { inviteCode },
  });

  return { inviteCode: workspace.inviteCode };
});
