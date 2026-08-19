import { SignUpSchema } from "~/lib/schema/auth";
import prisma from "~/server/lib/prisma";
import { hashPassword } from "~/server/lib/password";
import { createEmailVerification } from "~/server/lib/email-verification";
import { renderEmailVerificationEmail } from "~/server/lib/email-templates";
import { enqueueEmail } from "~/server/lib/email-queue";

export default defineEventHandler(async (event) => {
  const params = await readValidatedBody(event, SignUpSchema.safeParse);

  if (!params.success) {
    throw createError({ status: 400, statusText: "Invalid credentials" });
  }

  const email = params.data.email.toLowerCase();
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw createError({
      status: 400,
      statusText: "Email already in use",
    });
  }

  const user = await prisma.user.create({
    data: {
      name: params.data.name,
      email,
      passwordHash: await hashPassword(params.data.password),
    },
  });

  const { token } = await createEmailVerification(user.id);
  const config = useRuntimeConfig(event);
  const siteUrl = String(config.public.siteUrl ?? "").replace(/\/$/, "");
  const verificationUrl = `${siteUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  const { html, text } = renderEmailVerificationEmail({
    verificationUrl,
    expiresInMinutes: 30,
  });

  await enqueueEmail({
    userId: user.id,
    to: user.email,
    subject: "Confirm your email address",
    html,
    text,
  });

  return { ok: true, verificationRequired: true };
});
