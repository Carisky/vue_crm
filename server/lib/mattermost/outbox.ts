import type { MattermostEventKind, MattermostSyncResult } from "./contracts.ts";

export type MattermostOutboxState =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export type MattermostOutboxRecord = {
  id: string;
  kind: MattermostEventKind;
  aggregateType: string;
  aggregateId: string;
  idempotencyKey: string;
  payload: unknown;
  state: MattermostOutboxState;
  attempts: number;
  nextAttemptAt: Date;
  lockedAt: Date | null;
  lastError: string | null;
  completedAt: Date | null;
  createdAt: Date;
};

export type MattermostOutboxInsert = Pick<
  MattermostOutboxRecord,
  "kind" | "aggregateType" | "aggregateId" | "idempotencyKey" | "payload"
>;

export type MattermostOutboxRepository = {
  insert(input: MattermostOutboxInsert): Promise<MattermostOutboxRecord>;
  listIncomplete(): Promise<MattermostOutboxRecord[]>;
  tryLock(id: string, now: Date, staleBefore: Date): Promise<boolean>;
  complete(id: string, lockedAt: Date, now: Date): Promise<boolean>;
  retry(
    id: string,
    lockedAt: Date,
    nextAttemptAt: Date,
    message: string,
  ): Promise<boolean>;
  fail(id: string, lockedAt: Date, message: string): Promise<boolean>;
  isPaused(): Promise<boolean>;
  hasMessageLink(messageId: string): Promise<boolean>;
  claimBatch?(now: Date, batchSize: number): Promise<MattermostOutboxRecord[]>;
};

export async function enqueueMattermostEvent(
  input: MattermostOutboxInsert,
  repository: Pick<MattermostOutboxRepository, "insert">,
) {
  return repository.insert(input);
}

const BATCH_SIZE = 50;
const STALE_LOCK_MS = 10 * 60_000;
const MAX_ATTEMPTS = 12;

export async function claimMattermostEvents(
  repository: Pick<
    MattermostOutboxRepository,
    "listIncomplete" | "tryLock" | "claimBatch"
  >,
  options: { now?: Date; batchSize?: number } = {},
) {
  const now = options.now ?? new Date();
  if (repository.claimBatch) {
    return repository.claimBatch(now, options.batchSize ?? BATCH_SIZE);
  }
  const staleBefore = new Date(now.getTime() - STALE_LOCK_MS);
  const records = await repository.listIncomplete();
  records.sort(
    (left, right) =>
      left.createdAt.getTime() - right.createdAt.getTime() ||
      left.id.localeCompare(right.id),
  );

  const aggregateHeads = new Map<string, MattermostOutboxRecord>();
  for (const record of records) {
    const key = `${record.aggregateType}\u0000${record.aggregateId}`;
    if (!aggregateHeads.has(key)) aggregateHeads.set(key, record);
  }

  const claimed: MattermostOutboxRecord[] = [];
  for (const record of aggregateHeads.values()) {
    if (claimed.length >= (options.batchSize ?? BATCH_SIZE)) break;
    const due =
      (record.state === "PENDING" && record.nextAttemptAt <= now) ||
      (record.state === "PROCESSING" &&
        record.lockedAt !== null &&
        record.lockedAt <= staleBefore);
    const nextAttempt = record.attempts + 1;
    if (!due || !(await repository.tryLock(record.id, now, staleBefore))) continue;
    claimed.push({
      ...record,
      attempts: nextAttempt,
      state: "PROCESSING",
      lockedAt: now,
    });
  }
  return claimed;
}

export function computeMattermostRetry(
  attempt: number,
  random: () => number = Math.random,
) {
  const baseMs = Math.min(
    60 * 60_000,
    5_000 * 2 ** Math.max(0, attempt - 1),
  );
  return Math.round(baseMs * (0.75 + random() * 0.5));
}

function safeFailureMessage(message: string) {
  const firstLine = message.split(/\r?\n/, 1)[0]?.trim();
  return (firstLine || "Mattermost dispatch failed").slice(0, 500);
}

function thrownResult(error: unknown): MattermostSyncResult {
  if (
    typeof error === "object" &&
    error !== null &&
    "retryable" in error &&
    typeof error.retryable === "boolean"
  ) {
    return {
      ok: false,
      retryable: error.retryable,
      message: safeFailureMessage(
        error instanceof Error ? error.message : "Mattermost dispatch failed",
      ),
    };
  }
  return {
    ok: false,
    retryable: true,
    message: "Mattermost dispatch failed before a safe response",
  };
}

