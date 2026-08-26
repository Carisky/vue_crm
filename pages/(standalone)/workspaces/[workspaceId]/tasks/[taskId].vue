<script setup lang="ts">
import { useQuery, useQueryClient } from "@tanstack/vue-query";

import type {
  CreateTaskInject,
  DeleteTaskInject,
  FilteredTask,
  UpdateTaskInject,
} from "~/lib/types";
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

const { data, isLoading, isRefetching, suspense } = useQuery<{
  task: FilteredTask;
  subtasks: FilteredTask[];
}>({
  queryKey: taskQueryKey,
  queryFn: async () => {
    const data = await requestFetch<{
      task: FilteredTask;
      subtasks: FilteredTask[];
    }>(`/api/tasks/${taskId.value}`);
    return data;
  },
  staleTime: Infinity,
  experimental_prefetchInRender: true,
});

const task = computed(() => data.value?.task);
const subtasks = computed(() => data.value?.subtasks ?? []);
const { open: openCreateTask } = useCreateTaskModal();
const { t } = useAppI18n();
const pageTitle = computed(() => task.value?.name ?? "Task");
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
  async () => {
    await queryClient.refetchQueries({ queryKey: taskQueryKey.value });
  },
);

const createTaskInject: CreateTaskInject | undefined =
  inject("create-task-inject");
const unsubscribeCreateSuccess = createTaskInject?.subscribeToCreateTaskSuccess(
  async (createdTask) => {
    if (createdTask.parent_id === taskId.value) {
      await queryClient.refetchQueries({ queryKey: taskQueryKey.value });
    }
  },
);

const deleteTaskInject: DeleteTaskInject | undefined =
  inject("delete-task-inject");
const unsubscribeDeleteSuccess = deleteTaskInject?.subscribeToDeleteTaskSuccess(
  async () => {
    await queryClient.refetchQueries({ queryKey: taskQueryKey.value });
  },
);

onUnmounted(() => {
  unsubscribeUpdateSuccess?.();
  unsubscribeCreateSuccess?.();
  unsubscribeDeleteSuccess?.();
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
    <Card class="mt-4 gap-4 p-5">
      <div
        class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <CardTitle class="text-lg">{{ t("task.subtasks") }}</CardTitle>
          <p class="mt-1 text-sm text-muted-foreground">
            {{ t("task.progressDescription") }}
          </p>
        </div>
        <Button size="sm" @click="openCreateTask(undefined, task.$id)">
          <Icon name="lucide:list-plus" class="size-4" />
          {{ t("task.createSubtask") }}
        </Button>
      </div>
      <ProgressBar
        :value="task.progress"
        :completed="task.completed_subtasks"
        :total="task.total_subtasks"
      />
      <div v-if="subtasks.length" class="divide-y rounded-md border">
        <NuxtLink
          v-for="subtask in subtasks"
          :key="subtask.$id"
          :href="`/workspaces/${route.params['workspaceId']}/tasks/${subtask.$id}`"
          class="flex items-center gap-3 p-3 transition hover:bg-muted/40"
        >
          <Icon
            name="lucide:corner-down-right"
            class="size-4 shrink-0 text-muted-foreground"
          />
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-3">
              <span class="truncate text-sm font-medium">{{
                subtask.name
              }}</span>
              <span class="text-xs text-muted-foreground tabular-nums"
                >{{ subtask.progress }}%</span
              >
            </div>
            <ProgressBar
              :value="subtask.progress"
              :completed="subtask.completed_subtasks"
              :total="subtask.total_subtasks"
              compact
            />
          </div>
          <Icon
            name="lucide:chevron-right"
            class="size-4 shrink-0 text-muted-foreground"
          />
        </NuxtLink>
      </div>
      <p
        v-else
        class="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground"
      >
        {{ t("task.noSubtasks") }}
      </p>
    </Card>
    <div class="mt-4">
      <TaskComments :task="task" />
    </div>
  </div>
</template>
