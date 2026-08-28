import { createHash, randomBytes } from "node:crypto";
import QRCode from "qrcode";

import prisma from "~/server/lib/prisma";
import { requireUser } from "~/server/lib/permissions";
import { getTelegramConfig, isTelegramConfigured } from "~/server/lib/telegram";

const LINK_TTL_MS = 10 * 60 * 1000;

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  if (!isTelegramConfigured()) {
    throw createError({
      status: 503,
      statusText: "Telegram integration is not configured",
    });
  }

  const { botUsername } = getTelegramConfig();
  const token = randomBytes(24).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + LINK_TTL_MS);

  await prisma.$transaction([
    prisma.telegramLinkToken.deleteMany({
      where: {
        OR: [{ userId: user.id }, { expiresAt: { lt: new Date() } }],
      },
    }),
    prisma.telegramLinkToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    }),
  ]);

  const deepLink = `https://t.me/${botUsername}?start=${token}`;
  const qrDataUrl = await QRCode.toDataURL(deepLink, {
    width: 320,
    margin: 1,
    errorCorrectionLevel: "M",
  });

  return {
    deepLink,
    qrDataUrl,
    expiresAt: expiresAt.toISOString(),
  };
});
