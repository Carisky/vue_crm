import { enqueueUserDeactivate } from "./mattermost/domain-events.ts";

type CleanupTransaction = {
  emailQueue: { deleteMany(input: unknown): Promise<unknown> };
  emailVerificationToken: { deleteMany(input: unknown): Promise<unknown> };
  user: {
    findFirst(input: unknown): Promise<{
      id: string;
      mattermostLink: { mattermostUserId: string | null } | null;
    } | null>;
    delete(input: unknown): Promise<unknown>;
  };
  mattermostOutboxEvent: {
    updateMany(input: unknown): Promise<{ count: number }>;
    upsert(input: unknown): Promise<unknown>;
  };
};

type CleanupDatabase = {
  emailVerificationToken: {
    findMany(input: unknown): Promise<Array<{ userId: string }>>;
  };
  $transaction(
    callback: (transaction: CleanupTransaction) => Promise<void>,
  ): Promise<unknown>;
};

export async function removeExpiredEmailVerificationAccounts(
  injectedDatabase?: CleanupDatabase,
) {
  const database =
    injectedDatabase ??
    ((await import("./prisma.ts")).default as unknown as CleanupDatabase);
  const expired = await database.emailVerificationToken.findMany({
    where: { expiresAt: { lte: new Date() } },
    select: { userId: true },
  });

  for (const item of expired) {
    await database.$transaction(async (transaction) => {
      const user = await transaction.user.findFirst({
        where: { id: item.userId, emailVerifiedAt: null },
        select: {
          id: true,
          mattermostLink: { select: { mattermostUserId: true } },
        },
      });
      if (!user) return;

      await transaction.emailQueue.deleteMany({ where: { userId: item.userId } });
      await transaction.emailVerificationToken.deleteMany({
        where: { userId: item.userId },
      });
      if (user.mattermostLink?.mattermostUserId) {
        await enqueueUserDeactivate(transaction, {
          userId: user.id,
          mattermostUserId: user.mattermostLink.mattermostUserId,
        });
      }
      await transaction.user.delete({ where: { id: user.id } });
    });
  }
}
