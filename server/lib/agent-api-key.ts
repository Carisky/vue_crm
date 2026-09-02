import { createHash, randomBytes } from "node:crypto";
import { createError, getHeader, type H3Event } from "h3";

import prisma from "./prisma";

const API_KEY_PREFIX = "clb_live_";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 120;
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function hashAgentApiKey(token: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw createError({
      status: 500,
      statusText: "SESSION_SECRET is not configured",
    });
  }

  return createHash("sha256")
    .update(`agent-api-key:${token}:${secret}`)
    .digest("hex");
}

function enforceRateLimit(keyId: string) {
  const now = Date.now();
  const current = rateLimitBuckets.get(keyId);
  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(keyId, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return;
  }

  current.count += 1;
  if (current.count > RATE_LIMIT_REQUESTS) {
    throw createError({
      status: 429,
      statusText: "Agent API rate limit exceeded",
    });
  }
}

export async function createAgentApiKey(userId: string, name: string) {
  const token = `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  const key = await prisma.agentApiKey.create({
    data: {
      userId,
      name,
      keyPrefix: token.slice(0, API_KEY_PREFIX.length + 8),
      tokenHash: hashAgentApiKey(token),
    },
  });

  return { key, token };
}

export async function requireAgentApiKey(event: H3Event) {
  const authorization = getHeader(event, "authorization")?.trim() ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]?.startsWith(API_KEY_PREFIX)) {
    throw createError({ status: 401, statusText: "Valid Bearer API key required" });
  }

  const key = await prisma.agentApiKey.findUnique({
    where: { tokenHash: hashAgentApiKey(match[1]) },
    include: { user: true },
  });
  if (
    !key ||
    key.revokedAt ||
    (key.expiresAt && key.expiresAt.getTime() <= Date.now())
  ) {
    throw createError({ status: 401, statusText: "API key is invalid or revoked" });
  }

  enforceRateLimit(key.id);
  await prisma.agentApiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() },
  });

  return key;
}

export function serializeAgentApiKey(key: {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: key.id,
    name: key.name,
    prefix: key.keyPrefix,
    last_used_at: key.lastUsedAt?.toISOString() ?? null,
    expires_at: key.expiresAt?.toISOString() ?? null,
    revoked_at: key.revokedAt?.toISOString() ?? null,
    created_at: key.createdAt.toISOString(),
  };
}
