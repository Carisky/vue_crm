import { createAgentProposal, serializeAgentProposal } from "~/server/lib/agent-proposals";
import { requireAgentApiKey } from "~/server/lib/agent-api-key";

export default defineEventHandler(async (event) => {
  const key = await requireAgentApiKey(event);
  const proposal = await createAgentProposal({
    body: await readBody(event),
    userId: key.userId,
    apiKeyId: key.id,
  });
  setResponseStatus(event, 202);
  return {
    proposal: serializeAgentProposal(proposal),
    message: "Proposal queued for manual approval",
  };
});
