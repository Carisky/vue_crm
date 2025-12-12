<script setup lang="ts">
import { computed, ref } from 'vue';
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
import type { Notification } from '~/lib/types';

const route = useRoute();
const router = useRouter();

const workspaceId = computed(() => route.params['workspaceId']);
const sheetOpen = ref(false);
const queryClient = useQueryClient();
const queryKey = computed(() => ['notifications', workspaceId.value ?? 'global']);

const { data, isFetching } = useQuery({
  queryKey,
  queryFn: async () => {
    if (!workspaceId.value) {
      return { notifications: [], unreadCount: 0 };
    }
    const response = await $fetch<{
      notifications: Notification[];
      unreadCount: number;
    }>(`/api/notifications?workspace_id=${workspaceId.value}`);
    return response;
  },
  enabled: computed(() => !!workspaceId.value),
});

const unreadCount = computed(() => data.value?.unreadCount ?? 0);
const notifications = computed(() => data.value?.notifications ?? []);
const formatTimestamp = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
const formatEstimatedTime = (value?: number | null) => {
  if (value == null) return 'No estimate';
  const hours = Number(value);
  if (!Number.isFinite(hours)) return 'No estimate';
  const formatted = Number.isInteger(hours) ? hours.toString() : hours.toFixed(1);
  return `${formatted}h`;
};

const markAllRead = async () => {
  if (!workspaceId.value || !unreadCount.value) return;

  await $fetch('/api/notifications/mark-read', {
    method: 'PATCH',
    body: {
      workspaceId: workspaceId.value,
    },
  });
  queryClient.invalidateQueries({ queryKey: queryKey.value });
};
const markNotificationRead = async (notification: Notification) => {
  if (notification.isRead) return;

  await $fetch('/api/notifications/mark-read', {
    method: 'PATCH',
    body: {
      ids: [notification.id],
    },
  });
  queryClient.invalidateQueries({ queryKey: queryKey.value });
};

const handleNotificationClick = async (notification: Notification) => {
  if (!workspaceId.value) return;
  sheetOpen.value = false;

  const queryParams: Record<string, string> = {};
  if (notification.projectId) queryParams.projectId = notification.projectId;
  if (notification.taskId) queryParams.taskId = notification.taskId;

  await router.push({
    path: notification.taskId
      ? `/workspaces/${workspaceId.value}/tasks/${notification.taskId}`
      : `/workspaces/${workspaceId.value}/tasks`,
    query: notification.taskId ? {} : queryParams,
  });
};
</script>

<template>
  <Sheet v-model:open="sheetOpen">
    <SheetTrigger as-child>
      <Button variant="ghost" size="icon" class="relative">
        <Icon name="heroicons:bell" size="16px" class="size-4 text-muted-foreground" />
        <span
          v-if="unreadCount > 0"
          class="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[11px] text-white"
        >
          {{ unreadCount }}
        </span>
      </Button>
    </SheetTrigger>
    <SheetContent side="right" class="w-[260px] sm:w-[340px]">
      <SheetHeader class="gap-2">
        <div class="flex items-center gap-2">
          <SheetTitle>Notifications</SheetTitle>
          <Button
            variant="outline"
            size="xs"
            :disabled="!unreadCount"
            class="capitalize text-[11px]"
            @click="markAllRead"
          >
            Mark all read
          </Button>
        </div>
        <SheetDescription>Stay in sync with workspace activity</SheetDescription>
      </SheetHeader>

      <div class="mt-4 space-y-3">
        <Loader v-if="isFetching" class="h-24" />
        <div v-else-if="!notifications.length" class="text-sm text-muted-foreground">
          No new notifications yet.
        </div>
        <div v-else class="flex flex-col gap-2">
          <article
            v-for="notification in notifications"
            :key="notification.id"
            class="flex items-start gap-3 rounded-2xl border border-border/70 bg-background/90 px-3 py-2 text-left transition hover:border-primary/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary cursor-pointer"
            role="button"
            tabindex="0"
            @click="handleNotificationClick(notification)"
            @keydown.enter.stop.prevent="handleNotificationClick(notification)"
            @keydown.space.stop.prevent="handleNotificationClick(notification)"
          >
            <span class="mt-1">
              <Icon
                :name="notification.isRead ? 'heroicons:check-circle' : 'heroicons:circle'"
                size="18px"
                :class="notification.isRead ? 'text-muted-foreground' : 'text-primary'"
              />
            </span>
            <div class="flex-1 space-y-0.5">
              <div class="flex items-center justify-between gap-2">
                <p class="text-sm font-semibold text-foreground leading-tight">
                  {{ notification.message ?? 'New update' }}
                </p>
                <div class="flex items-center gap-2">
                  <span class="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    {{ notification.isRead ? 'Read' : 'Unread' }}
                  </span>
                  <button
                    v-if="!notification.isRead"
                    type="button"
                    class="rounded-full border border-primary/70 px-3 py-0.5 text-[10px] font-semibold text-primary transition hover:bg-primary/10"
                    @click.stop="markNotificationRead(notification)"
                  >
                    Mark read
                  </button>
                </div>
              </div>
              <p class="text-xs text-muted-foreground">
                {{ notification.projectName ?? 'Workspace' }} / {{ notification.taskName ?? 'Task' }}
              </p>
              <p class="text-xs text-muted-foreground">
                Estimated {{ formatEstimatedTime(notification.taskEstimatedHours) }}
              </p>
              <p class="text-[10px] text-muted-foreground">
                {{ notification.actorName ?? 'System' }} · {{ formatTimestamp(notification.createdAt) }}
              </p>
            </div>
          </article>
        </div>
      </div>

      <SheetFooter class="mt-6">
        <span class="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Workspace activity
        </span>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>
