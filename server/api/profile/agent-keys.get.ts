import { requireUser } from "~/server/lib/permissions";
import prisma from "~/server/lib/prisma";
import { serializeAgentApiKey } from "~/server/lib/agent-api-key";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const keys = await prisma.agentApiKey.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return { keys: keys.map(serializeAgentApiKey) };
});
