import assert from "node:assert/strict";
import test from "node:test";
import type { MattermostClient } from "../server/lib/mattermost/client.ts";
import {
  dispatchMattermostEvent,
  type MattermostDispatchStore,
} from "../server/lib/mattermost/dispatch.ts";
import {
  claimMattermostEvents,
  computeMattermostRetry,
  enqueueMattermostEvent,
  processMattermostOutbox,
  type MattermostOutboxRecord,
  type MattermostOutboxRepository,
} from "../server/lib/mattermost/outbox.ts";

function event(
  input: Partial<MattermostOutboxRecord> &
    Pick<MattermostOutboxRecord, "id" | "idempotencyKey">,
): MattermostOutboxRecord {
  return {
    id: input.id,
    kind: input.kind ?? "workspace.upsert",
    aggregateType: input.aggregateType ?? "workspace",
    aggregateId: input.aggregateId ?? "workspace-1",
    idempotencyKey: input.idempotencyKey,
    payload: input.payload ?? {},
    state: input.state ?? "PENDING",
    attempts: input.attempts ?? 0,
    nextAttemptAt: input.nextAttemptAt ?? new Date(0),
    lockedAt: input.lockedAt ?? null,
    lastError: input.lastError ?? null,
    completedAt: input.completedAt ?? null,
    createdAt: input.createdAt ?? new Date(0),
  };
}

class MemoryRepository implements MattermostOutboxRepository {
  records: MattermostOutboxRecord[] = [];
  paused = false;
  linkedMessages = new Set<string>();
  private sequence = 0;

  async insert(input: Parameters<MattermostOutboxRepository["insert"]>[0]) {
    const duplicate = this.records.find(
      (record) => record.idempotencyKey === input.idempotencyKey,
    );
    if (duplicate) return duplicate;
    const created = event({
      ...input,
      id: `event-${++this.sequence}`,
      createdAt: new Date(this.sequence),
    });
    this.records.push(created);
    return created;
  }

  async listIncomplete() {
    return this.records.filter((record) =>
      record.state === "PENDING" || record.state === "PROCESSING",
    );
  }

  async tryLock(id: string, now: Date, staleBefore: Date) {
    const record = this.records.find((candidate) => candidate.id === id);
    if (!record) return false;
    const lockable =
      record.state === "PENDING" ||
      (record.state === "PROCESSING" &&
        record.lockedAt !== null &&
        record.lockedAt <= staleBefore);
    if (!lockable) return false;
    record.state = "PROCESSING";
    record.lockedAt = now;
    record.attempts += 1;
    return true;
  }

  async complete(id: string, lockedAt: Date, now: Date) {
    const record = this.locked(id, lockedAt);
    if (!record) return false;
    record.state = "COMPLETED";
    record.lockedAt = null;
    record.completedAt = now;
    record.lastError = null;
    return true;
  }

  async retry(id: string, lockedAt: Date, nextAttemptAt: Date, message: string) {
    const record = this.locked(id, lockedAt);
    if (!record) return false;
    record.state = "PENDING";
    record.lockedAt = null;
    record.nextAttemptAt = nextAttemptAt;
    record.lastError = message;
    return true;
  }

  async fail(id: string, lockedAt: Date, message: string) {
    const record = this.locked(id, lockedAt);
    if (!record) return false;
    record.state = "FAILED";
    record.lockedAt = null;
    record.lastError = message;
    return true;
  }

  async isPaused() {
    return this.paused;
  }

  async hasMessageLink(messageId: string) {
    return this.linkedMessages.has(messageId);
  }

  private locked(id: string, lockedAt: Date) {
    return this.records.find(
      (record) =>
        record.id === id &&
        record.state === "PROCESSING" &&
        record.lockedAt?.getTime() === lockedAt.getTime(),
    );
  }
}

