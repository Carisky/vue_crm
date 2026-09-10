export const appLocales = ["en", "pl", "ru"] as const;

export type AppLocale = (typeof appLocales)[number];

export const defaultAppLocale: AppLocale = "pl";
