import prisma from "~/server/lib/prisma";
import { enqueueEmail } from "~/server/lib/email-queue";
import { renderPasswordResetEmail } from "~/server/lib/email-templates";
import { hashPassword } from "~/server/lib/password";
import {
  requestPasswordReset,
  resetPassword,
} from "~/server/lib/password-reset-service";
import { synchronizeMattermostCredentialsWithRuntime } from "~/server/lib/mattermost/account-sync";

const PASSWORD_RESET_EMAIL_SUBJECT = "Reset your password";

export async function requestPasswordResetEmail(email: string, siteUrl: string) {
  return requestPasswordReset(email, {
    findUserByEmail: (normalizedEmail) =>
      prisma.user.findUnique({ where: { email: normalizedEmail } }),
    saveToken: async ({ userId, tokenHash, expiresAt }) => {
      await prisma.passwordResetToken.upsert({
        where: { userId },
        create: { userId, tokenHash, expiresAt },
        update: { tokenHash, expiresAt },
      });
    },
    deliverResetLink: async ({ userId, email: recipient, token }) => {
      const resetUrl = `${siteUrl.replace(/\/$/, "")}/reset-password/${encodeURIComponent(token)}`;
      const { html, text } = renderPasswordResetEmail({
        resetUrl,
        expiresInMinutes: 30,
      });

      await prisma.emailQueue.deleteMany({
        where: {
          userId,
          subject: PASSWORD_RESET_EMAIL_SUBJECT,
          status: { in: ["PENDING", "FAILED"] },
        },
      });
      await enqueueEmail({
        userId,
        to: recipient,
        subject: PASSWORD_RESET_EMAIL_SUBJECT,
        html,
        text,
      });
    },
  });
}

export async function applyPasswordReset(token: string, password: string) {
  let resetUserId: string | null = null;
  const reset = await resetPassword(token, password, {
    findToken: async (tokenHash) => {
      const storedToken = await prisma.passwordResetToken.findUnique({
        where: { tokenHash },
      });
      resetUserId = storedToken?.userId ?? null;
      return storedToken;
    },
    hashPassword,
    commitPasswordReset: async ({ userId, tokenId, passwordHash }) => {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: { passwordHash },
        });
        await tx.session.deleteMany({ where: { userId } });
        await tx.passwordResetToken.deleteMany({
          where: { id: tokenId, userId },
        });
        await tx.emailQueue.deleteMany({
          where: { userId, subject: PASSWORD_RESET_EMAIL_SUBJECT },
        });
      });
    },
  });

  if (reset && resetUserId) {
    const user = await prisma.user.findUnique({ where: { id: resetUserId } });
    if (user) {
      await synchronizeMattermostCredentialsWithRuntime(
        { user, password },
        useRuntimeConfig(),
      );
    }
  }

  return reset;
}

export async function removeExpiredPasswordResetTokens() {
  await prisma.passwordResetToken.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });
}
