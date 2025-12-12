import * as z from "zod";

export const UpdateMonthlyTargetSchema = z.object({
  monthly_target_hours: z
    .number()
    .int()
    .min(1, "Target must be at least 1 hour")
    .max(744, "Target cannot exceed 744 hours"),
});
