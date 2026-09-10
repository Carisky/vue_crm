<script setup lang="ts">
import type { FilteredTask } from "~/lib/types";

const { tasks, total } = defineProps<{
  tasks: FilteredTask[];
  total: number;
}>();

const route = useRoute();
const { open: openTaskModal } = useCreateTaskModal();
const { t } = useAppI18n();
const rootTasks = computed(() => {
  const ids = new Set(tasks.map((task) => task.$id));
  return tasks.filter((task) => !task.parent_id || !ids.has(task.parent_id));
});
</script>

<template>
  <section
    class="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card"
  >
    <div class="flex h-12 shrink-0 items-center justify-between border-b px-4">
      <p class="flex items-center gap-2 font-semibold">
        <Icon name="lucide:list-tree" class="size-4 text-primary" />
        {{ t("task.total") }}
        <span class="text-muted-foreground">{{ total }}</span>
      </p>
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        @click="openTaskModal('1')"
      >
        <Icon name="lucide:plus" class="size-4 text-muted-foreground" />
      </Button>
    </div>
    <ul class="min-h-0 flex-1 overflow-y-auto px-1.5 py-1">
      <WorkspaceHomeTaskTreeItem
        v-for="task in rootTasks"
        :key="task.$id"
        :task="task"
        :tasks="tasks"
      />
      <li
        v-if="!tasks.length"
        class="p-4 text-center text-sm text-muted-foreground"
      >
        {{ t("task.noneFound") }}
      </li>
    </ul>
    <Button
      variant="ghost"
      class="h-10 shrink-0 rounded-none border-t"
      :as-child="true"
    >
      <NuxtLink :href="`/workspaces/${route.params['workspaceId']}/tasks`">
        {{ t("task.showAll") }} · {{ total }}
      </NuxtLink>
    </Button>
  </section>
</template>
