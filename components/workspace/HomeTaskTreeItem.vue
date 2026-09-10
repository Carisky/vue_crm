<script setup lang="ts">
import { formatDistanceToNow } from "date-fns";
import { enUS, pl, ru } from "date-fns/locale";
import { taskPriorityTranslationKeys } from "~/lib/i18n";
import type { FilteredTask } from "~/lib/types";

defineOptions({ name: "WorkspaceHomeTaskTreeItem" });

const props = defineProps<{
  task: FilteredTask;
  tasks: FilteredTask[];
  depth?: number;
}>();

const { locale, t } = useAppI18n();
const dateLocales = { en: enUS, pl, ru };
const expanded = ref(true);
const depth = computed(() => props.depth ?? 0);
const children = computed(() =>
  props.tasks.filter((task) => task.parent_id === props.task.$id),
);
</script>

<template>
  <li>
    <div class="relative" :style="{ paddingLeft: `${depth * 20}px` }">
      <span
        v-if="depth > 0"
        aria-hidden="true"
        class="pointer-events-none absolute top-0 bottom-0 w-px bg-border"
        :style="{ left: `${depth * 20 - 10}px` }"
      />
      <NuxtLink
        :href="`/workspaces/${task.workspace_id}/tasks/${task.$id}`"
        class="grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 px-4 py-2 transition hover:bg-muted/60"
      >
        <button
          v-if="children.length"
          type="button"
          class="flex size-5 shrink-0 items-center justify-center rounded hover:bg-muted"
          :aria-expanded="expanded"
          :aria-label="task.name"
          @click.prevent.stop="expanded = !expanded"
        >
          <Icon
            :name="expanded ? 'lucide:chevron-down' : 'lucide:chevron-right'"
            class="size-4"
          />
        </button>
        <span v-else class="w-5 shrink-0" />
        <div class="min-w-0">
          <div class="flex min-w-0 items-center gap-1.5">
            <p
              class="truncate text-sm"
              :class="depth === 0 ? 'font-semibold' : 'font-medium'"
            >
              {{ task.name }}
            </p>
            <span
              v-if="children.length"
              class="shrink-0 text-xs text-muted-foreground"
              >{{ children.length }}</span
            >
          </div>
          <div
            class="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span class="truncate">{{ task.project?.name ?? "" }}</span>
            <span>·</span>
            <Icon name="lucide:calendar" class="size-3 shrink-0" />
            <span class="truncate">
              {{
                task.due_date
                  ? formatDistanceToNow(task.due_date, {
                      locale: dateLocales[locale],
                    })
                  : t("task.noDueDate")
              }}
            </span>
          </div>
        </div>
        <Badge :variant="task.priority" class="text-[10px]">{{
          t(taskPriorityTranslationKeys[task.priority])
        }}</Badge>
      </NuxtLink>
    </div>
    <ul v-if="expanded && children.length">
      <WorkspaceHomeTaskTreeItem
        v-for="child in children"
        :key="child.$id"
        :task="child"
        :tasks="tasks"
        :depth="depth + 1"
      />
    </ul>
  </li>
</template>
