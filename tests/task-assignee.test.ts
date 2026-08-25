import assert from "node:assert/strict";
import test from "node:test";

import {
  groupAssigneeValue,
  parseTaskAssigneeValue,
  taskAssigneeValue,
  UNASSIGNED_TASK_ASSIGNEE,
  userAssigneeValue,
} from "../lib/task-assignee.ts";

test("encodes and decodes user task assignment", () => {
  assert.equal(userAssigneeValue("user-1"), "user:user-1");
  assert.deepEqual(parseTaskAssigneeValue("user:user-1"), {
    assignee_id: "user-1",
    assignee_group_id: null,
  });
});

test("encodes and decodes group task assignment", () => {
  assert.equal(groupAssigneeValue("group-1"), "group:group-1");
  assert.equal(
    taskAssigneeValue({ userId: "user-1", groupId: "group-1" }),
    "group:group-1",
  );
  assert.deepEqual(parseTaskAssigneeValue("group:group-1"), {
    assignee_id: null,
    assignee_group_id: "group-1",
  });
});

test("clears assignment for the unassigned option", () => {
  assert.equal(
    taskAssigneeValue({ userId: null, groupId: null }),
    UNASSIGNED_TASK_ASSIGNEE,
  );
  assert.deepEqual(parseTaskAssigneeValue(UNASSIGNED_TASK_ASSIGNEE), {
    assignee_id: null,
    assignee_group_id: null,
  });
});