test("duplicate idempotency keys insert one outbox event", async () => {
  const repository = new MemoryRepository();
  const input = {
    kind: "workspace.upsert" as const,
    aggregateType: "workspace",
    aggregateId: "workspace-1",
    idempotencyKey: "workspace.upsert:workspace-1:1",
    payload: { workspace_id: "workspace-1" },
  };

  const first = await enqueueMattermostEvent(input, repository);
  const duplicate = await enqueueMattermostEvent(input, repository);

  assert.equal(first.id, duplicate.id);
  assert.equal(repository.records.length, 1);
});

test("claim preserves aggregate order and reclaims a ten-minute stale lock", async () => {
  const repository = new MemoryRepository();
  const now = new Date("2026-09-04T12:00:00.000Z");
  repository.records.push(
    event({
      id: "older-not-due",
      idempotencyKey: "older",
      createdAt: new Date(1),
      nextAttemptAt: new Date(now.getTime() + 1_000),
    }),
    event({
      id: "must-not-overtake",
      idempotencyKey: "newer",
      createdAt: new Date(2),
    }),
    event({
      id: "stale",
      idempotencyKey: "stale",
      aggregateId: "workspace-2",
      state: "PROCESSING",
      lockedAt: new Date(now.getTime() - 10 * 60_000 - 1),
    }),
    event({
      id: "fresh-lock",
      idempotencyKey: "fresh-lock",
      aggregateId: "workspace-3",
      state: "PROCESSING",
      lockedAt: new Date(now.getTime() - 9 * 60_000),
    }),
  );

  const claimed = await claimMattermostEvents(repository, { now });

  assert.deepEqual(claimed.map(({ id }) => id), ["stale"]);
  assert.equal(repository.records[2]?.attempts, 1);
});

test("worker retries retryable failures, terminally fails others, and completes success", async () => {
  const repository = new MemoryRepository();
  repository.records.push(
    event({ id: "ok", idempotencyKey: "ok", aggregateId: "ok" }),
    event({ id: "retry", idempotencyKey: "retry", aggregateId: "retry" }),
    event({ id: "terminal", idempotencyKey: "terminal", aggregateId: "terminal" }),
  );
  const now = new Date("2026-09-04T12:00:00.000Z");

  const result = await processMattermostOutbox({
    enabled: true,
    repository,
    now: () => now,
    random: () => 0.5,
    dispatch: async (record) => {
      if (record.id === "retry") {
        return { ok: false, retryable: true, message: "HTTP 503" };
      }
      if (record.id === "terminal") {
        return { ok: false, retryable: false, message: "HTTP 403" };
      }
      return { ok: true };
    },
  });

  assert.deepEqual(result, { claimed: 3, completed: 1, retried: 1, failed: 1 });
  assert.equal(repository.records[0]?.state, "COMPLETED");
  assert.equal(repository.records[0]?.completedAt?.getTime(), now.getTime());
  assert.equal(repository.records[1]?.state, "PENDING");
  assert.equal(
    repository.records[1]?.nextAttemptAt.getTime(),
    now.getTime() + 5_000,
  );
  assert.equal(repository.records[2]?.state, "FAILED");
});

test("twelfth retryable attempt is terminal", async () => {
  const repository = new MemoryRepository();
  repository.records.push(
    event({ id: "event-1", idempotencyKey: "event-1", attempts: 11 }),
  );
  await processMattermostOutbox({
    enabled: true,
    repository,
    random: () => 0.5,
    dispatch: async () => ({ ok: false, retryable: true, message: "timeout" }),
  });
  assert.equal(repository.records[0]?.attempts, 12);
  assert.equal(repository.records[0]?.state, "FAILED");
});

test("existing message link completes without a remote call", async () => {
  const repository = new MemoryRepository();
  repository.records.push(
    event({
      id: "message-event",
      idempotencyKey: "message.create:message-1",
      kind: "message.create",
      aggregateType: "message",
      aggregateId: "message-1",
      payload: { message_id: "message-1" },
    }),
  );
  repository.linkedMessages.add("message-1");
  let dispatches = 0;

  await processMattermostOutbox({
    enabled: true,
    repository,
    dispatch: async () => {
      dispatches += 1;
      return { ok: true };
    },
  });

  assert.equal(dispatches, 0);
  assert.equal(repository.records[0]?.state, "COMPLETED");
});

