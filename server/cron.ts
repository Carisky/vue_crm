import { processEmailQueue } from "~/server/lib/email-queue";
import { Schedule } from "~/server/lib/scheduler";
import { removeExpiredEmailVerificationAccounts } from "~/server/lib/email-verification-cleanup";

Schedule.call(() => processEmailQueue(), { name: "email-queue" }).everyMinutes(
  1,
);

Schedule.call(removeExpiredEmailVerificationAccounts, {
  name: "email-verification-cleanup",
}).everyMinutes(1);
