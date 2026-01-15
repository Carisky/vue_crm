<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';

import authenticatedPageProtectMiddleware from '~/middleware/page-protect/authenticatedPage';
import useAuthStore from '~/stores/auth';

definePageMeta({
  layout: 'dashboard',
  middleware: [authenticatedPageProtectMiddleware],
});

useHead({ title: 'Chat' });

type Person = {
  $id: string;
  name: string | null;
  email: string;
  avatar_url: string | null;
};

type ConversationParticipant = {
  user: Person;
  lastReadAt: string | null;
};

type ConversationMessage = {
  id: string;
  conversation_id: string;
  sender: Person;
  body: string;
  createdAt: string;
};

type ConversationResponse = {
  conversation: {
    id: string;
    workspace_id: string;
    participants: ConversationParticipant[];
    my_last_read_at: string | null;
    updatedAt: string;
  };
  messages: ConversationMessage[];
};

const auth = useAuthStore();
const route = useRoute();
const queryClient = useQueryClient();

const workspaceId = computed(() => String(route.params['workspaceId'] ?? ''));
const conversationId = computed(() => String(route.params['conversationId'] ?? ''));
const queryKey = computed(() => ['conversation', conversationId.value]);

const { data, isFetching } = useQuery<ConversationResponse>({
  queryKey,
  queryFn: async () =>
    await $fetch<ConversationResponse>(
      `/api/messages/conversations/${conversationId.value}`,
    ),
  enabled: computed(() => Boolean(conversationId.value)),
});

const messages = computed(() => data.value?.messages ?? []);
const participants = computed(() => data.value?.conversation.participants ?? []);

const displayName = (person: Person) => person.name ?? person.email ?? 'Unknown';
const otherParticipant = computed(() => {
  const myId = auth.user?.id;
  return participants.value.find((p) => p.user.$id !== myId)?.user ?? null;
});

const otherLastReadAt = computed(() => {
  const myId = auth.user?.id;
  return participants.value.find((p) => p.user.$id !== myId)?.lastReadAt ?? null;
});

const formatTimestamp = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

const messageBox = ref('');
const isSending = ref(false);
const listEl = ref<HTMLElement | null>(null);

const scrollToBottom = async () => {
  await nextTick();
  const el = listEl.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
};

watch(
  () => messages.value.length,
  async () => {
    await scrollToBottom();
  },
  { immediate: true },
);

const markRead = async () => {
  await $fetch(`/api/messages/conversations/${conversationId.value}/mark-read`, {
    method: 'PATCH',
  });
  queryClient.invalidateQueries({ queryKey: ['inbox', workspaceId.value] });
};

watch(
  () => data.value?.conversation.id,
  async (id) => {
    if (!id) return;
    await markRead();
  },
  { immediate: true },
);

const { mutateAsync: sendMessage } = useMutation({
  mutationFn: async (body: string) =>
    await $fetch<{ message: ConversationMessage }>(
      `/api/messages/conversations/${conversationId.value}/messages`,
      { method: 'POST', body: { body } },
    ),
  onError: () => toast.error('Failed to send message'),
});

const handleSend = async () => {
  const body = messageBox.value.trim();
  if (!body || isSending.value) return;

  isSending.value = true;
  try {
    await sendMessage(body);
    messageBox.value = '';
    await queryClient.refetchQueries({ queryKey: queryKey.value });
    queryClient.invalidateQueries({ queryKey: ['inbox', workspaceId.value] });
    await markRead();
  } finally {
    isSending.value = false;
  }
};

const handleKeydown = async (evt: KeyboardEvent) => {
  if (evt.key !== 'Enter') return;
  if (evt.shiftKey) return;
  evt.preventDefault();
  await handleSend();
};

const isMine = (msg: ConversationMessage) => msg.sender.$id === auth.user?.id;

const deliveryStatus = (msg: ConversationMessage) => {
  if (!isMine(msg)) return null;
  const otherRead = otherLastReadAt.value;
  if (!otherRead) return 'Sended';
  return new Date(otherRead).getTime() >= new Date(msg.createdAt).getTime()
    ? 'Read'
    : 'Sended';
};

