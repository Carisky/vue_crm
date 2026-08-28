<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";

definePageMeta({ layout: false });
useHead({
  title: "Рабочие чаты",
  script: [{ src: "https://telegram.org/js/telegram-web-app.js?59" }],
});

type TelegramWebApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
  BackButton: {
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
  };
};

type MiniConversation = {
  id: string;
  workspace_id: string;
  workspace_name: string;
  type: "DIRECT" | "WORKSPACE" | "GROUP";
  title: string;
  unread_count: number;
  updated_at: string;
  last_message: {
    body: string;
    sender_name: string;
    created_at: string;
  } | null;
};

type MiniMessage = {
  id: string;
  conversation_id: string;
  sender: {
    $id: string;
    name: string | null;
    email: string;
  };
  body: string;
  createdAt: string;
};

type InboxResponse = {
  user: { id: string; name: string };
  conversations: MiniConversation[];
};

type ConversationResponse = {
  conversation: {
    id: string;
    title: string;
    type: MiniConversation["type"];
  };
  current_user_id: string;
  messages: MiniMessage[];
};

const initData = ref("");
const inbox = ref<InboxResponse | null>(null);
const conversation = ref<ConversationResponse | null>(null);
const selectedConversationId = ref<string | null>(null);
const loading = ref(true);
const loadingConversation = ref(false);
const sending = ref(false);
const error = ref("");
const messageBox = ref("");
const messageList = ref<HTMLElement | null>(null);
let telegramWebApp: TelegramWebApp | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

const miniFetch = async <T,>(
  url: string,
  options: Parameters<typeof $fetch>[1] = {},
) =>
  await $fetch<T>(url, {
    ...options,
    headers: {
      ...(options?.headers ?? {}),
      "x-telegram-init-data": initData.value,
    },
  });

const scrollToBottom = async () => {
  await nextTick();
  if (messageList.value) {
    messageList.value.scrollTop = messageList.value.scrollHeight;
  }
};

const loadInbox = async () => {
  inbox.value = await miniFetch<InboxResponse>("/api/telegram/mini/inbox");
};

const markRead = async (conversationId: string) => {
  await miniFetch(
    `/api/telegram/mini/conversations/${conversationId}/mark-read`,
    { method: "PATCH" },
  );
};

const loadConversation = async (conversationId: string, silent = false) => {
  if (!silent) loadingConversation.value = true;
  try {
    const previousCount = conversation.value?.messages.length ?? 0;
    conversation.value = await miniFetch<ConversationResponse>(
      `/api/telegram/mini/conversations/${conversationId}`,
    );
    await markRead(conversationId);
    if (!silent || conversation.value.messages.length !== previousCount) {
      await scrollToBottom();
    }
  } finally {
    loadingConversation.value = false;
  }
};

const openConversation = async (conversationId: string) => {
  selectedConversationId.value = conversationId;
  conversation.value = null;
  await loadConversation(conversationId);
};

const closeConversation = () => {
  selectedConversationId.value = null;
  conversation.value = null;
  messageBox.value = "";
  void loadInbox();
};

const handleSend = async () => {
  const body = messageBox.value.trim();
  const conversationId = selectedConversationId.value;
  if (!body || !conversationId || sending.value) return;

  sending.value = true;
  try {
    await miniFetch(
      `/api/telegram/mini/conversations/${conversationId}/messages`,
      { method: "POST", body: { body } },
    );
    messageBox.value = "";
    await loadConversation(conversationId, true);
  } finally {
    sending.value = false;
  }
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  void handleSend();
};

const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

const isMine = (message: MiniMessage) =>
  message.sender.$id === conversation.value?.current_user_id;

const poll = async () => {
  try {
    if (selectedConversationId.value) {
      await loadConversation(selectedConversationId.value, true);
    } else {
      await loadInbox();
    }
  } catch {
    // Keep the last successfully loaded state while reconnecting.
  }
};

watch(selectedConversationId, (conversationId) => {
  if (!telegramWebApp) return;
  if (conversationId) telegramWebApp.BackButton.show();
  else telegramWebApp.BackButton.hide();
});

