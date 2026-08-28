import type { H3Event } from "h3";

import { validateTelegramMiniAppData } from "~/lib/telegram-init-data";
import prisma from "~/server/lib/prisma";
import { getTelegramConfig } from "~/server/lib/telegram";

export async function requireTelegramMiniAppUser(event: H3Event) {
  const initData = getHeader(event, "x-telegram-init-data") ?? "";
  const telegramUser = validateTelegramMiniAppData(
    initData,
    getTelegramConfig().botToken,
  );
  if (!telegramUser) {
    throw createError({
      status: 401,
      statusText: "Invalid Telegram Mini App data",
    });
  }

  const connection = await prisma.telegramConnection.findUnique({
    where: { telegramUserId: String(telegramUser.id) },
    include: { user: true },
  });
  if (!connection) {
    throw createError({ status: 401, statusText: "Telegram is not linked" });
  }
  return connection;
}
