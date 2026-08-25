import assert from "node:assert/strict";
import test from "node:test";

import {
  broadcastConversationEvent,
  registerConversationEventStream,
  revokeConversationAccess,
} from "../server/lib/conversation-events.ts";

test("closes realtime streams when group chat access is revoked", async () => {
  const events: string[] = [];
  let closed = 0;
  const stream = {
    async push(message: { event?: string }) {
      events.push(message.event ?? "message");
    },
    onClosed() {},
    async close() {
      closed += 1;
    },
  };

  registerConversationEventStream("conversation-revoke-test", "user-1", stream);
  await revokeConversationAccess("conversation-revoke-test", ["user-1"]);
  broadcastConversationEvent("conversation-revoke-test", {
    type: "MESSAGE_CREATED",
    conversationId: "conversation-revoke-test",
    message: {},
  });

  assert.deepEqual(events, ["access-revoked"]);
  assert.equal(closed, 1);
});
