export const appLocales = ["en", "pl", "ru", "uk"] as const;

export type AppLocale = (typeof appLocales)[number];
