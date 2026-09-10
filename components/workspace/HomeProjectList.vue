<script setup lang="ts">
import type { Project } from "~/lib/types";

const { projects, total } = defineProps<{
  projects: Project[];
  total: number;
}>();

const { open: openProjectModal } = useCreateProjectModal();
const { t } = useAppI18n();
const rootProjects = computed(() => {
  const ids = new Set(projects.map((project) => project.$id));
  return projects.filter(
    (project) => !project.parent_id || !ids.has(project.parent_id),
  );
});
</script>

<template>
  <section
    class="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card text-card-foreground"
  >
    <div class="flex h-12 shrink-0 items-center justify-between border-b px-4">
      <p class="flex items-center gap-2 font-semibold">
        <Icon name="lucide:folder-tree" class="size-4 text-primary" />
        {{ t("nav.projects") }}
        <span class="text-muted-foreground">{{ total }}</span>
      </p>
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        @click="() => openProjectModal()"
      >
        <Icon
          name="lucide:plus"
          size="16px"
          class="size-4 text-muted-foreground"
        />
      </Button>
    </div>
    <ul class="min-h-0 flex-1 overflow-y-auto px-1.5 py-1">
      <WorkspaceHomeProjectTreeItem
        v-for="project in rootProjects"
        :key="project.$id"
        :project="project"
        :projects="projects"
      />
      <li
        v-if="!projects.length"
        class="p-4 text-center text-sm text-muted-foreground"
      >
        {{ t("project.noneFound") }}
      </li>
    </ul>
  </section>
</template>
