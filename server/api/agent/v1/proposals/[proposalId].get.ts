import { requireAgentApiKey } from "~/server/lib/agent-api-key";
import { serializeAgentProposal } from "~/server/lib/agent-proposals";
import prisma from "~/server/lib/prisma";

export default defineEventHandler(async (event) => {
  const key = await requireAgentApiKey(event);
  const { proposalId } = getRouterParams(event);
  const proposal = await prisma.agentProposal.findFirst({
    where: { id: proposalId, userId: key.userId },
    include: { workspace: { select: { name: true } } },
  });
  if (!proposal) throw createError({ status: 404, statusText: "Proposal not found" });
  return { proposal: serializeAgentProposal(proposal) };
});
