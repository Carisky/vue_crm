import { endOfMonth, startOfMonth, subMonths } from "date-fns";

type AnalyticsTask = {
  status: string;
  createdAt: Date;
  dueDate: Date | null;
  assigneeId: string | null;
  assigneeGroup?: {
    members: Array<{ userId: string }>;
  } | null;
};

export type TaskAnalytics = {
  task_count: number;
  task_diff: number;
  assigned_task_count: number;
  assigned_task_diff: number;
  completed_task_count: number;
  completed_task_diff: number;
  incompleted_task_count: number;
  incompleted_task_diff: number;
  overdue_task_count: number;
  overdue_task_diff: number;
};

function isWithin(date: Date, start: Date, end: Date) {
  return date >= start && date <= end;
}

export function calculateTaskAnalytics(
  tasks: AnalyticsTask[],
  userId: string,
  now = new Date(),
): TaskAnalytics {
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);
  const lastMonth = subMonths(now, 1);
  const lastMonthStart = startOfMonth(lastMonth);
  const lastMonthEnd = endOfMonth(lastMonth);

  const thisMonthTasks = tasks.filter((task) =>
    isWithin(task.createdAt, thisMonthStart, thisMonthEnd),
  );
  const lastMonthTasks = tasks.filter((task) =>
    isWithin(task.createdAt, lastMonthStart, lastMonthEnd),
  );

  const isAssigned = (task: AnalyticsTask) =>
    task.assigneeId === userId ||
    Boolean(task.assigneeGroup?.members.some((member) => member.userId === userId));
  const isCompleted = (task: AnalyticsTask) => task.status === "DONE";
  const isOverdue = (task: AnalyticsTask) =>
    !isCompleted(task) && task.dueDate !== null && task.dueDate < now;

  const thisMonthAssignedTasks = thisMonthTasks.filter(isAssigned).length;
  const lastMonthAssignedTasks = lastMonthTasks.filter(isAssigned).length;
  const thisMonthCompletedTasks = thisMonthTasks.filter(isCompleted).length;
  const lastMonthCompletedTasks = lastMonthTasks.filter(isCompleted).length;
  const thisMonthOverdueTasks = thisMonthTasks.filter(isOverdue).length;
  const lastMonthOverdueTasks = lastMonthTasks.filter(isOverdue).length;
  const incompletedTaskCount = thisMonthTasks.length - thisMonthCompletedTasks;
  const lastMonthIncompletedTasks =
    lastMonthTasks.length - lastMonthCompletedTasks;

  return {
    task_count: thisMonthTasks.length,
    task_diff: thisMonthTasks.length - lastMonthTasks.length,
    assigned_task_count: thisMonthAssignedTasks,
    assigned_task_diff: thisMonthAssignedTasks - lastMonthAssignedTasks,
    completed_task_count: thisMonthCompletedTasks,
    completed_task_diff: thisMonthCompletedTasks - lastMonthCompletedTasks,
    incompleted_task_count: incompletedTaskCount,
    incompleted_task_diff:
      incompletedTaskCount - lastMonthIncompletedTasks,
    overdue_task_count: thisMonthOverdueTasks,
    overdue_task_diff: thisMonthOverdueTasks - lastMonthOverdueTasks,
  };
}
