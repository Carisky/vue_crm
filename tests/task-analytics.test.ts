import assert from "node:assert/strict";
import test from "node:test";

import { calculateTaskAnalytics } from "../lib/task-analytics.ts";

const userId = "user-1";
const now = new Date(2026, 7, 27, 12, 0, 0);

test("calculates current and previous month task analytics without extra queries", () => {
  const analytics = calculateTaskAnalytics(
    [
      {
        status: "DONE",
        createdAt: new Date(2026, 7, 1),
        dueDate: null,
        assigneeId: userId,
      },
      {
        status: "IN_PROGRESS",
        createdAt: new Date(2026, 7, 2),
        dueDate: new Date(2026, 7, 20),
        assigneeId: null,
        assigneeGroup: { members: [{ userId }] },
      },
      {
        status: "TODO",
        createdAt: new Date(2026, 6, 15),
        dueDate: new Date(2026, 6, 20),
        assigneeId: null,
      },
    ],
    userId,
    now,
  );

  assert.deepEqual(analytics, {
    task_count: 2,
    task_diff: 1,
    assigned_task_count: 2,
    assigned_task_diff: 2,
    completed_task_count: 1,
    completed_task_diff: 1,
    incompleted_task_count: 1,
    incompleted_task_diff: 0,
    overdue_task_count: 1,
    overdue_task_diff: 0,
  });
});
