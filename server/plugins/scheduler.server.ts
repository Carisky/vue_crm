import { registerCronJobs } from "~/server/cron";
import { startScheduler } from "~/server/lib/scheduler";

export default defineNitroPlugin(() => {
  registerCronJobs();
  startScheduler();
});
