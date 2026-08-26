<script setup lang="ts">
import type { Project } from "~/lib/types";

defineOptions({ name: "ProjectTreeItem" });

const props = defineProps<{
  project: Project;
  projects: Project[];
  workspaceId: string;
  depth?: number;
}>();

const { open } = useCreateProjectModal();
const { t } = useAppI18n();
const expanded = ref(true);
const children = computed(() =>
  props.projects.filter((project) => project.parent_id === props.project.$id),
);
</script>

<template>
  <div>
    <div
      class="group relative"
      :style="{ paddingLeft: `${(depth ?? 0) * 14}px` }"
    >
      <div
        v-if="(depth ?? 0) > 0"
        class="pointer-events-none absolute top-0 bottom-1/2 left-0 w-px bg-sidebar-border"
        :style="{ marginLeft: `${(depth ?? 0) * 14 - 7}px` }"
      />
      <NuxtLink
        :href="`/workspaces/${workspaceId}/projects/${project.$id}`"
        active-class="bg-sidebar-primary/15 text-sidebar-foreground shadow-sm"
        class="flex min-w-0 items-center gap-2 rounded-md px-2 py-2 text-sidebar-foreground transition hover:bg-sidebar-primary/5 hover:text-sidebar-primary"
      >
        <button
          v-if="children.length"
          type="button"
          class="flex size-4 shrink-0 items-center justify-center"
          @click.prevent.stop="expanded = !expanded"
        >
          <Icon
            :name="expanded ? 'lucide:chevron-down' : 'lucide:chevron-right'"
            class="size-3.5"
          />
        </button>
        <span v-else class="w-4 shrink-0" />
        <ProjectAvatar
          :name="project.name"
          :image="project.image_url ?? undefined"
          class="size-7 shrink-0"
        />
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 items-center gap-1">
            <span class="truncate text-sm">{{ project.name }}</span>
            <button
              type="button"
              :title="t('project.createSubproject')"
              class="ml-auto hidden size-5 shrink-0 items-center justify-center rounded group-hover:flex hover:bg-sidebar-primary/10"
              @click.prevent.stop="open(project.$id)"
            >
              <Icon name="lucide:git-branch-plus" class="size-3.5" />
            </button>
          </div>
          <ProgressBar
            :value="project.progress"
            :completed="project.completed_tasks"
            :total="project.total_tasks"
            compact
          />
        </div>
      </NuxtLink>
    </div>
    <div v-if="expanded && children.length">
      <ProjectTreeItem
        v-for="child in children"
        :key="child.$id"
        :project="child"
        :projects="projects"
        :workspace-id="workspaceId"
        :depth="(depth ?? 0) + 1"
      />
    </div>
  </div>
</template>
