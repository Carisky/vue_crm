import prisma from "~/server/lib/prisma";
import { requireUser } from "~/server/lib/permissions";
import { getTelegramConfig, isTelegramConfigured } from "~/server/lib/telegram";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const connection = await prisma.telegramConnection.findUnique({
    where: { userId: user.id },
    select: {
      username: true,
      firstName: true,
      lastName: true,
      linkedAt: true,
    },
  });
  const config = getTelegramConfig();

  return {
    configured: isTelegramConfigured(),
    botUsername: config.botUsername || null,
    connected: Boolean(connection),
    connection: connection
      ? {
          username: connection.username,
          firstName: connection.firstName,
          lastName: connection.lastName,
          linkedAt: connection.linkedAt.toISOString(),
        }
      : null,
  };
});
