import assert from "node:assert/strict";
import test from "node:test";

import * as taskUpdateForm from "../lib/task-update-form.ts";
import type { TaskPriority, TaskStatus } from "../lib/types.ts";

test("keeps only editable task fields in update-form initial values", () => {
  const result = taskUpdateForm.buildUpdateTaskInitialValues({
    $id: "task-1",
    name: "Task",
    workspace_id: "workspace-1",
    project_id: "project-1",
    parent_id: null,
    status: "TODO" as TaskStatus,
    priority: "MEDIUM" as TaskPriority,
    due_date: null,
    assignee_id: null,
    assignee_group_id: null,
    description: null,
    position: 1,
    progress: 0,
    completed_subtasks: 0,
    total_subtasks: 1,
    started_at: null,
    media: [],
    project: {
      $id: "project-1",
      name: "Project",
      image_url: null,
      workspace_id: "workspace-1",
      parent_id: null,
      progress: 0,
      completed_tasks: 0,
      total_tasks: 1,
    },
    assignee: null,
    assignee_group: null,
  });

  assert.deepEqual(result, {
    name: "Task",
    project_id: "project-1",
    status: "TODO",
    priority: "MEDIUM",
    due_date: undefined,
    assignee_id: "__UNASSIGNED__",
    description: "",
    started_at: undefined,
    position: 1,
  });
});

test("treats missing media from stale task data as an empty list", () => {
  assert.equal(
    typeof (taskUpdateForm as Record<string, unknown>)["taskMediaForUpdate"],
    "function",
  );
  const taskMediaForUpdate = (
    taskUpdateForm as unknown as {
      taskMediaForUpdate(task: { media?: unknown[] }): unknown[];
    }
  ).taskMediaForUpdate;

  assert.deepEqual(taskMediaForUpdate({}), []);
});
