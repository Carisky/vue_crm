import assert from "node:assert/strict";
import test from "node:test";

test("unsubscribe removes the exact task subscriber that was registered", async () => {
  const subscriberList = await import("../lib/subscriber-list.ts").catch(
    () => null,
  );
  assert.ok(subscriberList, "subscriber list helper must be defined");

  const subscribers: Array<((value: string) => void) | null> = [];
  const calls: string[] = [];
  const unsubscribeFirst = subscriberList.subscribeToList(subscribers, () => {
    calls.push("first");
  });
  subscriberList.subscribeToList(subscribers, () => {
    calls.push("second");
  });

  unsubscribeFirst();
  subscribers.forEach((subscriber) => subscriber?.("event"));

  assert.deepEqual(calls, ["second"]);
  assert.equal(subscribers[0], null);
  assert.equal(typeof subscribers[1], "function");
});
