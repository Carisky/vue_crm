import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { validateTelegramMiniAppData } from "../lib/telegram-init-data.ts";

function signedInitData(botToken: string, authDate: number) {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: "AAHdF6IQAAAAAN0XohDhrOrc",
    user: JSON.stringify({ id: 123456, first_name: "Test" }),
  });
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  params.set(
    "hash",
    createHmac("sha256", secretKey).update(dataCheckString).digest("hex"),
  );
  return params.toString();
}

test("accepts fresh Telegram Mini App data signed by the bot", () => {
  const now = 1_800_000_000;
  const initData = signedInitData("123456:test-token", now);
  assert.deepEqual(
    validateTelegramMiniAppData(initData, "123456:test-token", now),
    { id: 123456, first_name: "Test" },
  );
});

test("rejects tampered and expired Telegram Mini App data", () => {
  const now = 1_800_000_000;
  const valid = signedInitData("123456:test-token", now);
  assert.equal(
    validateTelegramMiniAppData(
      valid.replace("Test", "Attacker"),
      "123456:test-token",
      now,
    ),
    null,
  );
  assert.equal(
    validateTelegramMiniAppData(
      signedInitData("123456:test-token", now - 86_401),
      "123456:test-token",
      now,
    ),
    null,
  );
});
