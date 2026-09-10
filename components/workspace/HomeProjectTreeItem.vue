<script setup lang="ts">
import type { Project } from "~/lib/types";

defineOptions({ name: "WorkspaceHomeProjectTreeItem" });

const props = defineProps<{
  project: Project;
  projects: Project[];
  depth?: number;
}>();

const { t } = useAppI18n();
const expanded = ref(true);
const depth = computed(() => props.depth ?? 0);
const children = computed(() =>
  props.projects.filter((project) => project.parent_id === props.project.$id),
);
</script>

<template>
  <li>
    <div class="relative" :style="{ paddingLeft: `${depth * 18}px` }">
      <span
        v-if="depth > 0"
        aria-hidden="true"
        class="pointer-events-none absolute top-0 bottom-0 w-px bg-border"
        :style="{ left: `${depth * 18 - 9}px` }"
      />
      <NuxtLink
        :href="`/workspaces/${project.workspace_id}/projects/${project.$id}`"
        class="flex min-h-11 items-center gap-2 px-4 py-1.5 transition hover:bg-muted/60"
      >
        <button
          v-if="children.length"
          type="button"
          class="flex size-5 shrink-0 items-center justify-center rounded hover:bg-muted"
          :aria-expanded="expanded"
          :aria-label="project.name"
          @click.prevent.stop="expanded = !expanded"
        >
          <Icon
            :name="expanded ? 'lucide:chevron-down' : 'lucide:chevron-right'"
            class="size-4"
          />
        </button>
        <span v-else class="w-5 shrink-0" />
        <ProjectAvatar
          :name="project.name"
          :image="project.image_url ?? undefined"
          class="size-7 shrink-0"
        />
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 items-center gap-1.5">
            <p
              class="truncate text-sm"
              :class="depth === 0 ? 'font-semibold' : 'font-medium'"
            >
              {{ project.name }}
            </p>
            <span
              v-if="children.length"
              class="shrink-0 text-xs text-muted-foreground"
              >{{ children.length }}</span
            >
          </div>
          <ProgressBar
            :value="project.progress"
            :completed="project.completed_tasks"
            :total="project.total_tasks"
            compact
          />
        </div>
        <Icon
          v-if="project.is_effectively_restricted"
          name="lucide:lock"
          class="size-4 shrink-0 text-muted-foreground"
          :title="t('project.private')"
          :aria-label="t('project.private')"
        />
      </NuxtLink>
    </div>
    <ul v-if="expanded && children.length">
      <WorkspaceHomeProjectTreeItem
        v-for="child in children"
        :key="child.$id"
        :project="child"
        :projects="projects"
        :depth="depth + 1"
      />
    </ul>
  </li>
</template>
