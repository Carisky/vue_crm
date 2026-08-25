import * as z from "zod";

import { appLocales } from "../locales.ts";
import { themePreferences } from "../preferences.ts";

export const ThemePreferenceSchema = z.enum(themePreferences);
export type ThemePreference = z.infer<typeof ThemePreferenceSchema>;

export const UpdateThemeSchema = z.object({
  theme: ThemePreferenceSchema,
});

export const UpdateEmailNotificationsSchema = z.object({
  email_notifications_enabled: z.boolean(),
});

export const UpdateLocaleSchema = z.object({
  locale: z.enum(appLocales),
});
