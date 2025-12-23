import * as z from "zod";

import { TaskPriority, TaskStatus } from "../types";

const optionalHoursField = z
  .preprocess((value) => {
    if (value === "" || value === null || value === undefined) return undefined;
    return value;
  }, z.coerce.number().nonnegative())
  .optional();

const optionalStartedAtField = z
  .preprocess((value) => {
    if (value === "" || value === null || value === undefined) return null;
    return value;
  }, z.coerce.date())
  .optional()
  .nullable();

export const CreateTasksSchema = z.object({
  name: z.string().trim().min(1, "Required"),
  workspace_id: z.string().trim().min(1, "Required"),
  project_id: z.string().trim().min(1, "Required"),
  status: z.nativeEnum(TaskStatus, { required_error: "Required" }),
  priority: z.nativeEnum(TaskPriority, { required_error: "Required" }),
  due_date: z.coerce.date().optional().nullable(),
  assignee_id: z.string().trim().min(1, "Required").optional().nullable(),
  description: z.string().optional(),
  estimated_hours: optionalHoursField,
  actual_hours: optionalHoursField,
  started_at: optionalStartedAtField,
  media: z
    .array(
      z.object({
        path: z.string().trim().min(1, "Required"),
        mime: z.string().optional(),
        original_name: z.string().optional(),
      }),
    )
    .optional(),
  position: z.number().optional(),
});
