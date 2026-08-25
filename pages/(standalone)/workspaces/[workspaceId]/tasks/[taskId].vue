<script setup lang="ts">
import { useQuery, useQueryClient } from "@tanstack/vue-query";

import type { FilteredTask, UpdateTaskInject } from "~/lib/types";
import authenticatedPageProtectMiddleware from "~/middleware/page-protect/authenticatedPage";

definePageMeta({
  layout: "dashboard",
  middleware: [authenticatedPageProtectMiddleware],
});

const route = useRoute();
const queryClient = useQueryClient();
const requestFetch = useRequestFetch();
const taskId = computed(() => String(route.params["taskId"] ?? ""));
const taskQueryKey = computed(() => ["task", taskId.value]);

const {
  data: task,
  isLoading,
  isRefetching,
  suspense,
} = useQuery<FilteredTask>({
  queryKey: taskQueryKey,
  queryFn: async () => {
    const data = await requestFetch<{ task: FilteredTask }>(
      `/api/tasks/${taskId.value}`,
    );
    return data.task;
  },
  staleTime: Infinity,
  experimental_prefetchInRender: true,
});

const pageTitle = computed(() => task?.value?.name ?? "Task");
useHead({
  title: pageTitle,
});

onServerPrefetch(async () => {
  await suspense();
});

// Listen to event of updating task via update-task modal
const updateTaskInject: UpdateTaskInject | undefined =
  inject("update-task-inject");
const unsubscribeUpdateSuccess = updateTaskInject?.subscribeToUpdateTaskSuccess(
  async (task: FilteredTask) => {
    await queryClient.refetchQueries({ queryKey: ["task", task.$id] });
  },
);

onUnmounted(() => {
  unsubscribeUpdateSuccess?.();
});
</script>

<template>
  <Loader v-if="isLoading && !isRefetching" class="h-96 min-h-auto" />
  <!-- <div v-else-if="!task" class="h-96 flex flex-col items-center justify-center gap-2">
        <Icon name="lucide:triangle-alert" size="24px" class="size-6 text-muted-foreground" />
        <p class="text-sm font-medium text-muted-foreground">
            Task not found
        </p>
    </div> -->
  <div v-else-if="task" class="flex flex-col">
    <TaskBreadcrumbs :project="task.project" :task="task" />
    <DottedSeparator class="my-6" />
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <TaskOverview :task="task" />
      <TaskDescription :task="task" />
    </div>
    <div class="mt-4">
      <TaskComments :task="task" />
    </div>
  </div>
</template>
