import { requireAgentApiKey } from "~/server/lib/agent-api-key";
import prisma from "~/server/lib/prisma";

export default defineEventHandler(async (event) => {
  const key = await requireAgentApiKey(event);
  const memberships = await prisma.member.findMany({
    where: { userId: key.userId },
    include: { workspace: true },
    orderBy: { createdAt: "desc" },
  });
  return {
    workspaces: memberships.map((membership) => ({
      id: membership.workspace.id,
      name: membership.workspace.name,
      role: membership.role,
    })),
  };
});
