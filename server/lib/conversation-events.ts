type ConversationEventStreamMessage = {
  id?: string;
  event?: string;
  retry?: number;
  data: string;
};

type ConversationEventStream = {
  push: (message: ConversationEventStreamMessage) => Promise<void>;
  onClosed: (cb: () => void) => void;
};

export type ConversationRealtimeEvent =
  | {
      type: "MESSAGE_CREATED";
      conversationId: string;
      message: unknown;
    }
  | {
      type: "READ_UPDATED";
      conversationId: string;
      userId: string;
      lastReadAt: string;
    };

const globalState = globalThis as typeof globalThis & {
  __conversationEventStreams?: Map<string, Map<string, ConversationEventStream>>;
};

function shouldDebug() {
  return process.env.REALTIME_DEBUG === "1";
}

function createClientId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getConversationStreams(conversationId: string) {
  if (!globalState.__conversationEventStreams) {
    globalState.__conversationEventStreams = new Map();
  }
  const allStreams = globalState.__conversationEventStreams;
  const conversationStreams = allStreams.get(conversationId);
  if (conversationStreams) return conversationStreams;
  const created = new Map<string, ConversationEventStream>();
  allStreams.set(conversationId, created);
  return created;
}

export function registerConversationEventStream(
  conversationId: string,
  stream: ConversationEventStream,
) {
  const streams = getConversationStreams(conversationId);
  const id = createClientId();
  streams.set(id, stream);
  if (shouldDebug()) {
    console.log("[realtime] conversation stream registered", {
      conversationId,
      connections: streams.size,
    });
  }

  const unregister = () => {
    streams.delete(id);
    if (streams.size === 0) {
      globalState.__conversationEventStreams?.delete(conversationId);
    }
    if (shouldDebug()) {
      console.log("[realtime] conversation stream unregistered", {
        conversationId,
        connections: streams.size,
      });
    }
  };

  stream.onClosed(unregister);

  return unregister;
}

export function broadcastConversationEvent(
  conversationId: string,
  payload: ConversationRealtimeEvent,
) {
  const streams = globalState.__conversationEventStreams?.get(conversationId);
  if (shouldDebug()) {
    console.log("[realtime] conversation broadcast", {
      conversationId,
      type: payload.type,
      connections: streams?.size ?? 0,
    });
  }
  if (!streams?.size) return;

  const data = JSON.stringify(payload);
  for (const stream of streams.values()) {
    stream.push({ event: "conversation", data }).catch(() => {});
  }
}

