import { requireUser } from "~/server/lib/permissions";
import prisma from "~/server/lib/prisma";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const { keyId } = getRouterParams(event);
  const revoked = await prisma.agentApiKey.updateMany({
    where: { id: keyId, userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (revoked.count !== 1) {
    throw createError({ status: 404, statusText: "Active API key not found" });
  }
  return { revoked: true };
});
