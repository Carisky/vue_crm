import { approveAgentProposal } from "~/server/lib/agent-proposals";
import { requireUser } from "~/server/lib/permissions";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const { proposalId } = getRouterParams(event);
  return await approveAgentProposal(proposalId, user.id);
});
