import { createHash, timingSafeEqual } from "node:crypto";

import { normalizeTelegramLocale, telegramT } from "~/lib/telegram-i18n";
import prisma from "~/server/lib/prisma";
import {
  configureTelegramMiniAppMenu,
  getTelegramConfig,
  getTelegramMiniAppUrl,
  sendTelegramMessage,
  TelegramApiError,
  type TelegramMessage,
  type TelegramUpdatePayload,
} from "~/server/lib/telegram";

function sameSecret(received: string, expected: string) {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function startToken(text: string) {
  return text
    .trim()
    .match(/^\/start(?:@[A-Za-z0-9_]+)?(?:\s+([A-Za-z0-9_-]+))?$/)?.[1];
}

async function sendMiniAppButton(
  chatId: string,
  chatCount: number,
  locale: string,
) {
  const webAppUrl = getTelegramMiniAppUrl();
  try {
    await configureTelegramMiniAppMenu({ chatId, locale });
  } catch (error) {
    console.warn("[telegram] failed to configure a localized Mini App menu", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
  await sendTelegramMessage(
    chatId,
    telegramT(locale, "bot.ready", { count: chatCount }),
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: telegramT(locale, "bot.openChats"),
              web_app: { url: webAppUrl },
            },
          ],
        ],
      },
    },
  );
}

async function connectFromStart(message: TelegramMessage, token: string) {
  if (!message.from || message.chat.type !== "private") return;

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const linkToken = await prisma.telegramLinkToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { locale: true } } },
  });
  const locale = normalizeTelegramLocale(
    linkToken?.user.locale ?? message.from.language_code,
  );
  if (!linkToken || linkToken.usedAt || linkToken.expiresAt <= new Date()) {
    await sendTelegramMessage(
      String(message.chat.id),
      telegramT(locale, "bot.linkExpired"),
    );
    return;
  }

  const telegramUserId = String(message.from.id);
  const telegramChatId = String(message.chat.id);
  const existingOwner = await prisma.telegramConnection.findUnique({
    where: { telegramUserId },
    select: { userId: true },
  });
  if (existingOwner && existingOwner.userId !== linkToken.userId) {
    await sendTelegramMessage(
      telegramChatId,
      telegramT(locale, "bot.linkedElsewhere"),
    );
    return;
  }

  const now = new Date();
  const connection = await prisma.$transaction(async (tx) => {
    const freshToken = await tx.telegramLinkToken.findUnique({
      where: { tokenHash },
    });
    if (!freshToken || freshToken.usedAt || freshToken.expiresAt <= now) {
      return null;
    }

    const result = await tx.telegramConnection.upsert({
      where: { userId: freshToken.userId },
      create: {
        userId: freshToken.userId,
        telegramUserId,
        telegramChatId,
        username: message.from?.username ?? null,
        firstName: message.from?.first_name ?? null,
        lastName: message.from?.last_name ?? null,
      },
      update: {
        telegramUserId,
        telegramChatId,
        username: message.from?.username ?? null,
        firstName: message.from?.first_name ?? null,
        lastName: message.from?.last_name ?? null,
        linkedAt: now,
      },
    });
    await tx.telegramLinkToken.update({
      where: { id: freshToken.id },
      data: { usedAt: now },
    });
    await tx.telegramLinkToken.deleteMany({
      where: { userId: freshToken.userId, id: { not: freshToken.id } },
    });
    return result;
  });

  if (!connection) {
    await sendTelegramMessage(
      telegramChatId,
      telegramT(locale, "bot.linkUsed"),
    );
    return;
  }

  const count = await prisma.conversationParticipant.count({
    where: { userId: connection.userId },
  });
  await sendMiniAppButton(telegramChatId, count, locale);
}

async function processMessage(message: TelegramMessage) {
  if (!message.from || message.from.is_bot || message.chat.type !== "private") {
    return;
  }

  const token = startToken(message.text ?? "");
  if (token) {
    await connectFromStart(message, token);
    return;
  }

  const connection = await prisma.telegramConnection.findUnique({
    where: { telegramUserId: String(message.from.id) },
    include: { user: { select: { locale: true } } },
  });
  const locale = normalizeTelegramLocale(
    connection?.user.locale ?? message.from.language_code,
  );
  if (!connection || connection.telegramChatId !== String(message.chat.id)) {
    await sendTelegramMessage(
      String(message.chat.id),
      telegramT(locale, "bot.linkFirst"),
    );
    return;
  }

  const count = await prisma.conversationParticipant.count({
    where: { userId: connection.userId },
  });
  await sendMiniAppButton(connection.telegramChatId, count, locale);
}

export default defineEventHandler(async (event) => {
  const expectedSecret = getTelegramConfig().webhookSecret;
  const receivedSecret =
    getHeader(event, "x-telegram-bot-api-secret-token") ?? "";
  if (!expectedSecret || !sameSecret(receivedSecret, expectedSecret)) {
    throw createError({ status: 401, statusText: "Invalid Telegram secret" });
  }

  const update = await readBody<TelegramUpdatePayload>(event);
  if (!Number.isSafeInteger(update?.update_id)) {
    throw createError({ status: 400, statusText: "Invalid Telegram update" });
  }

  const updateId = String(update.update_id);
  try {
    await prisma.telegramUpdate.create({ data: { updateId } });
  } catch (error) {
    if (isUniqueConstraintError(error)) return { ok: true };
    throw error;
  }

  try {
    if (update.message) await processMessage(update.message);
    if (Math.random() < 0.01) {
      await prisma.telegramUpdate.deleteMany({
        where: {
          createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      });
    }
    return { ok: true };
  } catch (error) {
    if (error instanceof TelegramApiError) {
      console.error("[telegram] failed to answer webhook update", error);
      return { ok: true };
    }
    await prisma.telegramUpdate.delete({ where: { updateId } }).catch(() => {});
    throw error;
  }
});
