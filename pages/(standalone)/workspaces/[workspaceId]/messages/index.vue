<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { toast } from "vue-sonner";

import authenticatedPageProtectMiddleware from "~/middleware/page-protect/authenticatedPage";
import useAuthStore from "~/stores/auth";

definePageMeta({
  layout: "dashboard",
  middleware: [authenticatedPageProtectMiddleware],
});

useHead({ title: "Messages" });

type Person = {
  $id: string;
  name: string | null;
  email: string;
  avatar_url: string | null;
};

type InboxConversationParticipant = {
  user: Person;
  lastReadAt: string | null;
};

type InboxConversationMessage = {
  id: string;
  conversation_id: string;
  sender: Person;
  body: string;
  createdAt: string;
};

type InboxConversationPreview = {
  id: string;
  workspace_id: string;
  type: "DIRECT" | "WORKSPACE" | "GROUP";
  name: string | null;
  group_id: string | null;
  participants: InboxConversationParticipant[];
  last_message: InboxConversationMessage | null;
  unread_count: number;
  updatedAt: string;
};

type InboxResponse = {
  conversations: InboxConversationPreview[];
  unreadCount: number;
  unreadMentionsCount: number;
  unreadChatsCount: number;
  mentions: unknown[];
};

const auth = useAuthStore();
const route = useRoute();
const queryClient = useQueryClient();
const { t } = useAppI18n();

const workspaceId = computed(() => String(route.params["workspaceId"] ?? ""));
const search = ref("");

const { data: people, isFetching: isFetchingPeople } = useQuery<Person[]>({
  queryKey: computed(() => ["workspace-people", workspaceId.value]),
  queryFn: async () => {
    const res = await $fetch<{ people: Person[] }>(
      `/api/workspaces/${workspaceId.value}/people`,
    );
    return res.people ?? [];
  },
  enabled: computed(() => Boolean(workspaceId.value)),
});

const { data: inbox, isFetching: isFetchingInbox } = useQuery<InboxResponse>({
  queryKey: computed(() => ["inbox", workspaceId.value]),
  queryFn: async () =>
    await $fetch<InboxResponse>(
      `/api/messages/inbox?workspace_id=${workspaceId.value}`,
    ),
  enabled: computed(() => Boolean(workspaceId.value)),
});

const conversations = computed(() => inbox.value?.conversations ?? []);

const displayName = (person: Person) =>
  person.name ?? person.email ?? t("common.unknown");
const conversationTitle = (conversation: InboxConversationPreview) => {
  if (conversation.type === "WORKSPACE") return t("messages.general");
  if (conversation.type === "GROUP")
    return conversation.name ?? t("groups.group");
  const myId = auth.user?.id;
  const other =
    conversation.participants.find((p) => p.user.$id !== myId)?.user ??
    conversation.participants[0]?.user;
  return other ? displayName(other) : t("messages.conversation");
};

const conversationSections = computed(() =>
  [
    {
      key: "workspace",
      title: t("messages.workspaceChats"),
      conversations: conversations.value.filter(
        (item) => item.type === "WORKSPACE",
      ),
    },
    {
      key: "groups",
      title: t("messages.groupChats"),
      conversations: conversations.value.filter(
        (item) => item.type === "GROUP",
      ),
    },
    {
      key: "direct",
      title: t("messages.directChats"),
      conversations: conversations.value.filter(
        (item) => item.type === "DIRECT",
      ),
    },
  ].filter((section) => section.conversations.length),
);

const filteredPeople = computed(() => {
  const q = search.value.trim().toLowerCase();
  return (people.value ?? [])
    .filter((p) => p.$id !== auth.user?.id)
    .filter((p) => {
      if (!q) return true;
      return (
        displayName(p).toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q)
      );
    })
    .slice(0, 25);
});

const { mutateAsync: startDirect, isPending: isStarting } = useMutation({
  mutationFn: async (userId: string) => {
    return await $fetch<{ conversation_id: string }>(
      "/api/messages/conversations/direct",
      {
        method: "POST",
        body: { workspace_id: workspaceId.value, user_id: userId },
      },
    );
  },
  onError: () => toast.error(t("messages.startFailed")),
});

