import { processEmailQueue } from "~/server/lib/email-queue";

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const globalState = globalThis as typeof globalThis & {
  __emailQueueInterval?: NodeJS.Timeout;
};

export default defineNitroPlugin(() => {
  if (globalState.__emailQueueInterval) return;

  const run = async () => {
    try {
      await processEmailQueue();
    } catch (error) {
      console.error("Email queue processing failed", error);
    }
  };

  run();
  globalState.__emailQueueInterval = setInterval(run, FIVE_MINUTES_MS);
});