export async function processMattermostOutbox(input: {
  enabled: boolean;
  repository: MattermostOutboxRepository;
  dispatch(record: MattermostOutboxRecord): Promise<MattermostSyncResult>;
  now?: () => Date;
  random?: () => number;
}) {
  const empty = { claimed: 0, completed: 0, retried: 0, failed: 0 };
  if (!input.enabled || (await input.repository.isPaused())) return empty;

  const now = input.now?.() ?? new Date();
  const claimed = await claimMattermostEvents(input.repository, { now });
  const summary = { ...empty, claimed: claimed.length };

  for (const record of claimed) {
    const lockedAt = record.lockedAt as Date;
    let result: MattermostSyncResult;
    const messageId =
      record.kind === "message.create" &&
      typeof record.payload === "object" &&
      record.payload !== null &&
      "message_id" in record.payload &&
      typeof record.payload.message_id === "string"
        ? record.payload.message_id
        : null;
    if (messageId && (await input.repository.hasMessageLink(messageId))) {
      result = { ok: true };
    } else {
      try {
        result = await input.dispatch(record);
      } catch (error) {
        result = thrownResult(error);
      }
    }

    if (result.ok) {
      if (await input.repository.complete(record.id, lockedAt, now)) {
        summary.completed += 1;
      }
    } else if (result.retryable && record.attempts < MAX_ATTEMPTS) {
      const retryAt = new Date(
        now.getTime() + computeMattermostRetry(record.attempts, input.random),
      );
      if (
        await input.repository.retry(
          record.id,
          lockedAt,
          retryAt,
          safeFailureMessage(result.message),
        )
      ) {
        summary.retried += 1;
      }
    } else if (
      await input.repository.fail(
        record.id,
        lockedAt,
        safeFailureMessage(result.message),
      )
    ) {
      summary.failed += 1;
    }
  }
  return summary;
}

type PrismaLike = {
  mattermostOutboxEvent: {
    upsert(input: unknown): Promise<unknown>;
    findMany(input: unknown): Promise<unknown[]>;
    updateMany(input: unknown): Promise<{ count: number }>;
  };
  mattermostSyncControl: {
    findUnique(input: unknown): Promise<{ pausedAt: Date | null } | null>;
  };
  mattermostMessageLink: {
    findUnique(input: unknown): Promise<{ id: string } | null>;
  };
  $transaction?<T>(callback: (transaction: PrismaLike) => Promise<T>): Promise<T>;
};

function asRecord(value: unknown): MattermostOutboxRecord {
  return value as MattermostOutboxRecord;
}

export function createPrismaMattermostOutboxRepository(
  database: PrismaLike,
): MattermostOutboxRepository {
  const repository: MattermostOutboxRepository = {
    async insert(input) {
      return asRecord(
        await database.mattermostOutboxEvent.upsert({
          where: { idempotencyKey: input.idempotencyKey },
          create: input,
          update: {},
        }),
      );
    },
    async listIncomplete() {
      return (await database.mattermostOutboxEvent.findMany({
        where: { state: { in: ["PENDING", "PROCESSING"] } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      })).map(asRecord);
    },
    async tryLock(id, now, staleBefore) {
      const result = await database.mattermostOutboxEvent.updateMany({
        where: {
          id,
          OR: [
            { state: "PENDING" },
            { state: "PROCESSING", lockedAt: { lte: staleBefore } },
          ],
        },
        data: { state: "PROCESSING", lockedAt: now, attempts: { increment: 1 } },
      });
      return result.count === 1;
    },
    async complete(id, lockedAt, now) {
      const result = await database.mattermostOutboxEvent.updateMany({
        where: { id, state: "PROCESSING", lockedAt },
        data: {
          state: "COMPLETED",
          lockedAt: null,
          completedAt: now,
          lastError: null,
        },
      });
      return result.count === 1;
    },
    async retry(id, lockedAt, nextAttemptAt, message) {
      const result = await database.mattermostOutboxEvent.updateMany({
        where: { id, state: "PROCESSING", lockedAt },
        data: {
          state: "PENDING",
          lockedAt: null,
          nextAttemptAt,
          lastError: message,
        },
      });
      return result.count === 1;
    },
    async fail(id, lockedAt, message) {
      const result = await database.mattermostOutboxEvent.updateMany({
        where: { id, state: "PROCESSING", lockedAt },
        data: { state: "FAILED", lockedAt: null, lastError: message },
      });
      return result.count === 1;
    },
    async isPaused() {
      const control = await database.mattermostSyncControl.findUnique({
        where: { key: "global" },
        select: { pausedAt: true },
      });
      return control?.pausedAt !== null && control?.pausedAt !== undefined;
    },
    async hasMessageLink(messageId) {
      return Boolean(
        await database.mattermostMessageLink.findUnique({
          where: { messageId },
          select: { id: true },
        }),
      );
    },
  };
  if (database.$transaction) {
    repository.claimBatch = (now, batchSize) =>
      database.$transaction?.((transaction) =>
        claimMattermostEvents(
          createPrismaMattermostOutboxRepository(transaction),
          { now, batchSize },
        ),
      ) as Promise<MattermostOutboxRecord[]>;
  }
  return repository;
}

export async function processMattermostOutboxWithRuntime() {
  const [
    { default: prisma },
    { getMattermostConfig },
    { dispatchMattermostEvent, runtimeMattermostDispatchDependencies },
  ]
    = await Promise.all([
      import("../prisma.ts"),
      import("./client.ts"),
      import("./dispatch.ts"),
    ]);
  const config = getMattermostConfig();
  return processMattermostOutbox({
    enabled: config.enabled,
    repository: createPrismaMattermostOutboxRepository(prisma as PrismaLike),
    dispatch: (record) =>
      dispatchMattermostEvent(
        record,
        runtimeMattermostDispatchDependencies(prisma, config),
      ),
  });
}
