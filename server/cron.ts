import { processEmailQueue } from "~/server/lib/email-queue";
import { Schedule } from "~/server/lib/scheduler";
import { removeExpiredEmailVerificationAccounts } from "~/server/lib/email-verification-cleanup";
import { removeExpiredPasswordResetTokens } from "~/server/lib/password-reset";

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
}
