<script setup lang="ts">
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import type { Notification } from "~/lib/types";

type NotificationFilter = "all" | "unread";

const route = useRoute();
const router = useRouter();
const workspaceId = computed(() => route.params["workspaceId"]);
const sheetOpen = ref(false);
const filter = ref<NotificationFilter>("all");
const markingAll = ref(false);
const markingIds = ref(new Set<string>());
const queryClient = useQueryClient();
const requestFetch = useRequestFetch();
const { locale, t } = useAppI18n();
const queryKey = computed(() => [
  "notifications",
  workspaceId.value ?? "global",
]);

const { data, isFetching } = useQuery({
  queryKey,
  queryFn: async () => {
    if (!workspaceId.value) return { notifications: [], unreadCount: 0 };
    return await requestFetch<{
      notifications: Notification[];
      unreadCount: number;
    }>(
      `/api/notifications?workspace_id=${workspaceId.value}&exclude_types=TASK_COMMENT_MENTION`,
    );
  },
  enabled: computed(() => !!workspaceId.value),
});

const unreadCount = computed(() => data.value?.unreadCount ?? 0);
const notifications = computed(() => data.value?.notifications ?? []);
const visibleNotifications = computed(() =>
  filter.value === "unread"
    ? notifications.value.filter((notification) => !notification.isRead)
    : notifications.value,
);
const filterOptions = computed(() => [
  {
    value: "all" as const,
    label: t("notifications.all"),
    count: notifications.value.length,
  },
  {
    value: "unread" as const,
    label: t("notifications.unread"),
    count: unreadCount.value,
  },
]);

const formatTimestamp = (value: string) =>
  new Date(value).toLocaleString(locale.value, {
    dateStyle: "medium",
    timeStyle: "short",
  });

const notificationAppearance = (type: string) => {
  if (type.includes("COMMENT")) {
    return {
      icon: "lucide:message-square-text",
      class: "bg-blue-500/10 text-blue-600",
    };
  }
  if (type.includes("STATUS")) {
    return {
      icon: "lucide:circle-check-big",
      class: "bg-emerald-500/10 text-emerald-600",
    };
  }
  if (type.includes("PRIORITY")) {
    return { icon: "lucide:flame", class: "bg-orange-500/10 text-orange-600" };
  }
  if (type.includes("CREATED")) {
    return {
      icon: "lucide:list-plus",
      class: "bg-violet-500/10 text-violet-600",
    };
  }
  return { icon: "lucide:bell-ring", class: "bg-primary/10 text-primary" };
};

const refreshNotifications = () =>
  queryClient.invalidateQueries({ queryKey: queryKey.value });

const markAllRead = async () => {
  if (!workspaceId.value || !unreadCount.value || markingAll.value) return;
  markingAll.value = true;
  try {
    await $fetch("/api/notifications/mark-read", {
      method: "PATCH",
      body: { workspaceId: workspaceId.value },
    });
    await refreshNotifications();
  } finally {
    markingAll.value = false;
  }
};

const markNotificationRead = async (notification: Notification) => {
  if (notification.isRead || markingIds.value.has(notification.id)) return;
  markingIds.value = new Set(markingIds.value).add(notification.id);
  try {
    await $fetch("/api/notifications/mark-read", {
      method: "PATCH",
      body: { ids: [notification.id] },
    });
    await refreshNotifications();
  } finally {
    const next = new Set(markingIds.value);
    next.delete(notification.id);
    markingIds.value = next;
  }
};

