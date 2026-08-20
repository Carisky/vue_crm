import { createHash, timingSafeEqual } from "node:crypto";
import {
  getHeader,
  setResponseHeader,
  setResponseStatus,
  type H3Event,
} from "h3";

const hostsWithoutBasicAuth = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "192.168.1.222",
  "192.168.0.204",
]);

type FailedAttempt = {
  attempts: number[];
  blockedUntil: number;
};

const failedAttemptsByIp = new Map<string, FailedAttempt>();

function getPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getClientIp(event: H3Event) {
  const forwardedFor = getHeader(event, "x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const ip =
    getHeader(event, "x-real-ip") ??
    forwardedFor ??
    event.node.req.socket.remoteAddress ??
    "unknown";

  return ip.replace(/^::ffff:/, "");
}

function getFailedAttempt(ip: string, now: number, windowMs: number) {
  const record = failedAttemptsByIp.get(ip);
  if (!record) return;

  record.attempts = record.attempts.filter(
    (attempt) => now - attempt < windowMs,
  );
  if (!record.attempts.length && record.blockedUntil <= now) {
    failedAttemptsByIp.delete(ip);
    return;
  }

  return record;
}

function getHostname(host: string | undefined) {
  if (!host) return "";

  try {
    return new URL(`http://${host}`).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function credentialsMatch(provided: string, expected: string) {
  const providedHash = createHash("sha256").update(provided).digest();
  const expectedHash = createHash("sha256").update(expected).digest();

  return timingSafeEqual(providedHash, expectedHash);
}

export default defineEventHandler((event) => {
  const hostname = getHostname(getHeader(event, "host"));
  if (hostsWithoutBasicAuth.has(hostname)) return;

  const username = process.env.BASIC_AUTH_USERNAME;
  const password = process.env.BASIC_AUTH_PASSWORD;
  const attemptsPerMinute = getPositiveInteger(
    process.env.BASIC_AUTH_MAX_ATTEMPTS_PER_MINUTE,
    10,
  );
  const banMinutes = getPositiveInteger(process.env.BASIC_AUTH_BAN_MINUTES, 15);
  const now = Date.now();
  const clientIp = getClientIp(event);
  const failedAttempt = getFailedAttempt(clientIp, now, 60_000);

  // Never expose the external address without credentials if it was configured
  // incorrectly.
  if (!username || !password) {
    setResponseStatus(event, 503, "Basic Auth is not configured");
    return "Basic Auth is not configured.";
  }

  if (failedAttempt && failedAttempt.blockedUntil > now) {
    setResponseStatus(event, 429, "Too many authentication attempts");
    return "Too many authentication attempts. Try again later.";
  }

  const authorization = getHeader(event, "authorization");
  const encodedCredentials = authorization?.match(/^Basic\s+(.+)$/i)?.[1];

  let suppliedCredentials = "";
  if (encodedCredentials) {
    try {
      suppliedCredentials = Buffer.from(encodedCredentials, "base64").toString(
        "utf8",
      );
    } catch {
      // An invalid header is handled as an unauthenticated request below.
    }
  }

  const separatorIndex = suppliedCredentials.indexOf(":");
  const suppliedUsername =
    separatorIndex >= 0 ? suppliedCredentials.slice(0, separatorIndex) : "";
  const suppliedPassword =
    separatorIndex >= 0 ? suppliedCredentials.slice(separatorIndex + 1) : "";

  if (
    credentialsMatch(suppliedUsername, username) &&
    credentialsMatch(suppliedPassword, password)
  ) {
    failedAttemptsByIp.delete(clientIp);
    return;
  }

  const attempts = failedAttempt?.attempts ?? [];
  attempts.push(now);
  const blockedUntil =
    attempts.length >= attemptsPerMinute ? now + banMinutes * 60_000 : 0;
  failedAttemptsByIp.set(clientIp, { attempts, blockedUntil });

  setResponseHeader(
    event,
    "WWW-Authenticate",
    'Basic realm="CRM", charset="UTF-8"',
  );
  setResponseStatus(event, 401, "Authentication required");
  return "Authentication required.";
});
