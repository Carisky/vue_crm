import { sendRedirect } from "h3";

import prisma from "~/server/lib/prisma";
import { getVerificationTokenHash } from "~/server/lib/email-verification";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const siteUrl = String(config.public.siteUrl ?? "").replace(/\/$/, "");
  const query = getQuery(event);
  const token = typeof query.token === "string" ? query.token : null;

  if (!token) {
    return sendRedirect(event, `${siteUrl}/sign-in?verified=invalid`, 302);
  }

  const verification = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: getVerificationTokenHash(token) },
  });

  if (!verification || verification.expiresAt.getTime() <= Date.now()) {
    return sendRedirect(event, `${siteUrl}/sign-in?verified=expired`, 302);
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: verification.userId },
      data: { emailVerifiedAt: new Date() },
    });
    await tx.emailVerificationToken.delete({ where: { id: verification.id } });
    await tx.emailQueue.deleteMany({
      where: {
        userId: verification.userId,
        subject: "Confirm your email address",
      },
    });
  });

  return sendRedirect(event, `${siteUrl}/sign-in?verified=success`, 302);
});