test("persisted pause and disabled configuration prevent claims", async () => {
  for (const enabled of [true, false]) {
    const repository = new MemoryRepository();
    repository.paused = enabled;
    repository.records.push(event({ id: "event-1", idempotencyKey: "event-1" }));
    const result = await processMattermostOutbox({
      enabled,
      repository,
      dispatch: async () => ({ ok: true }),
    });
    assert.equal(result.claimed, 0);
    assert.equal(repository.records[0]?.state, "PENDING");
  }
});

test("retry backoff is bounded and jittered", () => {
  assert.equal(computeMattermostRetry(1, () => 0), 3_750);
  assert.equal(computeMattermostRetry(1, () => 1), 6_250);
  assert.equal(computeMattermostRetry(99, () => 0.5), 60 * 60_000);
});

test("workspace dispatch recovers an ambiguous remote create by deterministic name", async () => {
  const calls: unknown[] = [];
  let lookups = 0;
  const client = {
    getTeamByName: async (name: string) => {
      calls.push(["lookup", name]);
      lookups += 1;
      return lookups === 1
        ? null
        : { id: "team-1", name, display_name: "Dispatch" };
    },
    createTeam: async () => {
      throw Object.assign(new Error("timeout"), { retryable: true });
    },
  } as unknown as MattermostClient;
  const store = {
    loadWorkspace: async () => ({
      id: "workspace-ABCDEF123456",
      name: "Dispatch",
      mattermostTeamId: null,
    }),
    saveWorkspaceLink: async (input: unknown) => {
      calls.push(["save", input]);
    },
  } as unknown as MattermostDispatchStore;

  const result = await dispatchMattermostEvent(
    event({
      id: "event-1",
      idempotencyKey: "workspace.upsert:1",
      payload: { workspace_id: "workspace-ABCDEF123456" },
    }),
    { client, store },
  );

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, [
    ["lookup", "dispatch-abcdef1234"],
    ["lookup", "dispatch-abcdef1234"],
    [
      "save",
      {
        workspaceId: "workspace-ABCDEF123456",
        mattermostTeamId: "team-1",
        teamName: "dispatch-abcdef1234",
      },
    ],
  ]);
});

test("private conversation dispatch applies exact linked membership", async () => {
  const calls: unknown[] = [];
  const client = {
    getChannelByName: async () => ({
      id: "channel-1",
      team_id: "team-1",
      name: "ops-abcdef1234",
      display_name: "Ops",
      type: "P",
    }),
    listChannelMembers: async () => [
      { channel_id: "channel-1", user_id: "remote-extra", roles: "channel_user" },
      { channel_id: "channel-1", user_id: "remote-1", roles: "channel_user" },
    ],
    addChannelMember: async (channelId: string, userId: string) => {
      calls.push(["add", channelId, userId]);
    },
    removeChannelMember: async (channelId: string, userId: string) => {
      calls.push(["remove", channelId, userId]);
    },
  } as unknown as MattermostClient;
  const store = {
    loadConversation: async () => ({
      id: "conversation-ABCDEF123456",
      type: "GROUP" as const,
      name: "Ops",
      workspaceId: "workspace-1",
      mattermostTeamId: "team-1",
      mattermostChannelId: "channel-1",
      participants: [
        { userId: "user-1", mattermostUserId: "remote-1" },
        { userId: "user-2", mattermostUserId: "remote-2" },
      ],
    }),
    saveConversationLink: async (input: unknown) => {
      calls.push(["save", input]);
    },
  } as unknown as MattermostDispatchStore;

  const result = await dispatchMattermostEvent(
    event({
      id: "event-1",
      idempotencyKey: "conversation.upsert:1",
      kind: "conversation.upsert",
      payload: { conversation_id: "conversation-ABCDEF123456" },
    }),
    { client, store },
  );

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, [
    ["add", "channel-1", "remote-2"],
    ["remove", "channel-1", "remote-extra"],
    [
      "save",
      {
        conversationId: "conversation-ABCDEF123456",
        mattermostChannelId: "channel-1",
        channelName: "ops-abcdef1234",
      },
    ],
  ]);
});

