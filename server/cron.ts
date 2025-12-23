import { processEmailQueue } from "~/server/lib/email-queue";
import { Schedule } from "~/server/lib/scheduler";

Schedule.call(() => processEmailQueue(), { name: "email-queue" }).everyMinutes(
  5,
);
