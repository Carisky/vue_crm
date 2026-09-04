import { MemberRole } from "@prisma/client";

import prisma from "~/server/lib/prisma";
import { ensureWorkspaceAccess } from "~/server/lib/workspace";
import { enqueueWorkspaceDelete } from "~/server/lib/mattermost/domain-events";

export default defineEventHandler(async (event) => {
  const { workspaceId } = getRouterParams(event);

  await ensureWorkspaceAccess(event, workspaceId, [MemberRole.ADMIN]);

  await prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: {
        mattermostLink: { select: { mattermostTeamId: true } },
      },
    });
    if (workspace.mattermostLink) {
      await enqueueWorkspaceDelete(tx, {
        workspaceId,
        mattermostTeamId: workspace.mattermostLink.mattermostTeamId,
      });
    }
    await tx.workspace.delete({ where: { id: workspaceId } });
  });

  return { ok: true };
});
