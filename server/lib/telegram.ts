type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

type TelegramSendMessageResult = {
  message_id: number;
};

export class TelegramApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramApiError";
  }
}

export type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
};

export type TelegramMessage = {
  message_id: number;
  text?: string;
  from?: TelegramUser;
  chat: {
    id: number;
    type: string;
  };
};

export type TelegramUpdatePayload = {
  update_id: number;
  message?: TelegramMessage;
};

export function getTelegramConfig() {
  return {
    botToken: process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "",
    botUsername: (process.env.TELEGRAM_BOT_USERNAME?.trim() ?? "").replace(
      /^@/,
      "",
    ),
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "",
    siteUrl: (process.env.PUBLIC_SITE_URL?.trim() ?? "").replace(/\/$/, ""),
  };
}

export function isTelegramConfigured() {
  const config = getTelegramConfig();
  return Boolean(
    config.botToken &&
      config.botUsername &&
      config.webhookSecret &&
      config.siteUrl,
  );
}

async function callTelegramApi<T>(
  method: string,
  body: Record<string, unknown>,
) {
  const { botToken } = getTelegramConfig();
  if (!botToken) {
    throw new TelegramApiError("TELEGRAM_BOT_TOKEN is not configured");
  }

  let response: Response;
  try {
    response = await fetch(
      `https://api.telegram.org/bot${botToken}/${method}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch (error) {
    throw new TelegramApiError(
      error instanceof Error
        ? `Telegram API ${method} failed: ${error.message}`
        : `Telegram API ${method} failed`,
    );
  }

  const payload = (await response.json()) as TelegramApiResponse<T>;
  if (!response.ok || !payload.ok || payload.result === undefined) {
    throw new TelegramApiError(
      payload.description || `Telegram API ${method} failed`,
    );
  }
  return payload.result;
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options: Record<string, unknown> = {},
) {
  return await callTelegramApi<TelegramSendMessageResult>("sendMessage", {
    chat_id: chatId,
    text,
    ...options,
  });
}

export function getTelegramMiniAppUrl() {
  const { siteUrl } = getTelegramConfig();
  if (!siteUrl) return "";
  return new URL("/telegram", siteUrl).toString();
}

export async function configureTelegramWebhook() {
  const config = getTelegramConfig();
  if (!config.siteUrl || !config.webhookSecret) {
    throw new Error(
      "PUBLIC_SITE_URL and TELEGRAM_WEBHOOK_SECRET are required for the Telegram webhook",
    );
  }

  return await callTelegramApi<boolean>("setWebhook", {
    url: `${config.siteUrl}/api/telegram/webhook`,
    secret_token: config.webhookSecret,
    allowed_updates: ["message"],
  });
}

export async function configureTelegramMiniAppMenu() {
  const webAppUrl = getTelegramMiniAppUrl();
  if (!webAppUrl) throw new Error("PUBLIC_SITE_URL is required for Mini App");

  return await callTelegramApi<boolean>("setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "Рабочие чаты",
      web_app: { url: webAppUrl },
    },
  });
}

export function telegramConversationTitle(
  conversation: {
    type: "DIRECT" | "WORKSPACE" | "GROUP";
    name: string | null;
    workspace: { name: string };
    participants: Array<{
      userId: string;
      user: { name: string | null; email: string };
    }>;
  },
  viewerUserId: string,
) {
  let title: string;
  if (conversation.type === "WORKSPACE") {
    title = "Общий чат";
  } else if (conversation.type === "GROUP") {
    title = conversation.name || "Группа";
  } else {
    const other = conversation.participants.find(
      (participant) => participant.userId !== viewerUserId,
    );
    title = other ? other.user.name?.trim() || other.user.email : "Личный чат";
  }
  return `${conversation.workspace.name} · ${title}`;
}
