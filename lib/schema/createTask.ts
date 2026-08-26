import * as z from "zod";

import { TaskPriority, TaskStatus } from "../types";

function normalizePastedText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\u00A0/g, " ");
}

const optionalDueDateField = z
  .preprocess((value) => {
    if (value === "" || value === null || value === undefined) return null;
    if (typeof value === "string" && !value.trim()) return null;
    return value;
  }, z.coerce.date().nullable())
  .optional();

const optionalStartedAtField = z
  .preprocess((value) => {
    if (value === "" || value === null || value === undefined) return null;
    if (typeof value === "string" && !value.trim()) return null;
    return value;
  }, z.coerce.date().nullable())
  .optional()
  .nullable();

export const CreateTasksSchema = z
  .object({
    name: z.preprocess(
      (value) =>
        typeof value === "string" ? normalizePastedText(value) : value,
      z.string().trim().min(1, "Required"),
    ),
    workspace_id: z.string().trim().min(1, "Required"),
    project_id: z.string().trim().min(1, "Required"),
    parent_task_id: z.string().trim().min(1).optional().nullable(),
    status: z.nativeEnum(TaskStatus, { required_error: "Required" }),
    priority: z.nativeEnum(TaskPriority, { required_error: "Required" }),
    due_date: optionalDueDateField,
    assignee_id: z.string().trim().min(1, "Required").optional().nullable(),
    assignee_group_id: z
      .string()
      .trim()
      .min(1, "Required")
      .optional()
      .nullable(),
    description: z
      .preprocess(
        (value) =>
          typeof value === "string" ? normalizePastedText(value) : value,
        z.string(),
      )
      .optional(),
    started_at: optionalStartedAtField,
    media_ids: z.array(z.string().trim().min(1)).max(10).optional(),
    position: z.number().optional(),
  })
  .strict();
