export const appLocales = ["en", "pl", "ru"] as const;

export type AppLocale = (typeof appLocales)[number];
