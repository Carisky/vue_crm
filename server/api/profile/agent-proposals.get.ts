import { AgentProposalStatus } from "@prisma/client";

import { serializeAgentProposal } from "~/server/lib/agent-proposals";
import { requireUser } from "~/server/lib/permissions";
import prisma from "~/server/lib/prisma";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const query = getQuery(event);
  const status = typeof query.status === "string" ? query.status.toUpperCase() : undefined;
  if (status && !Object.values(AgentProposalStatus).includes(status as AgentProposalStatus)) {
    throw createError({ status: 400, statusText: "Invalid proposal status" });
  }
  const proposals = await prisma.agentProposal.findMany({
    where: {
      userId: user.id,
      ...(status ? { status: status as AgentProposalStatus } : {}),
    },
    include: { apiKey: true, workspace: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return { proposals: proposals.map(serializeAgentProposal) };
});
