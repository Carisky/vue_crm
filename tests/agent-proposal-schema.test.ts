import assert from "node:assert/strict";
import test from "node:test";

import { CreateAgentProposalSchema } from "../lib/schema/agentProposal.ts";

test("accepts an atomic project and nested task proposal", () => {
  const parsed = CreateAgentProposalSchema.safeParse({
    title: "Create billing work",
    workspace_id: "workspace-1",
    operations: [
      {
        type: "project.create",
        ref: "billing",
        workspace_id: "workspace-1",
        name: "Billing",
        parent_project_id: null,
      },
      {
        type: "task.create",
        ref: "api",
        workspace_id: "workspace-1",
        project_ref: "billing",
        name: "Implement API",
      },
      {
        type: "task.create",
        workspace_id: "workspace-1",
        project_ref: "billing",
        parent_task_ref: "api",
        name: "Add retry policy",
      },
    ],
  });

  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.operations[1]?.type, "task.create");
    assert.equal(
      parsed.data.operations[1]?.type === "task.create"
        ? parsed.data.operations[1].status
        : null,
      "BACKLOG",
    );
  }
});

test("rejects forward references and cross-workspace operations", () => {
  const parsed = CreateAgentProposalSchema.safeParse({
    title: "Invalid package",
    workspace_id: "workspace-1",
    operations: [
      {
        type: "task.create",
        workspace_id: "workspace-2",
        project_ref: "later-project",
        name: "Task",
      },
      {
        type: "project.create",
        ref: "later-project",
        workspace_id: "workspace-1",
        name: "Project",
      },
    ],
  });

  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.ok(parsed.error.issues.some((issue) => issue.message.includes("workspace")));
    assert.ok(parsed.error.issues.some((issue) => issue.message.includes("earlier")));
  }
});

test("rejects task writes with both assignee types", () => {
  const parsed = CreateAgentProposalSchema.safeParse({
    title: "Invalid assignee",
    workspace_id: "workspace-1",
    operations: [
      {
        type: "task.update",
        task_id: "task-1",
        assignee_id: "user-1",
        assignee_group_id: "group-1",
      },
    ],
  });

  assert.equal(parsed.success, false);
});