if (import.meta.client) {
  let source: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;

  const close = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    source?.close();
    source = null;
  };

  const connect = (id: string) => {
    close();
    if (!id) return;

    source = new EventSource(`/api/realtime/conversations?conversation_id=${encodeURIComponent(id)}`);

    source.onopen = () => {
      reconnectAttempt = 0;
    };

    source.addEventListener('conversation', async (evt) => {
      try {
        const parsed = JSON.parse((evt as MessageEvent).data) as
          | { type: 'MESSAGE_CREATED'; conversationId: string; message: ConversationMessage }
          | { type: 'READ_UPDATED'; conversationId: string; userId: string; lastReadAt: string };

        if (parsed.type === 'MESSAGE_CREATED') {
          queryClient.setQueryData<ConversationResponse>(queryKey.value, (current) => {
            if (!current) return current;
            if (current.messages.some((m) => m.id === parsed.message.id)) return current;
            return {
              ...current,
              messages: [...current.messages, parsed.message],
              conversation: {
                ...current.conversation,
                updatedAt: new Date().toISOString(),
              },
            };
          });

          queryClient.invalidateQueries({ queryKey: ['inbox', workspaceId.value] });
          if (parsed.message.sender.$id !== auth.user?.id) {
            await markRead();
          }
        } else if (parsed.type === 'READ_UPDATED') {
          queryClient.setQueryData<ConversationResponse>(queryKey.value, (current) => {
            if (!current) return current;
            return {
              ...current,
              conversation: {
                ...current.conversation,
                participants: current.conversation.participants.map((p) =>
                  p.user.$id === parsed.userId ? { ...p, lastReadAt: parsed.lastReadAt } : p,
                ),
              },
            };
          });
        }
      } catch {
        // ignore malformed events
      }
    });

    source.onerror = () => {
      close();
      const delay = Math.min(30_000, 500 * (2 ** reconnectAttempt));
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(() => connect(id), delay);
    };
  };

  onMounted(() => connect(conversationId.value));
  watch(conversationId, (id) => connect(String(id ?? '')));
  onUnmounted(close);
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-start justify-between gap-3">
      <div class="space-y-1">
        <h1 class="text-2xl font-semibold">
          {{ otherParticipant ? displayName(otherParticipant) : 'Conversation' }}
        </h1>
        <NuxtLink
          :href="`/workspaces/${workspaceId}/messages`"
          class="text-sm text-muted-foreground hover:underline"
        >
          Back to messages
        </NuxtLink>
      </div>
      <Button as-child variant="secondary" size="sm">
        <NuxtLink :href="`/workspaces/${workspaceId}/messages`">
          <Icon name="heroicons:chat-bubble-left-right" size="16px" class="size-4 mr-1" />
          All chats
        </NuxtLink>
      </Button>
    </div>

    <div class="grid grid-cols-1 gap-4">
      <Card class="border">
        <CardContent class="p-0">
          <div
            ref="listEl"
            class="h-[520px] overflow-y-auto px-4 py-4 space-y-3"
          >
            <Loader v-if="isFetching" class="h-24" />

            <div v-else-if="!messages.length" class="text-sm text-muted-foreground py-12 text-center">
              No messages yet. Say hi.
            </div>

            <div v-else class="space-y-3">
              <div
                v-for="msg in messages"
                :key="msg.id"
                class="flex gap-2"
                :class="isMine(msg) ? 'justify-end' : 'justify-start'"
              >
                <div v-if="!isMine(msg)" class="pt-1">
                  <WorkspaceMemberAvatar :name="displayName(msg.sender)" class="size-7" fallback-class="text-xs" />
                </div>
                <div
                  class="max-w-[78%] rounded-2xl border px-3 py-2"
                  :class="isMine(msg) ? 'bg-primary text-primary-foreground border-primary/60' : 'bg-background'"
                >
                  <p class="text-sm whitespace-pre-wrap">{{ msg.body }}</p>
                  <p
                    class="mt-1 text-[10px]"
                    :class="isMine(msg) ? 'text-primary-foreground/80' : 'text-muted-foreground'"
                  >
                    {{ formatTimestamp(msg.createdAt) }}
                    <template v-if="isMine(msg)"> · {{ deliveryStatus(msg) }}</template>
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div class="border-t px-4 py-3 flex items-end gap-3">
            <Textarea
              v-model="messageBox"
              rows="2"
              placeholder="Write a message… (Enter to send, Shift+Enter for newline)"
              class="min-h-[44px]"
              :disabled="isSending"
              @keydown="handleKeydown"
            />
            <Button size="sm" class="h-10" :disabled="isSending || !messageBox.trim()" @click="handleSend">
              <Icon v-if="isSending" name="svg-spinners:8-dots-rotate" size="16px" class="size-4" />
              <template v-else>Send</template>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
