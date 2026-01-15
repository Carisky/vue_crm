<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { Icon } from '#components';
import {
  Button,
  Loader,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '#components';
import useAuthStore from '~/stores/auth';

type InboxMention = {
  id: string;
  workspaceId: string;
  taskId: string | null;
  projectId: string | null;
  actorId: string | null;
  actorName: string | null;
  taskName: string | null;
  projectName: string | null;
  type: string;
  message: string | null;
  isRead: boolean;
  createdAt: string;
};

type InboxConversationParticipant = {
  user: {
    $id: string;
    name: string | null;
    email: string;
    avatar_url: string | null;
  };
  lastReadAt: string | null;
};

type InboxConversationMessage = {
  id: string;
  conversation_id: string;
  sender: InboxConversationParticipant['user'];
  body: string;
  createdAt: string;
};

type InboxConversationPreview = {
  id: string;
  workspace_id: string;
  participants: InboxConversationParticipant[];
  last_message: InboxConversationMessage | null;
  unread_count: number;
  updatedAt: string;
};

type InboxResponse = {
  mentions: InboxMention[];
  unreadMentionsCount: number;
  conversations: InboxConversationPreview[];
  unreadChatsCount: number;
  unreadCount: number;
};

const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const auth = useAuthStore();

const workspaceId = computed(() => route.params['workspaceId']);
const sheetOpen = ref(false);
const queryKey = computed(() => ['inbox', workspaceId.value ?? 'global']);

const { data, isFetching } = useQuery({
  queryKey,
  queryFn: async () => {
    if (!workspaceId.value) {
      return {
        mentions: [],
        unreadMentionsCount: 0,
        conversations: [],
        unreadChatsCount: 0,
        unreadCount: 0,
      } satisfies InboxResponse;
    }

    return await $fetch<InboxResponse>(
      `/api/messages/inbox?workspace_id=${workspaceId.value}`,
    );
  },
  enabled: computed(() => !!workspaceId.value),
});

const unreadCount = computed(() => data.value?.unreadCount ?? 0);
const mentions = computed(() => data.value?.mentions ?? []);
const conversations = computed(() => data.value?.conversations ?? []);

const displayName = (user: InboxConversationParticipant['user']) =>
  user.name ?? user.email ?? 'Unknown';
const conversationTitle = (conversation: InboxConversationPreview) => {
  const myId = auth.user?.id;
  const other =
    conversation.participants.find((p) => p.user.$id !== myId)?.user ??
    conversation.participants[0]?.user;
  return other ? displayName(other) : 'Conversation';
};

const formatTimestamp = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

const markMentionRead = async (id: string) => {
  await $fetch('/api/notifications/mark-read', {
    method: 'PATCH',
    body: { ids: [id] },
  });
  queryClient.invalidateQueries({ queryKey: queryKey.value });
};

const markAllMentionsRead = async () => {
  const unreadIds = mentions.value.filter((m) => !m.isRead).map((m) => m.id);
  if (!unreadIds.length) return;

  await $fetch('/api/notifications/mark-read', {
    method: 'PATCH',
    body: { ids: unreadIds },
  });
  queryClient.invalidateQueries({ queryKey: queryKey.value });
};

const openMention = async (mention: InboxMention) => {
  if (!workspaceId.value || !mention.taskId) return;
  sheetOpen.value = false;
  if (!mention.isRead) await markMentionRead(mention.id);
  await router.push(`/workspaces/${workspaceId.value}/tasks/${mention.taskId}`);
};

const openConversation = async (conversationId: string) => {
  if (!workspaceId.value) return;
  sheetOpen.value = false;
  await router.push(`/workspaces/${workspaceId.value}/messages/${conversationId}`);
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

    source = new EventSource(`/api/realtime/inbox?workspace_id=${encodeURIComponent(id)}`);

    source.onopen = () => {
      reconnectAttempt = 0;
    };

    source.addEventListener('inbox', () => {
      queryClient.invalidateQueries({ queryKey: queryKey.value });
    });

    source.onerror = () => {
      close();
      const delay = Math.min(30_000, 500 * (2 ** reconnectAttempt));
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(() => connect(id), delay);
    };
  };

  onMounted(() => connect(String(workspaceId.value ?? '')));
  watch(workspaceId, (id) => connect(String(id ?? '')));
  onUnmounted(close);
}
</script>

