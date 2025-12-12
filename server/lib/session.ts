import { createHash, randomBytes } from "node:crypto";
import { createError } from "h3";

import prisma from "./prisma";

const SESSION_TTL_DAYS = 30;
const SESSION_SECRET = process.env.SESSION_SECRET;

function getExpiresAt(ttlDays = SESSION_TTL_DAYS) {
  return new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
}

export function hashToken(token: string) {
  if (!SESSION_SECRET) {
    throw createError({
      status: 500,
      statusText: "SESSION_SECRET is not configured",
    });
  }
  return createHash("sha256")
    .update(`${token}:${SESSION_SECRET}`)
    .digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(48).toString("hex");
  const tokenHash = hashToken(token);

  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt: getExpiresAt(),
    },
    include: {
      user: true,
    },
  });

  return { token, session };
}

export async function getSessionByToken(token?: string | null) {
  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } });
    return null;
  }

  return session;
}

export async function deleteSessionByToken(token?: string | null) {
  if (!token) return;

  const tokenHash = hashToken(token);

  await prisma.session.deleteMany({
    where: { tokenHash },
  });
}
