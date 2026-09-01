import assert from "node:assert/strict";
import test from "node:test";

import { normalizeTelegramLocale, telegramT } from "../lib/telegram-i18n.ts";

test("normalizes supported CRM and Telegram language codes", () => {
  assert.equal(normalizeTelegramLocale("en-US"), "en");
  assert.equal(normalizeTelegramLocale("pl_PL"), "pl");
  assert.equal(normalizeTelegramLocale("ru"), "ru");
  assert.equal(normalizeTelegramLocale("uk-UA"), "en");
  assert.equal(normalizeTelegramLocale("ua"), "en");
  assert.equal(normalizeTelegramLocale("de"), "en");
  assert.equal(normalizeTelegramLocale(null), "en");
});

test("translates Telegram system text and interpolates values", () => {
  assert.match(telegramT("en", "bot.ready", { count: 3 }), /3/);
  assert.equal(telegramT("pl", "conversation.general"), "Czat ogólny");
  assert.equal(telegramT("ru", "mini.message"), "Сообщение");
});
