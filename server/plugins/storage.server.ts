import { initializePrivateStorage } from "~/server/lib/storage";

export default defineNitroPlugin(async () => {
  await initializePrivateStorage();
});
