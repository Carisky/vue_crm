import * as z from "zod";

import { themePreferences } from "~/lib/types";

export const ThemePreferenceSchema = z.enum(themePreferences);
export type ThemePreference = z.infer<typeof ThemePreferenceSchema>;

export const UpdateMonthlyTargetSchema = z.object({
  monthly_target_hours: z
    .number()
    .int()
    .min(1, "Target must be at least 1 hour")
    .max(744, "Target cannot exceed 744 hours"),
});

export const UpdateThemeSchema = z.object({
  theme: ThemePreferenceSchema,
});

export const UpdateEmailNotificationsSchema = z.object({
  email_notifications_enabled: z.boolean(),
});
