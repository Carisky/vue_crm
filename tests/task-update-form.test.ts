import assert from "node:assert/strict";
import test from "node:test";

import { buildUpdateTaskInitialValues } from "../lib/task-update-form.ts";

test("keeps only editable task fields in update-form initial values", () => {
  const result = buildUpdateTaskInitialValues({
    $id: "task-1",
    name: "Task",
    workspace_id: "workspace-1",
    project_id: "project-1",
    status: "TODO",
    priority: "MEDIUM",
    due_date: null,
    assignee_id: null,
    description: null,
    position: 1,
    started_at: null,
    media: [],
    project: { $id: "project-1", name: "Project", image_url: null },
    assignee: null,
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
