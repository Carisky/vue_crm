import assert from "node:assert/strict";
import test from "node:test";
import { removeExpiredEmailVerificationAccounts } from "../server/lib/email-verification-cleanup.ts";

test("expired unverified account queues deactivation before user deletion", async () => {
  const log: unknown[] = [];
  const database = {
    emailVerificationToken: {
      findMany: async () => [{ userId: "user-1" }],
      deleteMany: async () => {
        log.push("verification.delete");
      },
    },
    emailQueue: {
      deleteMany: async () => {
        log.push("email.delete");
      },
    },
    user: {
      findFirst: async () => ({
        id: "user-1",
        mattermostLink: { mattermostUserId: "remote-user-1" },
      }),
      delete: async () => {
        log.push("user.delete");
      },
    },
    mattermostOutboxEvent: {
      updateMany: async () => ({ count: 0 }),
      upsert: async (input: unknown) => {
        log.push(["outbox", input]);
        return input;
      },
    },
    $transaction: async (callback: (transaction: unknown) => Promise<void>) =>
      callback(database),
  };

  await removeExpiredEmailVerificationAccounts(
    database as unknown as NonNullable<
      Parameters<typeof removeExpiredEmailVerificationAccounts>[0]
    >,
  );

  const outboxIndex = log.findIndex(
    (entry) => Array.isArray(entry) && entry[0] === "outbox",
  );
  const deleteIndex = log.indexOf("user.delete");
  assert.ok(outboxIndex >= 0 && outboxIndex < deleteIndex);
  const write = (log[outboxIndex] as [string, { create: { payload: unknown } }])[1];
  assert.deepEqual(write.create.payload, {
    user_id: "user-1",
    mattermost_user_id: "remote-user-1",
  });
  assert.doesNotMatch(JSON.stringify(log), /password/i);
});

test("verified account found during cleanup is not deleted or deactivated", async () => {
  let writes = 0;
  const database = {
    emailVerificationToken: { findMany: async () => [{ userId: "user-1" }] },
    user: { findFirst: async () => null },
    $transaction: async (callback: (transaction: unknown) => Promise<void>) =>
      callback(database),
    mattermostOutboxEvent: {
      updateMany: async () => ({ count: 0 }),
      upsert: async () => {
        writes += 1;
      },
    },
  };
  await removeExpiredEmailVerificationAccounts(
    database as unknown as NonNullable<
      Parameters<typeof removeExpiredEmailVerificationAccounts>[0]
    >,
  );
  assert.equal(writes, 0);
});