<template>
  <Sheet v-model:open="sheetOpen">
    <SheetTrigger as-child>
      <Button variant="ghost" size="icon" class="relative">
        <Icon name="heroicons:chat-bubble-left-right" size="16px" class="size-4 text-muted-foreground" />
        <span
          v-if="unreadCount > 0"
          class="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[11px] text-white"
        >
          {{ unreadCount }}
        </span>
      </Button>
    </SheetTrigger>
    <SheetContent side="right" class="w-[280px] sm:w-[380px] flex flex-col">
      <SheetHeader class="gap-2">
        <div class="flex items-center gap-2">
          <SheetTitle>Messages</SheetTitle>
          <Button
            variant="outline"
            size="xs"
            :disabled="!mentions.some((m) => !m.isRead)"
            class="capitalize text-[11px]"
            @click="markAllMentionsRead"
          >
            Mark mentions read
          </Button>
        </div>
        <SheetDescription>Direct chats and @mentions</SheetDescription>
      </SheetHeader>

      <div class="mt-4 flex-1 overflow-y-auto pr-1 space-y-5">
        <Loader v-if="isFetching" class="h-24" />

        <section v-else class="space-y-2">
          <div class="flex items-center justify-between">
            <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Mentions
            </p>
            <NuxtLink
              v-if="workspaceId"
              :href="`/workspaces/${workspaceId}/messages`"
              class="text-[11px] font-semibold text-primary hover:underline"
              @click="sheetOpen = false"
            >
              Open
            </NuxtLink>
          </div>

          <div v-if="!mentions.length" class="text-sm text-muted-foreground">
            No mentions yet.
          </div>

          <button
            v-for="mention in mentions"
            :key="mention.id"
            type="button"
            class="w-full text-left flex items-start gap-3 rounded-xl border border-border/70 bg-background/90 px-3 py-2 transition hover:border-primary/80"
            @click="openMention(mention)"
          >
            <span class="mt-1">
              <Icon
                :name="mention.isRead ? 'heroicons:check-circle' : 'heroicons:circle'"
                size="18px"
                :class="mention.isRead ? 'text-muted-foreground' : 'text-primary'"
              />
            </span>
            <div class="flex-1 space-y-0.5">
              <p class="text-sm font-semibold leading-tight">
                {{ mention.taskName ? `You were mentioned in ${mention.taskName}` : 'You were mentioned' }}
              </p>
              <p class="text-xs text-muted-foreground">
                {{ mention.actorName ?? 'Someone' }} · {{ formatTimestamp(mention.createdAt) }}
              </p>
            </div>
          </button>
        </section>

        <section v-if="!isFetching" class="space-y-2">
          <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Chats
          </p>

          <div v-if="!conversations.length" class="text-sm text-muted-foreground">
            No chats yet. Start one from the Messages page.
          </div>

          <button
            v-for="conv in conversations"
            :key="conv.id"
            type="button"
            class="w-full text-left flex items-start gap-3 rounded-xl border border-border/70 bg-background/90 px-3 py-2 transition hover:border-primary/80"
            @click="openConversation(conv.id)"
          >
            <span class="mt-1">
              <Icon
                :name="conv.unread_count > 0 ? 'heroicons:chat-bubble-left-right-solid' : 'heroicons:chat-bubble-left-right'"
                size="18px"
                :class="conv.unread_count > 0 ? 'text-primary' : 'text-muted-foreground'"
              />
            </span>
            <div class="flex-1 space-y-0.5">
              <div class="flex items-center justify-between gap-2">
                <p class="text-sm font-semibold leading-tight truncate">
                  {{ conversationTitle(conv) }}
                </p>
                <span
                  v-if="conv.unread_count > 0"
                  class="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground"
                >
                  {{ conv.unread_count }}
                </span>
              </div>
              <p v-if="conv.last_message" class="text-xs text-muted-foreground truncate">
                {{ conv.last_message.body }}
              </p>
              <p v-else class="text-xs text-muted-foreground">
                No messages yet
              </p>
            </div>
          </button>
        </section>
      </div>

      <SheetFooter class="mt-6">
        <span class="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Inbox
        </span>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>