const handleNotificationClick = async (notification: Notification) => {
  if (!workspaceId.value) return;
  sheetOpen.value = false;
  if (!notification.isRead) await markNotificationRead(notification);

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
      <Button
        variant="ghost"
        size="icon"
        class="relative"
        :aria-label="t('notifications.title')"
      >
        <Icon name="lucide:bell" class="size-4 text-muted-foreground" />
        <span
          v-if="unreadCount > 0"
          class="absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-white shadow-sm ring-2 ring-background"
        >
          {{ unreadCount > 99 ? "99+" : unreadCount }}
        </span>
      </Button>
    </SheetTrigger>

    <SheetContent
      side="right"
      class="flex w-full flex-col gap-0 p-0 sm:max-w-[430px]"
    >
      <SheetHeader class="border-b bg-muted/20 px-5 pt-5 pb-4 text-left">
        <div class="flex items-start justify-between gap-3 pr-8">
          <div class="flex min-w-0 items-center gap-3">
            <span
              class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
            >
              <Icon name="lucide:bell-ring" class="size-5" />
            </span>
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <SheetTitle>{{ t("notifications.title") }}</SheetTitle>
                <Badge
                  v-if="unreadCount"
                  variant="destructive"
                  class="rounded-full px-1.5"
                >
                  {{ unreadCount }}
                </Badge>
              </div>
              <SheetDescription class="mt-0.5 line-clamp-1">
                {{ t("notifications.description") }}
              </SheetDescription>
            </div>
          </div>
        </div>

        <div class="mt-4 flex items-center justify-between gap-3">
          <div class="flex rounded-lg bg-muted p-1">
            <button
              v-for="item in filterOptions"
              :key="item.value"
              type="button"
              class="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition"
              :class="
                filter === item.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              "
              @click="filter = item.value"
            >
              {{ item.label }}
              <span class="tabular-nums opacity-70">{{ item.count }}</span>
            </button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            :disabled="!unreadCount || markingAll"
            class="h-8 gap-1.5 px-2 text-xs"
            @click="markAllRead"
          >
            <Icon name="lucide:check-check" class="size-4" />
            {{ t("notifications.markAllRead") }}
          </Button>
        </div>
      </SheetHeader>

      <div class="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <Loader v-if="isFetching && !notifications.length" class="h-32" />
        <div
          v-else-if="!visibleNotifications.length"
          class="flex min-h-64 flex-col items-center justify-center px-8 text-center"
        >
          <span
            class="mb-3 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
          >
            <Icon
              :name="
                filter === 'unread' ? 'lucide:check-check' : 'lucide:bell-off'
              "
              class="size-6"
            />
          </span>
          <p class="text-sm font-medium">{{ t("notifications.empty") }}</p>
          <p
            v-if="filter === 'unread'"
            class="mt-1 text-xs text-muted-foreground"
          >
            {{ t("notifications.allRead") }}
          </p>
        </div>
        <div v-else class="space-y-2">
          <article
            v-for="notification in visibleNotifications"
            :key="notification.id"
            class="group relative flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 text-left transition hover:border-primary/35 hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            :class="
              notification.isRead
                ? 'border-border/60 bg-background'
                : 'border-primary/20 bg-primary/[0.035]'
            "
            role="button"
            tabindex="0"
            @click="handleNotificationClick(notification)"
            @keydown.enter.stop.prevent="handleNotificationClick(notification)"
            @keydown.space.stop.prevent="handleNotificationClick(notification)"
          >
            <span
              class="flex size-9 shrink-0 items-center justify-center rounded-lg"
              :class="notificationAppearance(notification.type).class"
            >
              <Icon
                :name="notificationAppearance(notification.type).icon"
                class="size-4.5"
              />
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex items-start gap-2">
                <p
                  class="line-clamp-2 flex-1 text-sm leading-snug"
                  :class="notification.isRead ? 'font-medium' : 'font-semibold'"
                >
                  {{ notification.message ?? t("notifications.newUpdate") }}
                </p>
                <span
                  v-if="!notification.isRead"
                  class="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                />
              </div>
              <p class="mt-1 truncate text-xs text-muted-foreground">
                <Icon name="lucide:folder" class="mr-1 inline size-3" />
                {{ notification.projectName ?? t("common.workspace") }}
                <span v-if="notification.taskName">
                  / {{ notification.taskName }}</span
                >
              </p>
              <div
                class="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground"
              >
                <span class="min-w-0 truncate">
                  <Icon name="lucide:user-round" class="mr-1 inline size-3" />
                  {{ notification.actorName ?? t("common.system") }}
                </span>
                <span class="shrink-0">{{
                  formatTimestamp(notification.createdAt)
                }}</span>
              </div>
            </div>
            <Button
              v-if="!notification.isRead"
              variant="ghost"
              size="icon"
              class="absolute top-1 right-1 size-7 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100"
              :disabled="markingIds.has(notification.id)"
              :title="t('notifications.markRead')"
              @click.stop="markNotificationRead(notification)"
            >
              <Icon name="lucide:check" class="size-4" />
            </Button>
          </article>
        </div>
      </div>

      <SheetFooter
        class="flex-row items-center justify-between border-t bg-muted/20 px-5 py-3 text-xs text-muted-foreground"
      >
        <span>{{ t("notifications.activity") }}</span>
        <span class="tabular-nums">{{ notifications.length }} / 50</span>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>
