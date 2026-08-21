import { processEmailQueue } from "~/server/lib/email-queue";
import { Schedule } from "~/server/lib/scheduler";
import { removeExpiredEmailVerificationAccounts } from "~/server/lib/email-verification-cleanup";
import { removeExpiredPasswordResetTokens } from "~/server/lib/password-reset";
import { removeExpiredPendingMedia } from "~/server/lib/pending-media-cleanup";
import prisma from "~/server/lib/prisma";
import { getPrivateStorage } from "~/server/lib/storage";

export function registerCronJobs() {
  Schedule.call(() => processEmailQueue(), { name: "email-queue" }).everyMinutes(
    1,
  );

  Schedule.call(removeExpiredEmailVerificationAccounts, {
    name: "email-verification-cleanup",
  }).everyMinutes(1);

  Schedule.call(removeExpiredPasswordResetTokens, {
    name: "password-reset-cleanup",
  }).everyMinutes(5);

  Schedule.call(async () => { await removeExpiredPendingMedia({}, {
    media: { findExpiredPending: (input) => prisma.taskMedia.findMany({ where: { taskId: null, createdAt: { lt: input.before } }, take: input.take, select: { id: true, storageKey: true } }), deleteById: async (id) => { await prisma.taskMedia.delete({ where: { id } }); } },
    storage: getPrivateStorage().storage,
  }); }, { name: "pending-media-cleanup" }).hourly();
}
