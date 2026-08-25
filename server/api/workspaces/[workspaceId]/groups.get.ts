import prisma from "~/server/lib/prisma";
import { ensureWorkspaceAccess } from "~/server/lib/workspace";
import { serializeWorkspaceGroup } from "~/server/lib/serializers";
import { ensureWorkspaceGeneralConversation } from "~/server/lib/workspace-channels";

export default defineEventHandler(async (event) => {
  const { workspaceId } = getRouterParams(event);
  await ensureWorkspaceAccess(event, workspaceId);
  await ensureWorkspaceGeneralConversation(workspaceId);

  const groups = await prisma.workspaceGroup.findMany({
    where: { workspaceId },
    include: {
      members: {
        include: { user: true },
        orderBy: { createdAt: "asc" },
      },
      conversation: { select: { id: true } },
    },
    orderBy: { name: "asc" },
  });

  return { groups: groups.map(serializeWorkspaceGroup) };
});