onMounted(async () => {
  const telegram = (
    window as typeof window & {
      Telegram?: { WebApp?: TelegramWebApp };
    }
  ).Telegram?.WebApp;
  if (!telegram?.initData) {
    error.value = "Откройте приложение кнопкой внутри Telegram-бота.";
    loading.value = false;
    return;
  }

  telegramWebApp = telegram;
  telegram.ready();
  telegram.expand();
  telegram.BackButton.onClick(closeConversation);
  initData.value = telegram.initData;

  try {
    await loadInbox();
    pollTimer = setInterval(() => void poll(), 3000);
  } catch {
    error.value =
      "Не удалось открыть рабочие чаты. Переподключите Telegram в CRM.";
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
  telegramWebApp?.BackButton.offClick(closeConversation);
});
</script>

<template>
  <main
    class="flex h-[100dvh] flex-col overflow-hidden bg-[var(--tg-theme-bg-color,#ffffff)] text-[var(--tg-theme-text-color,#111827)]"
  >
    <div v-if="loading" class="flex flex-1 items-center justify-center">
      <Icon name="svg-spinners:8-dots-rotate" size="32px" />
    </div>

    <div
      v-else-if="error"
      class="flex flex-1 items-center justify-center p-6 text-center"
    >
      <div class="max-w-sm space-y-3">
        <Icon name="lucide:circle-alert" size="36px" class="mx-auto" />
        <p class="text-sm">{{ error }}</p>
      </div>
    </div>

    <template v-else-if="!selectedConversationId">
      <header
        class="border-b border-black/10 px-4 pt-4 pb-3 dark:border-white/10"
      >
        <h1 class="text-xl font-bold">Рабочие чаты</h1>
        <p class="mt-0.5 text-xs opacity-60">{{ inbox?.user.name }}</p>
      </header>

      <section class="flex-1 overflow-y-auto p-3">
        <div
          v-if="!inbox?.conversations.length"
          class="py-16 text-center text-sm opacity-60"
        >
          Доступных чатов пока нет
        </div>

        <button
          v-for="item in inbox?.conversations"
          :key="item.id"
          type="button"
          class="mb-2 flex w-full items-center gap-3 rounded-2xl bg-[var(--tg-theme-secondary-bg-color,#f3f4f6)] p-3 text-left active:scale-[0.99]"
          @click="openConversation(item.id)"
        >
          <span
            class="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#229ED9]/15 text-[#229ED9]"
          >
            <Icon
              :name="item.type === 'DIRECT' ? 'lucide:user' : 'lucide:users'"
              size="21px"
            />
          </span>
          <span class="min-w-0 flex-1">
            <span class="flex items-center justify-between gap-2">
              <strong class="truncate text-sm">{{ item.title }}</strong>
              <span
                v-if="item.last_message"
                class="shrink-0 text-[11px] opacity-50"
              >
                {{ formatTime(item.last_message.created_at) }}
              </span>
            </span>
            <span class="mt-1 flex items-center justify-between gap-2">
              <span class="truncate text-xs opacity-60">
                <template v-if="item.last_message">
                  {{ item.last_message.sender_name }}:
                  {{ item.last_message.body }}
                </template>
                <template v-else>Сообщений пока нет</template>
              </span>
              <span
                v-if="item.unread_count"
                class="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#229ED9] px-1.5 text-[11px] font-bold text-white"
              >
                {{ item.unread_count }}
              </span>
            </span>
          </span>
        </button>
      </section>
    </template>

    <template v-else>
      <header
        class="flex items-center gap-2 border-b border-black/10 px-3 py-3 dark:border-white/10"
      >
        <button
          type="button"
          class="flex size-9 items-center justify-center rounded-full active:bg-black/10"
          @click="closeConversation"
        >
          <Icon name="lucide:arrow-left" size="21px" />
        </button>
        <h1 class="min-w-0 flex-1 truncate text-base font-bold">
          {{ conversation?.conversation.title ?? "Чат" }}
        </h1>
      </header>

      <section
        ref="messageList"
        class="flex-1 space-y-2 overflow-y-auto px-3 py-4"
      >
        <div
          v-if="loadingConversation && !conversation"
          class="flex h-full items-center justify-center"
        >
          <Icon name="svg-spinners:8-dots-rotate" size="28px" />
        </div>
        <div
          v-else-if="!conversation?.messages.length"
          class="py-16 text-center text-sm opacity-60"
        >
          Напишите первое сообщение
        </div>
        <div
          v-for="message in conversation?.messages"
          :key="message.id"
          class="flex"
          :class="isMine(message) ? 'justify-end' : 'justify-start'"
        >
          <div
            class="max-w-[84%] rounded-2xl px-3 py-2 text-sm shadow-sm"
            :class="
              isMine(message)
                ? 'rounded-br-md bg-[#229ED9] text-white'
                : 'rounded-bl-md bg-[var(--tg-theme-secondary-bg-color,#f3f4f6)]'
            "
          >
            <p
              v-if="!isMine(message)"
              class="mb-1 text-[11px] font-bold opacity-60"
            >
              {{ message.sender.name ?? message.sender.email }}
            </p>
            <p class="whitespace-pre-wrap">{{ message.body }}</p>
            <p class="mt-1 text-right text-[10px] opacity-60">
              {{ formatTime(message.createdAt) }}
            </p>
          </div>
        </div>
      </section>

      <footer
        class="flex items-end gap-2 border-t border-black/10 bg-[var(--tg-theme-bg-color,#ffffff)] p-3 dark:border-white/10"
      >
        <textarea
          v-model="messageBox"
          rows="1"
          class="max-h-28 min-h-10 flex-1 resize-none rounded-2xl border-0 bg-[var(--tg-theme-secondary-bg-color,#f3f4f6)] px-3 py-2.5 text-sm outline-none"
          placeholder="Сообщение"
          :disabled="sending"
          @keydown="handleKeydown"
        />
        <button
          type="button"
          class="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#229ED9] text-white disabled:opacity-40"
          :disabled="sending || !messageBox.trim()"
          @click="handleSend"
        >
          <Icon
            :name="sending ? 'svg-spinners:8-dots-rotate' : 'lucide:send'"
            size="18px"
          />
        </button>
      </footer>
    </template>
  </main>
</template>
