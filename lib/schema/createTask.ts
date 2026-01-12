import * as z from "zod";

import { TaskPriority, TaskStatus } from "../types";

function normalizePastedText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\u00A0/g, " ");
}

function normalizeNumberString(value: string) {
  const trimmed = normalizePastedText(value).trim();
  if (!trimmed) return "";

  const compact = trimmed.replace(/[\s\u202F\u00A0]/g, "");
  const hasComma = compact.includes(",");
  const hasDot = compact.includes(".");

  if (hasComma && hasDot) {
    const lastComma = compact.lastIndexOf(",");
    const lastDot = compact.lastIndexOf(".");
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandSeparator = decimalSeparator === "," ? "." : ",";

    return compact
      .split(thousandSeparator)
      .join("")
      .replace(decimalSeparator, ".");
  }

  if (hasComma) return compact.replace(",", ".");
  return compact;
}

const optionalHoursField = z
  .preprocess((value) => {
    if (value === "" || value === null || value === undefined) return undefined;
    if (typeof value === "string") {
      const normalized = normalizeNumberString(value);
      if (!normalized) return undefined;
      return normalized;
    }
    return value;
  }, z.coerce.number().nonnegative())
  .optional();

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

export const CreateTasksSchema = z.object({
  name: z.preprocess(
    (value) => (typeof value === "string" ? normalizePastedText(value) : value),
    z.string().trim().min(1, "Required"),
  ),
  workspace_id: z.string().trim().min(1, "Required"),
  project_id: z.string().trim().min(1, "Required"),
  status: z.nativeEnum(TaskStatus, { required_error: "Required" }),
  priority: z.nativeEnum(TaskPriority, { required_error: "Required" }),
  due_date: optionalDueDateField,
  assignee_id: z.string().trim().min(1, "Required").optional().nullable(),
  description: z
    .preprocess(
      (value) =>
        typeof value === "string" ? normalizePastedText(value) : value,
      z.string(),
    )
    .optional(),
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
