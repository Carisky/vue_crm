import nodemailer from "nodemailer";

import prisma from "~/server/lib/prisma";

type EnqueueEmailInput = {
  userId?: string | null;
  to: string;
  subject: string;
  html: string;
  text: string;
};

type EmailQueueOptions = {
  batchSize?: number;
  maxAttempts?: number;
};

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_MAX_ATTEMPTS = 5;

function getSmtpConfig() {
  const config = useRuntimeConfig();

  return {
    host: config.smtpHost as string | undefined,
    port: config.smtpPort ? Number(config.smtpPort) : undefined,
    secure: config.smtpSecure === true || config.smtpSecure === "true",
    user: config.smtpUser as string | undefined,
    pass: config.smtpPass as string | undefined,
    from: config.smtpFrom as string | undefined,
  };
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Unknown error";
}

export async function enqueueEmail(input: EnqueueEmailInput) {
  return prisma.emailQueue.create({
    data: {
      userId: input.userId ?? null,
      toEmail: input.to,
      subject: input.subject,
      htmlBody: input.html,
      textBody: input.text,
      status: "PENDING",
    },
  });
}

export async function processEmailQueue(options: EmailQueueOptions = {}) {
  const smtp = getSmtpConfig();
  if (!smtp.host || !smtp.port || !smtp.from) return;

  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  });

  const items = await prisma.emailQueue.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      attempts: { lt: maxAttempts },
    },
    orderBy: { createdAt: "asc" },
    take: batchSize,
  });

  for (const item of items) {
    const claimed = await prisma.emailQueue.updateMany({
      where: {
        id: item.id,
        status: { in: ["PENDING", "FAILED"] },
      },
      data: {
        status: "SENDING",
        attempts: { increment: 1 },
        lastError: null,
      },
    });

    if (!claimed.count) continue;

    try {
      await transporter.sendMail({
        from: smtp.from,
        to: item.toEmail,
        subject: item.subject,
        html: item.htmlBody,
        text: item.textBody,
      });

      await prisma.emailQueue.update({
        where: { id: item.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          lastError: null,
        },
      });
    } catch (error) {
      await prisma.emailQueue.update({
        where: { id: item.id },
        data: {
          status: "FAILED",
          lastError: safeErrorMessage(error),
        },
      });
    }
  }
}
