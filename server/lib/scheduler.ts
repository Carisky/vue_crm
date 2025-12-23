type TaskHandler = () => void | Promise<void>;

type ScheduleOptions = {
  name?: string;
};

type TaskEntry = {
  name?: string;
  handler: TaskHandler;
  type: "interval" | "daily" | "weekly" | "hourly";
  intervalMinutes?: number;
  atTime?: { hour: number; minute: number };
  nextRunAt: number;
};

const TICK_INTERVAL_MS = 60 * 1000;

const globalState = globalThis as typeof globalThis & {
  __schedulerTasks?: TaskEntry[];
  __schedulerStarted?: boolean;
  __schedulerInterval?: NodeJS.Timeout;
  __schedulerRunning?: boolean;
};

function getTasks() {
  if (!globalState.__schedulerTasks) {
    globalState.__schedulerTasks = [];
  }
  return globalState.__schedulerTasks;
}

function getNextDailyRun(now: Date, atTime?: { hour: number; minute: number }) {
  const next = new Date(now);
  next.setHours(atTime?.hour ?? 0, atTime?.minute ?? 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime();
}

function getNextWeeklyRun(now: Date, atTime?: { hour: number; minute: number }) {
  const next = new Date(now);
  const day = next.getDay();
  const daysUntilMonday = (8 - day) % 7 || 7;
  next.setDate(next.getDate() + daysUntilMonday);
  next.setHours(atTime?.hour ?? 0, atTime?.minute ?? 0, 0, 0);
  return next.getTime();
}

function getNextHourlyRun(now: Date, atTime?: { hour: number; minute: number }) {
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setMinutes(atTime?.minute ?? 0);
  if (next.getTime() <= now.getTime()) {
    next.setHours(next.getHours() + 1);
  }
  return next.getTime();
}

function parseAt(value: string) {
  const parts = value.split(":").map((part) => Number(part));
  if (parts.length !== 2 || parts.some((num) => Number.isNaN(num))) {
    throw new Error("Invalid time format. Use HH:MM.");
  }
  const [hour, minute] = parts;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error("Invalid time value. Use HH:MM within 00:00-23:59.");
  }
  return { hour, minute };
}

function computeNextRun(entry: Omit<TaskEntry, "nextRunAt">) {
  const now = new Date();
  if (entry.type === "interval") {
    const minutes = entry.intervalMinutes ?? 1;
    return Date.now() + minutes * 60 * 1000;
  }
  if (entry.type === "hourly") return getNextHourlyRun(now, entry.atTime);
  if (entry.type === "weekly") return getNextWeeklyRun(now, entry.atTime);
  return getNextDailyRun(now, entry.atTime);
}

function registerTask(entry: Omit<TaskEntry, "nextRunAt">) {
  const tasks = getTasks();
  if (entry.name) {
    const existingIndex = tasks.findIndex((task) => task.name === entry.name);
    if (existingIndex !== -1) {
      tasks.splice(existingIndex, 1);
    }
  }
  tasks.push({ ...entry, nextRunAt: computeNextRun(entry) });
}

class TaskBuilder {
  private handler: TaskHandler;
  private options?: ScheduleOptions;
  private scheduleType?: TaskEntry["type"];
  private intervalMinutes?: number;
  private atTime?: { hour: number; minute: number };

  constructor(handler: TaskHandler, options?: ScheduleOptions) {
    this.handler = handler;
    this.options = options;
  }

  everyMinutes(minutes: number) {
    this.scheduleType = "interval";
    this.intervalMinutes = Math.max(1, Math.floor(minutes));
    registerTask({
      name: this.options?.name,
      handler: this.handler,
      type: "interval",
      intervalMinutes: this.intervalMinutes,
      atTime: this.atTime,
    });
    return this;
  }

  hourly() {
    this.scheduleType = "hourly";
    registerTask({
      name: this.options?.name,
      handler: this.handler,
      type: "hourly",
      atTime: this.atTime,
    });
    return this;
  }

  daily() {
    this.scheduleType = "daily";
    registerTask({
      name: this.options?.name,
      handler: this.handler,
      type: "daily",
      atTime: this.atTime,
    });
    return this;
  }

  weekly() {
    this.scheduleType = "weekly";
    registerTask({
      name: this.options?.name,
      handler: this.handler,
      type: "weekly",
      atTime: this.atTime,
    });
    return this;
  }

  at(value: string) {
    this.atTime = parseAt(value);

    if (this.scheduleType) {
      registerTask({
        name: this.options?.name,
        handler: this.handler,
        type: this.scheduleType,
        intervalMinutes: this.intervalMinutes,
        atTime: this.atTime,
      });
    }
    return this;
  }
}

export const Schedule = {
  call(handler: TaskHandler, options?: ScheduleOptions) {
    return new TaskBuilder(handler, options);
  },
};

export function startScheduler() {
  if (globalState.__schedulerStarted) return;
  globalState.__schedulerStarted = true;

  const tick = async () => {
    if (globalState.__schedulerRunning) return;
    globalState.__schedulerRunning = true;

    const tasks = getTasks();
    const now = Date.now();
    const dueTasks = tasks
      .filter((task) => task.nextRunAt <= now)
      .sort((a, b) => a.nextRunAt - b.nextRunAt);

    for (const task of dueTasks) {
      try {
        await task.handler();
      } catch (error) {
        console.error("Scheduled task failed", {
          name: task.name ?? "unnamed",
          error,
        });
      } finally {
        task.nextRunAt = computeNextRun(task);
      }
    }

    globalState.__schedulerRunning = false;
  };

  tick();
  globalState.__schedulerInterval = setInterval(tick, TICK_INTERVAL_MS);
}
