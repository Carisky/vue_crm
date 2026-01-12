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
    };

const globalState = globalThis as typeof globalThis & {
  __taskEventStreams?: Map<string, Map<string, TaskEventStream>>;
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
  const created = new Map<string, TaskEventStream>();
  allStreams.set(workspaceId, created);
  return created;
}

export function registerTaskEventStream(
  workspaceId: string,
  stream: TaskEventStream,
) {
  const streams = getWorkspaceStreams(workspaceId);
  const id = createClientId();
  streams.set(id, stream);
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
  for (const stream of streams.values()) {
    stream.push({ event: "task", data }).catch(() => {});
  }
}
