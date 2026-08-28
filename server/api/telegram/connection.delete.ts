import prisma from "~/server/lib/prisma";
import { requireUser } from "~/server/lib/permissions";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  await prisma.telegramConnection.deleteMany({ where: { userId: user.id } });
  await prisma.telegramLinkToken.deleteMany({ where: { userId: user.id } });
  return { disconnected: true };
});
