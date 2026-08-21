import type { FilteredTask } from "~/lib/types";

export const UNASSIGNED_TASK_ASSIGNEE = "__UNASSIGNED__";

export function buildUpdateTaskInitialValues(task: FilteredTask) {
  return {
    name: task.name,
    project_id: task.project_id,
    status: task.status,
    priority: task.priority,
    due_date: task.due_date ? new Date(task.due_date) : undefined,
    assignee_id: task.assignee_id ?? UNASSIGNED_TASK_ASSIGNEE,
    description: task.description ?? "",
    started_at: task.started_at ? new Date(task.started_at) : undefined,
    position: task.position,
  };
}
