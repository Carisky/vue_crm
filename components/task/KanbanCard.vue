<script setup lang="ts">
import { taskPriorityLabels, type FilteredTask } from "~/lib/types";

const { task } = defineProps<{ task: FilteredTask }>();
</script>

<template>
  <div
    class="mb-1.5 space-y-3 rounded border border-border bg-card p-2.5 text-card-foreground shadow-sm"
  >
    <div class="flex items-start justify-between gap-x-2">
      <p class="line-clamp-2 text-sm">{{ task.name }}</p>
      <TaskActions
        :task-id="task.$id"
        :name="task.name"
        :project-id="task.project_id"
      >
        <Icon
          name="lucide:ellipsis"
          size="18px"
          class="size-[18px] shrink-0 stroke-1 text-neutral-700 transition hover:opacity-75"
        />
      </TaskActions>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <Badge :variant="task.priority" class="text-[10px]">
        {{ taskPriorityLabels[task.priority] }}
      </Badge>
    </div>
    <ProgressBar
      :value="task.progress"
      :completed="task.completed_subtasks"
      :total="task.total_subtasks"
      compact
    />
    <DottedSeparator />
    <div class="flex items-center gap-x-1.5">
      <WorkspaceGroupAvatar
        v-if="task.assignee_group"
        :name="task.assignee_group.name"
        :color="task.assignee_group.color"
        class="size-7"
      />
      <WorkspaceMemberAvatar
        v-else
        :name="task.assignee?.name ?? 'Unassigned'"
        fallback-class="text-[10px]"
      />
      <span
        v-if="task.assignee_group"
        class="max-w-28 truncate text-xs font-medium"
        >{{ task.assignee_group.name }}</span
      >
      <div class="size-1 rounded-full bg-neutral-300"></div>
      <TaskDate :value="task.due_date" class="text-xs" />
    </div>
    <div class="flex items-center gap-x-1.5">
      <ProjectAvatar
        :name="task.project?.name ?? 'No project'"
        :image="task.project?.image_url ?? undefined"
        fallback-class="text-[10px]"
      />
      <span class="text-xs font-medium">{{
        task.project?.name ?? "No project"
      }}</span>
    </div>
  </div>
</template>
