import * as z from "zod";

import { themePreferences } from "~/lib/types";

export const ThemePreferenceSchema = z.enum(themePreferences);
export type ThemePreference = z.infer<typeof ThemePreferenceSchema>;

export const UpdateThemeSchema = z.object({
  theme: ThemePreferenceSchema,
});

export const UpdateEmailNotificationsSchema = z.object({
  email_notifications_enabled: z.boolean(),
});
