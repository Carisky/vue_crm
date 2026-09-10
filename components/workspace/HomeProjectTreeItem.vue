<script setup lang="ts">
import type { Project } from "~/lib/types";

defineOptions({ name: "WorkspaceHomeProjectTreeItem" });

const props = defineProps<{
  project: Project;
  projects: Project[];
  depth?: number;
  isLast?: boolean;
}>();

const { t } = useAppI18n();
const expanded = ref(true);
const depth = computed(() => props.depth ?? 0);
const children = computed(() =>
  props.projects.filter((project) => project.parent_id === props.project.$id),
);
</script>

<template>
  <li :class="depth === 0 ? 'border-b border-border/70 last:border-b-0' : ''">
    <div class="relative" :style="{ paddingLeft: `${depth * 18}px` }">
      <span
        v-if="depth > 0"
        aria-hidden="true"
        class="pointer-events-none absolute top-0 w-px bg-primary/25"
        :class="isLast ? 'h-1/2' : 'bottom-0'"
        :style="{ left: `${depth * 18 - 9}px` }"
      />
      <span
        v-if="depth > 0"
        aria-hidden="true"
        class="pointer-events-none absolute top-1/2 h-px bg-primary/25"
        :style="{ left: `${depth * 18 - 9}px`, width: '9px' }"
      />
      <NuxtLink
        :href="`/workspaces/${project.workspace_id}/projects/${project.$id}`"
        class="flex min-h-11 items-center gap-2 rounded-md px-3 py-1.5 transition hover:bg-muted/70"
        :class="children.length ? 'bg-primary/[0.045]' : ''"
      >
        <button
          v-if="children.length"
          type="button"
          class="flex size-6 shrink-0 items-center justify-center rounded-md border border-primary/15 bg-primary/10 text-primary transition hover:bg-primary/20"
          :aria-expanded="expanded"
          :aria-label="project.name"
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
        <ProjectAvatar
          :name="project.name"
          :image="project.image_url ?? undefined"
          class="size-7 shrink-0"
        />
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 items-center gap-1.5">
            <Icon
              v-if="children.length"
              name="lucide:folder-tree"
              class="size-3.5 shrink-0 text-primary"
            />
            <p
              class="truncate text-sm"
              :class="depth === 0 ? 'font-semibold' : 'font-medium'"
            >
              {{ project.name }}
            </p>
            <span
              v-if="children.length"
              class="inline-flex shrink-0 items-center gap-1 rounded-full border bg-background px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground shadow-sm"
            >
              <Icon name="lucide:git-branch" class="size-2.5" />
              {{ children.length }}
            </span>
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
    <ul v-if="expanded && children.length" class="pb-1">
      <WorkspaceHomeProjectTreeItem
        v-for="(child, index) in children"
        :key="child.$id"
        :project="child"
        :projects="projects"
        :depth="depth + 1"
        :is-last="index === children.length - 1"
      />
    </ul>
  </li>
</template>
