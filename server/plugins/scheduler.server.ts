import "~/server/cron";
import { startScheduler } from "~/server/lib/scheduler";

export default defineNitroPlugin(() => {
  startScheduler();
});