const startChat = async (person: Person) => {
  const res = await startDirect(person.$id);
  queryClient.invalidateQueries({ queryKey: ["inbox", workspaceId.value] });
  await navigateTo(
    `/workspaces/${workspaceId.value}/messages/${res.conversation_id}`,
  );
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

    source = new EventSource(
      `/api/realtime/inbox?workspace_id=${encodeURIComponent(id)}`,
    );

    source.onopen = () => {
      reconnectAttempt = 0;
    };

    source.addEventListener("inbox", () => {
      queryClient.invalidateQueries({ queryKey: ["inbox", id] });
    });

    source.onerror = () => {
      close();
      const delay = Math.min(30_000, 500 * 2 ** reconnectAttempt);
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(() => connect(id), delay);
    };
  };

  onMounted(() => connect(workspaceId.value));
  watch(workspaceId, (id) => connect(String(id ?? "")));
  onUnmounted(close);
}
</script>

<template>
  <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
    <Card class="border lg:col-span-1">
      <CardHeader>
        <CardTitle class="text-lg">{{ t("messages.startChat") }}</CardTitle>
        <CardDescription>{{
          t("messages.startChatDescription")
        }}</CardDescription>
      </CardHeader>
      <CardContent class="space-y-3">
        <Input v-model="search" :placeholder="t('messages.search')" />

        <div v-if="isFetchingPeople" class="py-8">
          <Loader class="h-24" />
        </div>

        <div v-else class="space-y-2">
          <div
            v-if="!filteredPeople.length"
            class="text-sm text-muted-foreground"
          >
            {{ t("messages.noMatchingPeople") }}
          </div>

          <button
            v-for="person in filteredPeople"
            :key="person.$id"
            type="button"
            class="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition hover:border-primary"
            :disabled="isStarting"
            @click="startChat(person)"
          >
            <div class="flex min-w-0 items-center gap-3">
              <WorkspaceMemberAvatar
                :name="displayName(person)"
                class="size-8"
                fallback-class="text-sm"
              />
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold">
                  {{ displayName(person) }}
                </p>
                <p class="truncate text-xs text-muted-foreground">
                  {{ person.email }}
                </p>
              </div>
            </div>
            <Button variant="secondary" size="xs">
              {{ t("messages.chat") }}
            </Button>
          </button>
        </div>
      </CardContent>
    </Card>

    <Card class="border lg:col-span-2">
      <CardHeader>
        <CardTitle class="text-lg">{{ t("messages.conversations") }}</CardTitle>
        <CardDescription>{{ t("messages.recent") }}</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div v-if="isFetchingInbox" class="py-8">
          <Loader class="h-24" />
        </div>

        <div
          v-else-if="!conversations.length"
          class="text-sm text-muted-foreground"
        >
          {{ t("messages.noConversations") }}
        </div>

        <template v-else>
          <section
            v-for="section in conversationSections"
            :key="section.key"
            class="space-y-2"
          >
            <p
              class="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase"
            >
              {{ section.title }}
            </p>
            <NuxtLink
              v-for="conv in section.conversations"
              :key="conv.id"
              :href="`/workspaces/${workspaceId}/messages/${conv.id}`"
              class="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition hover:border-primary"
            >
              <div class="flex min-w-0 items-center gap-3">
                <WorkspaceGroupAvatar
                  v-if="conv.type !== 'DIRECT'"
                  :name="conversationTitle(conv)"
                  :color="conv.type === 'WORKSPACE' ? '#0f766e' : null"
                  class="size-8"
                />
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold">
                    {{ conversationTitle(conv) }}
                  </p>
                  <p
                    v-if="conv.last_message"
                    class="truncate text-xs text-muted-foreground"
                  >
                    {{ conv.last_message.body }}
                  </p>
                  <p v-else class="text-xs text-muted-foreground">
                    {{ t("messages.noMessages") }}
                  </p>
                </div>
              </div>
              <span
                v-if="conv.unread_count > 0"
                class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground"
              >
                {{ conv.unread_count }}
              </span>
            </NuxtLink>
          </section>
        </template>
      </CardContent>
    </Card>
  </div>
</template>
