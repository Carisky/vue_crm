import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;

export type TelegramMiniAppUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
};

function safeHexEqual(received: string, expected: string) {
  if (!/^[a-f0-9]{64}$/i.test(received)) return false;
  const receivedBuffer = Buffer.from(received, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function calculateHash(
  params: URLSearchParams,
  botToken: string,
  excludeSignature: boolean,
) {
  const entries = [...params.entries()]
    .filter(
      ([key]) => key !== "hash" && (!excludeSignature || key !== "signature"),
    )
    .sort(([left], [right]) => left.localeCompare(right));
  const dataCheckString = entries
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  return createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
}

export function validateTelegramMiniAppData(
  initData: string,
  botToken: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash") ?? "";
  const validHash = [false, true].some((excludeSignature) =>
    safeHexEqual(
      receivedHash,
      calculateHash(params, botToken, excludeSignature),
    ),
  );
  if (!validHash) return null;

  const authDate = Number(params.get("auth_date"));
  if (
    !Number.isSafeInteger(authDate) ||
    authDate > nowSeconds + 60 ||
    nowSeconds - authDate > MAX_AUTH_AGE_SECONDS
  ) {
    return null;
  }

  try {
    const user = JSON.parse(params.get("user") ?? "") as TelegramMiniAppUser;
    if (!Number.isSafeInteger(user.id) || !user.first_name) return null;
    return user;
  } catch {
    return null;
  }
}
