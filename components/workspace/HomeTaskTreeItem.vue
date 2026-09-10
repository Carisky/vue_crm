<script setup lang="ts">
import { formatDistanceToNow } from "date-fns";
import { enUS, pl, ru } from "date-fns/locale";
import {
  taskPriorityTranslationKeys,
  taskStatusTranslationKeys,
} from "~/lib/i18n";
import type { FilteredTask } from "~/lib/types";

defineOptions({ name: "WorkspaceHomeTaskTreeItem" });

const props = defineProps<{
  task: FilteredTask;
  tasks: FilteredTask[];
  depth?: number;
  isLast?: boolean;
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
  <li :class="depth === 0 ? 'border-b border-border/70 last:border-b-0' : ''">
    <div class="relative" :style="{ paddingLeft: `${depth * 20}px` }">
      <span
        v-if="depth > 0"
        aria-hidden="true"
        class="pointer-events-none absolute top-0 w-px bg-primary/25"
        :class="isLast ? 'h-1/2' : 'bottom-0'"
        :style="{ left: `${depth * 20 - 10}px` }"
      />
      <span
        v-if="depth > 0"
        aria-hidden="true"
        class="pointer-events-none absolute top-1/2 h-px bg-primary/25"
        :style="{ left: `${depth * 20 - 10}px`, width: '10px' }"
      />
      <NuxtLink
        :href="`/workspaces/${task.workspace_id}/tasks/${task.$id}`"
        class="grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 rounded-md px-3 py-2 transition hover:bg-muted/70"
        :class="children.length ? 'bg-primary/[0.045]' : ''"
      >
        <button
          v-if="children.length"
          type="button"
          class="flex size-6 shrink-0 items-center justify-center rounded-md border border-primary/15 bg-primary/10 text-primary transition hover:bg-primary/20"
          :aria-expanded="expanded"
          :aria-label="task.name"
          @click.prevent.stop="expanded = !expanded"
        >
          <Icon
            :name="expanded ? 'lucide:chevron-down' : 'lucide:chevron-right'"
            class="size-4"
          />
        </button>
        <Icon
          v-else-if="depth > 0"
          name="lucide:corner-down-right"
          class="size-5 shrink-0 text-primary/45"
        />
        <span v-else class="w-6 shrink-0" />
        <div class="min-w-0">
          <div class="flex min-w-0 items-center gap-1.5">
            <Icon
              v-if="children.length"
              name="lucide:list-tree"
              class="size-3.5 shrink-0 text-primary"
            />
            <p
              class="truncate text-sm"
              :class="depth === 0 ? 'font-semibold' : 'font-medium'"
            >
              {{ task.name }}
            </p>
            <span
              v-if="children.length"
              class="inline-flex shrink-0 items-center gap-1 rounded-full border bg-background px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground shadow-sm"
            >
              <Icon name="lucide:list-plus" class="size-2.5" />
              {{ children.length }}
            </span>
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
        <div
          class="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center"
        >
          <Badge :variant="task.status" class="text-[10px]">
            {{ t(taskStatusTranslationKeys[task.status]) }}
          </Badge>
          <Badge :variant="task.priority" class="text-[10px]">
            {{ t(taskPriorityTranslationKeys[task.priority]) }}
          </Badge>
        </div>
      </NuxtLink>
    </div>
    <ul v-if="expanded && children.length" class="pb-1">
      <WorkspaceHomeTaskTreeItem
        v-for="(child, index) in children"
        :key="child.$id"
        :task="child"
        :tasks="tasks"
        :depth="depth + 1"
        :is-last="index === children.length - 1"
      />
    </ul>
  </li>
</template>
