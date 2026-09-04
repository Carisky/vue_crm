import { createHmac, timingSafeEqual } from "node:crypto";

export const MATTERMOST_SIGNATURE_WINDOW_MS = 300_000;

export type MattermostSignatureInput = {
  body: string;
  method: string;
  nonce: string;
  path: string;
  secret: string;
  timestamp: number;
};

export type MattermostVerificationInput = MattermostSignatureInput & {
  signature: string;
};

export type MattermostVerificationOptions = {
  now?: number;
  claimNonce?: (nonce: string, expiresAt: number) => Promise<boolean>;
};

function canonicalRequest(input: MattermostSignatureInput) {
  return [
    String(input.timestamp),
    input.nonce,
    input.method.toUpperCase(),
    input.path,
    input.body,
  ].join("\n");
}

export function signMattermostRequest(input: MattermostSignatureInput) {
  return createHmac("sha256", input.secret)
    .update(canonicalRequest(input), "utf8")
    .digest("hex");
}

export async function verifyMattermostRequest(
  input: MattermostVerificationInput,
  options: MattermostVerificationOptions = {},
) {
  const now = options.now ?? Date.now();
  if (
    !Number.isSafeInteger(input.timestamp) ||
    Math.abs(now - input.timestamp) > MATTERMOST_SIGNATURE_WINDOW_MS ||
    !input.nonce ||
    !/^[a-f0-9]{64}$/i.test(input.signature)
  ) {
    return false;
  }

  const expected = Buffer.from(signMattermostRequest(input), "hex");
  const received = Buffer.from(input.signature, "hex");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return false;
  }

  return options.claimNonce
    ? options.claimNonce(
        input.nonce,
        input.timestamp + MATTERMOST_SIGNATURE_WINDOW_MS,
      )
    : true;
}
