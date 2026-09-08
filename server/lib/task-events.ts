type TaskEventStreamMessage = {
  id?: string;
  event?: string;
  retry?: number;
  data: string;
};

type TaskEventStream = {
  push: (message: TaskEventStreamMessage) => Promise<void>;
  onClosed: (cb: () => void) => void;
};

export type TaskRealtimeEvent =
  | {
      type: "TASK_CREATED" | "TASK_UPDATED";
      workspaceId: string;
      task: unknown;
    }
  | {
      type: "TASK_DELETED";
      workspaceId: string;
      taskId: string;
      projectId: string;
    };

const globalState = globalThis as typeof globalThis & {
  __taskEventStreams?: Map<string, Map<string, { stream: TaskEventStream; userId: string; projectIds: Set<string> }>>;
};

function shouldDebug() {
  return process.env.REALTIME_DEBUG === "1";
}

function createClientId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getWorkspaceStreams(workspaceId: string) {
  if (!globalState.__taskEventStreams) {
    globalState.__taskEventStreams = new Map();
  }
  const allStreams = globalState.__taskEventStreams;
  const workspaceStreams = allStreams.get(workspaceId);
  if (workspaceStreams) return workspaceStreams;
  const created = new Map<string, { stream: TaskEventStream; userId: string; projectIds: Set<string> }>();
  allStreams.set(workspaceId, created);
  return created;
}

export function registerTaskEventStream(
  workspaceId: string,
  stream: TaskEventStream,
  userId: string,
  projectIds: ReadonlySet<string>,
) {
  const streams = getWorkspaceStreams(workspaceId);
  const id = createClientId();
  streams.set(id, { stream, userId, projectIds: new Set(projectIds) });
  if (shouldDebug()) {
    console.log("[realtime] stream registered", {
      workspaceId,
      connections: streams.size,
    });
  }

  const unregister = () => {
    streams.delete(id);
    if (streams.size === 0) {
      globalState.__taskEventStreams?.delete(workspaceId);
    }
    if (shouldDebug()) {
      console.log("[realtime] stream unregistered", {
        workspaceId,
        connections: streams.size,
      });
    }
  };

  stream.onClosed(unregister);

  return unregister;
}

export function refreshWorkspaceTaskStreamAccess(
  workspaceId: string,
  visibleByUserId: ReadonlyMap<string, ReadonlySet<string>>,
) {
  const streams = globalState.__taskEventStreams?.get(workspaceId);
  if (!streams) return;
  for (const connection of streams.values()) {
    connection.projectIds = new Set(visibleByUserId.get(connection.userId) ?? []);
  }
}

export function broadcastTaskEvent(workspaceId: string, payload: TaskRealtimeEvent) {
  const streams = globalState.__taskEventStreams?.get(workspaceId);
  if (shouldDebug()) {
    console.log("[realtime] broadcast", {
      workspaceId,
      type: payload.type,
      connections: streams?.size ?? 0,
    });
  }
  if (!streams?.size) return;

  const data = JSON.stringify(payload);
  const projectId = payload.type === "TASK_DELETED"
    ? payload.projectId
    : (payload.task as { project_id?: string }).project_id;
  for (const { stream, projectIds } of streams.values()) {
    if (!projectId || !projectIds.has(projectId)) continue;
    stream.push({ event: "task", data }).catch(() => {});
  }
}
