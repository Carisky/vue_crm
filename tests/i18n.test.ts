import assert from "node:assert/strict";
import test from "node:test";

import { localeLabels, translate } from "../lib/i18n.ts";
import { UpdateLocaleSchema } from "../lib/schema/profile.ts";
import { appLocales } from "../lib/locales.ts";

test("accepts every supported persisted locale and rejects unknown values", () => {
  for (const locale of appLocales) {
    assert.equal(UpdateLocaleSchema.safeParse({ locale }).success, true);
  }

  assert.equal(UpdateLocaleSchema.safeParse({ locale: "de" }).success, false);
  assert.equal(UpdateLocaleSchema.safeParse({ locale: "ua" }).success, false);
});

test("exposes the requested language labels", () => {
  assert.deepEqual(localeLabels, { en: "EN", pl: "PL", ru: "RU", uk: "UA" });
});

test("translates core navigation and interpolates values", () => {
  assert.equal(translate("ru", "nav.myTasks"), "Мои задания");
  assert.equal(translate("pl", "docs.updated", { date: "25.08.2026" }), "Zaktualizowano 25.08.2026");
  assert.equal(translate("uk", "messages.mentionedTask", { task: "CRM" }), "Вас згадали в завданні CRM");
});
