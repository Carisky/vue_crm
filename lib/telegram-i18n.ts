import type { AppLocale } from "./locales";

const en = {
  "bot.ready":
    "Done. Available working chats: {count}. Tap the button below — no commands are required.",
  "bot.openChats": "Open working chats",
  "bot.linkExpired":
    "This link has expired. Open the CRM and generate a new QR code.",
  "bot.linkedElsewhere":
    "This Telegram account is already linked to another CRM user.",
  "bot.linkUsed":
    "This link has already been used. Generate a new QR code in the CRM.",
  "bot.linkFirst":
    "Open the CRM, tap the Telegram button, and scan the QR code first.",
  "conversation.general": "General chat",
  "conversation.group": "Group",
  "conversation.direct": "Direct chat",
  "mini.workingChats": "Working chats",
  "mini.openInsideTelegram":
    "Open the app using the button inside the Telegram bot.",
  "mini.loadFailed":
    "Could not open working chats. Reconnect Telegram in the CRM.",
  "mini.noAvailableChats": "No chats are available yet",
  "mini.noMessages": "No messages yet",
  "mini.chat": "Chat",
  "mini.firstMessage": "Write the first message",
  "mini.message": "Message",
  "mini.back": "Back",
  "mini.send": "Send",
} as const;

export type TelegramTranslationKey = keyof typeof en;
type TelegramMessages = Record<TelegramTranslationKey, string>;

const pl: TelegramMessages = {
  "bot.ready":
    "Gotowe. Dostępne czaty robocze: {count}. Naciśnij przycisk poniżej — nie musisz wpisywać poleceń.",
  "bot.openChats": "Otwórz czaty robocze",
  "bot.linkExpired": "Ten link wygasł. Otwórz CRM i wygeneruj nowy kod QR.",
  "bot.linkedElsewhere":
    "To konto Telegram jest już połączone z innym użytkownikiem CRM.",
  "bot.linkUsed": "Ten link został już użyty. Wygeneruj nowy kod QR w CRM.",
  "bot.linkFirst":
    "Najpierw otwórz CRM, naciśnij przycisk Telegram i zeskanuj kod QR.",
  "conversation.general": "Czat ogólny",
  "conversation.group": "Grupa",
  "conversation.direct": "Czat prywatny",
  "mini.workingChats": "Czaty robocze",
  "mini.openInsideTelegram":
    "Otwórz aplikację przyciskiem znajdującym się w bocie Telegram.",
  "mini.loadFailed":
    "Nie udało się otworzyć czatów roboczych. Połącz Telegram ponownie w CRM.",
  "mini.noAvailableChats": "Brak dostępnych czatów",
  "mini.noMessages": "Brak wiadomości",
  "mini.chat": "Czat",
  "mini.firstMessage": "Napisz pierwszą wiadomość",
  "mini.message": "Wiadomość",
  "mini.back": "Wstecz",
  "mini.send": "Wyślij",
};

const ru: TelegramMessages = {
  "bot.ready":
    "Готово. Доступно рабочих чатов: {count}. Нажмите кнопку ниже — команды вводить не нужно.",
  "bot.openChats": "Открыть рабочие чаты",
  "bot.linkExpired":
    "Эта ссылка устарела. Откройте CRM и создайте новый QR-код.",
  "bot.linkedElsewhere":
    "Этот Telegram уже привязан к другому пользователю CRM.",
  "bot.linkUsed": "Эта ссылка уже использована. Создайте новый QR-код в CRM.",
  "bot.linkFirst":
    "Сначала откройте CRM, нажмите кнопку Telegram и отсканируйте QR-код.",
  "conversation.general": "Общий чат",
  "conversation.group": "Группа",
  "conversation.direct": "Личный чат",
  "mini.workingChats": "Рабочие чаты",
  "mini.openInsideTelegram":
    "Откройте приложение кнопкой внутри Telegram-бота.",
  "mini.loadFailed":
    "Не удалось открыть рабочие чаты. Переподключите Telegram в CRM.",
  "mini.noAvailableChats": "Доступных чатов пока нет",
  "mini.noMessages": "Сообщений пока нет",
  "mini.chat": "Чат",
  "mini.firstMessage": "Напишите первое сообщение",
  "mini.message": "Сообщение",
  "mini.back": "Назад",
  "mini.send": "Отправить",
};

const telegramMessages: Record<AppLocale, TelegramMessages> = {
  en,
  pl,
  ru,
};

export function normalizeTelegramLocale(
  locale: string | null | undefined,
): AppLocale {
  const language = locale?.trim().toLowerCase().split(/[-_]/)[0];
  if (language === "pl" || language === "ru") {
    return language;
  }
  return "en";
}

export function telegramT(
  locale: string | null | undefined,
  key: TelegramTranslationKey,
  params: Record<string, string | number> = {},
) {
  let value = telegramMessages[normalizeTelegramLocale(locale)][key];
  for (const [name, replacement] of Object.entries(params)) {
    value = value.replaceAll(`{${name}}`, String(replacement));
  }
  return value;
}
