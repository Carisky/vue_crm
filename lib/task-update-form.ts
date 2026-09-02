import type { FilteredTask, TaskMedia } from "./types.ts";
import {
  taskAssigneeValue,
  UNASSIGNED_TASK_ASSIGNEE,
} from "./task-assignee.ts";

export { UNASSIGNED_TASK_ASSIGNEE } from "./task-assignee.ts";

export function taskMediaForUpdate(task: { media?: TaskMedia[] | null }) {
  return task.media ?? [];
}

export function buildUpdateTaskInitialValues(task: FilteredTask) {
  return {
    name: task.name,
    project_id: task.project_id,
    status: task.status,
    priority: task.priority,
    due_date: task.due_date ? new Date(task.due_date) : undefined,
    assignee_id: taskAssigneeValue({
      userId: task.assignee_id,
      groupId: task.assignee_group_id,
    }),
    description: task.description ?? "",
    started_at: task.started_at ? new Date(task.started_at) : undefined,
    position: task.position,
  };
}
