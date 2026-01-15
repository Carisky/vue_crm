<script setup lang="ts">
import { computed, ref } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';

import authenticatedPageProtectMiddleware from '~/middleware/page-protect/authenticatedPage';
import useAuthStore from '~/stores/auth';

definePageMeta({
  layout: 'dashboard',
  middleware: [authenticatedPageProtectMiddleware],
});

useHead({ title: 'Messages' });

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

const workspaceId = computed(() => String(route.params['workspaceId'] ?? ''));
const search = ref('');

const { data: people, isFetching: isFetchingPeople } = useQuery<Person[]>({
  queryKey: computed(() => ['workspace-people', workspaceId.value]),
  queryFn: async () => {
    const res = await $fetch<{ people: Person[] }>(
      `/api/workspaces/${workspaceId.value}/people`,
    );
    return res.people ?? [];
  },
  enabled: computed(() => Boolean(workspaceId.value)),
});

const { data: inbox, isFetching: isFetchingInbox } = useQuery<InboxResponse>({
  queryKey: computed(() => ['inbox', workspaceId.value]),
  queryFn: async () =>
    await $fetch<InboxResponse>(`/api/messages/inbox?workspace_id=${workspaceId.value}`),
  enabled: computed(() => Boolean(workspaceId.value)),
});

const conversations = computed(() => inbox.value?.conversations ?? []);

const displayName = (person: Person) => person.name ?? person.email ?? 'Unknown';
const conversationTitle = (conversation: InboxConversationPreview) => {
  const myId = auth.user?.id;
  const other =
    conversation.participants.find((p) => p.user.$id !== myId)?.user ??
    conversation.participants[0]?.user;
  return other ? displayName(other) : 'Conversation';
};

const filteredPeople = computed(() => {
  const q = search.value.trim().toLowerCase();
  return (people.value ?? [])
    .filter((p) => p.$id !== auth.user?.id)
    .filter((p) => {
      if (!q) return true;
      return (
        displayName(p).toLowerCase().includes(q) || p.email.toLowerCase().includes(q)
      );
    })
    .slice(0, 25);
});

const { mutateAsync: startDirect, isPending: isStarting } = useMutation({
  mutationFn: async (userId: string) => {
    return await $fetch<{ conversation_id: string }>(
      '/api/messages/conversations/direct',
      {
        method: 'POST',
        body: { workspace_id: workspaceId.value, user_id: userId },
      },
    );
  },
  onError: () => toast.error('Failed to start chat'),
});

const startChat = async (person: Person) => {
  const res = await startDirect(person.$id);
  queryClient.invalidateQueries({ queryKey: ['inbox', workspaceId.value] });
  await navigateTo(`/workspaces/${workspaceId.value}/messages/${res.conversation_id}`);
};
</script>

<template>
  <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
    <Card class="lg:col-span-1 border">
      <CardHeader>
        <CardTitle class="text-lg">Start a chat</CardTitle>
        <CardDescription>Find a teammate and send a message</CardDescription>
      </CardHeader>
      <CardContent class="space-y-3">
        <Input v-model="search" placeholder="Search by name or email" />

        <div v-if="isFetchingPeople" class="py-8">
          <Loader class="h-24" />
        </div>

        <div v-else class="space-y-2">
          <div v-if="!filteredPeople.length" class="text-sm text-muted-foreground">
            No matching people.
          </div>

          <button
            v-for="person in filteredPeople"
            :key="person.$id"
            type="button"
            class="w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition hover:border-primary"
            :disabled="isStarting"
            @click="startChat(person)"
          >
            <div class="flex items-center gap-3 min-w-0">
              <WorkspaceMemberAvatar :name="displayName(person)" class="size-8" fallback-class="text-sm" />
              <div class="min-w-0">
                <p class="text-sm font-semibold truncate">{{ displayName(person) }}</p>
                <p class="text-xs text-muted-foreground truncate">{{ person.email }}</p>
              </div>
            </div>
            <Button variant="secondary" size="xs">
              Chat
            </Button>
          </button>
        </div>
      </CardContent>
    </Card>

    <Card class="lg:col-span-2 border">
      <CardHeader>
        <CardTitle class="text-lg">Conversations</CardTitle>
        <CardDescription>Your recent direct messages</CardDescription>
      </CardHeader>
      <CardContent class="space-y-2">
        <div v-if="isFetchingInbox" class="py-8">
          <Loader class="h-24" />
        </div>

        <div v-else-if="!conversations.length" class="text-sm text-muted-foreground">
          No conversations yet.
        </div>

        <NuxtLink
          v-else
          v-for="conv in conversations"
          :key="conv.id"
          :href="`/workspaces/${workspaceId}/messages/${conv.id}`"
          class="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition hover:border-primary"
        >
          <div class="min-w-0">
            <p class="text-sm font-semibold truncate">
              {{ conversationTitle(conv) }}
            </p>
            <p v-if="conv.last_message" class="text-xs text-muted-foreground truncate">
              {{ conv.last_message.body }}
            </p>
            <p v-else class="text-xs text-muted-foreground">
              No messages yet
            </p>
          </div>
          <span
            v-if="conv.unread_count > 0"
            class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground"
          >
            {{ conv.unread_count }}
          </span>
        </NuxtLink>
      </CardContent>
    </Card>
  </div>
</template>