test("dispatch covers membership, delete, message, and account events", async () => {
  const calls: unknown[] = [];
  const client = new Proxy(
    {},
    {
      get: (_target, method: string) => async (...args: unknown[]) => {
        calls.push([method, ...args]);
        if (method === "createManagedPost") return { id: "post-1" };
      },
    },
  ) as unknown as MattermostClient;
  const store = {
    loadMembership: async () => ({
      role: "ADMIN" as const,
      user: { userId: "user-1", mattermostUserId: "remote-user-1" },
      mattermostTeamId: "team-1",
    }),
    loadMessage: async () => ({
      id: "message-1",
      body: "hello",
      mattermostChannelId: "channel-1",
      mattermostUserId: "remote-user-1",
    }),
    saveMessageLink: async (input: unknown) => {
      calls.push(["saveMessageLink", input]);
    },
    loadUserLink: async (userId: string) =>
      userId === "deleted-user"
        ? null
        : { userId, mattermostUserId: "remote-user-1" },
  } as unknown as MattermostDispatchStore;
  const records = [
    event({
      id: "membership-upsert",
      idempotencyKey: "membership-upsert",
      kind: "membership.upsert",
      payload: { workspace_id: "workspace-1", user_id: "user-1" },
    }),
    event({
      id: "membership-delete",
      idempotencyKey: "membership-delete",
      kind: "membership.delete",
      payload: { mattermost_team_id: "team-1", mattermost_user_id: "remote-user-1" },
    }),
    event({
      id: "workspace-delete",
      idempotencyKey: "workspace-delete",
      kind: "workspace.delete",
      payload: { mattermost_team_id: "team-1" },
    }),
    event({
      id: "conversation-delete",
      idempotencyKey: "conversation-delete",
      kind: "conversation.delete",
      payload: { mattermost_channel_id: "channel-1" },
    }),
    event({
      id: "message-create",
      idempotencyKey: "message.create:message-1",
      kind: "message.create",
      payload: { message_id: "message-1" },
    }),
    event({
      id: "activate",
      idempotencyKey: "activate",
      kind: "user.activate",
      payload: { user_id: "user-1" },
    }),
    event({
      id: "deactivate",
      idempotencyKey: "deactivate",
      kind: "user.deactivate",
      payload: { user_id: "user-1" },
    }),
    event({
      id: "deleted-user-deactivate",
      idempotencyKey: "deleted-user-deactivate",
      kind: "user.deactivate",
      payload: {
        user_id: "deleted-user",
        mattermost_user_id: "remote-deleted-user",
      },
    }),
  ];

  for (const record of records) {
    assert.deepEqual(await dispatchMattermostEvent(record, { client, store }), {
      ok: true,
    });
  }

  assert.deepEqual(calls, [
    ["addTeamMember", "team-1", "remote-user-1"],
    ["updateTeamMemberRoles", "team-1", "remote-user-1", "team_user team_admin"],
    ["removeTeamMember", "team-1", "remote-user-1"],
    ["deleteTeam", "team-1"],
    ["deleteChannel", "channel-1"],
    [
      "createManagedPost",
      {
        event_id: "message.create:message-1",
        crm_message_id: "message-1",
        mattermost_channel_id: "channel-1",
        mattermost_user_id: "remote-user-1",
        message: "hello",
      },
    ],
    ["saveMessageLink", { messageId: "message-1", mattermostPostId: "post-1" }],
    ["setUserActive", "remote-user-1", true],
    ["setUserActive", "remote-user-1", false],
    ["setUserActive", "remote-deleted-user", false],
  ]);
});
