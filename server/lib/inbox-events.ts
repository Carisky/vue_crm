type InboxEventStreamMessage = {
  id?: string;
  event?: string;
  retry?: number;
  data: string;
};

type InboxEventStream = {
  push: (message: InboxEventStreamMessage) => Promise<void>;
  onClosed: (cb: () => void) => void;
};

export type InboxRealtimeEvent =
  | { type: "INBOX_UPDATED"; workspaceId: string }
  | { type: "MENTION_CREATED"; workspaceId: string; taskId: string; actorId: string | null }
  | { type: "MESSAGE_CREATED"; workspaceId: string; conversationId: string; senderId: string };

const globalState = globalThis as typeof globalThis & {
  __inboxEventStreams?: Map<string, Map<string, InboxEventStream>>;
};

function shouldDebug() {
  return process.env.REALTIME_DEBUG === "1";
}

function createClientId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getWorkspaceStreams(workspaceId: string) {
  if (!globalState.__inboxEventStreams) {
    globalState.__inboxEventStreams = new Map();
  }
  const allStreams = globalState.__inboxEventStreams;
  const workspaceStreams = allStreams.get(workspaceId);
  if (workspaceStreams) return workspaceStreams;
  const created = new Map<string, InboxEventStream>();
  allStreams.set(workspaceId, created);
  return created;
}

export function registerInboxEventStream(
  workspaceId: string,
  stream: InboxEventStream,
) {
  const streams = getWorkspaceStreams(workspaceId);
  const id = createClientId();
  streams.set(id, stream);

  if (shouldDebug()) {
    console.log("[realtime] inbox stream registered", {
      workspaceId,
      connections: streams.size,
    });
  }

  const unregister = () => {
    streams.delete(id);
    if (streams.size === 0) {
      globalState.__inboxEventStreams?.delete(workspaceId);
    }
    if (shouldDebug()) {
      console.log("[realtime] inbox stream unregistered", {
        workspaceId,
        connections: streams.size,
      });
    }
  };

  stream.onClosed(unregister);

  return unregister;
}

export function broadcastInboxEvent(workspaceId: string, payload: InboxRealtimeEvent) {
  const streams = globalState.__inboxEventStreams?.get(workspaceId);
  if (shouldDebug()) {
    console.log("[realtime] inbox broadcast", {
      workspaceId,
      type: payload.type,
      connections: streams?.size ?? 0,
    });
  }
  if (!streams?.size) return;

  const data = JSON.stringify(payload);
  for (const stream of streams.values()) {
    stream.push({ event: "inbox", data }).catch(() => {});
  }
}

