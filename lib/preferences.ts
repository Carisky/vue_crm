export const themePreferences = ["light", "dark", "japanese"] as const;

export type ThemePreference = (typeof themePreferences)[number];
