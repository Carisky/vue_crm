import { createHash, randomBytes } from "node:crypto";

import prisma from "~/server/lib/prisma";

export const EMAIL_VERIFICATION_TTL_MS = 30 * 60 * 1000;

function hashVerificationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createEmailVerification(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);

  await prisma.emailVerificationToken.upsert({
    where: { userId },
    create: { userId, tokenHash: hashVerificationToken(token), expiresAt },
    update: { tokenHash: hashVerificationToken(token), expiresAt },
  });

  return { token, expiresAt };
}

export function getVerificationTokenHash(token: string) {
  return hashVerificationToken(token);
}
