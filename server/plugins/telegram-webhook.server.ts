import {
  configureTelegramMiniAppMenu,
  configureTelegramWebhook,
  getTelegramConfig,
} from "~/server/lib/telegram";

export default defineNitroPlugin(async () => {
  if (process.env.TELEGRAM_AUTO_SETUP_WEBHOOK !== "true") return;

  const config = getTelegramConfig();
  if (!config.botToken || !config.webhookSecret || !config.siteUrl) {
    console.warn(
      "[telegram] webhook setup skipped: Telegram environment variables are incomplete",
    );
    return;
  }

  try {
    await configureTelegramWebhook();
    await configureTelegramMiniAppMenu();
    console.info("[telegram] webhook and Mini App menu configured");
  } catch (error) {
    console.error("[telegram] webhook setup failed", error);
  }
});
