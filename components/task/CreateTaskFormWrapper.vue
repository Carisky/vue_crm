<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";

import type {
  FilteredTask,
  Project,
  WorkspaceGroup,
  WorkspaceMember,
} from "~/lib/types";

const { onCancel } = defineProps<{ onCancel?: () => void }>();

const route = useRoute();
const requestFetch = useRequestFetch();
const parentTaskId = computed(() => {
  const value = route.query["parent_task_id"];
  return typeof value === "string" && value ? value : "";
});

const { data: parentTask, isLoading: isLoadingParentTask } =
  useQuery<FilteredTask | null>({
    queryKey: computed(() => ["parent-task", parentTaskId.value]),
    queryFn: async () => {
      if (!parentTaskId.value) return null;
      const data = await requestFetch<{ task: FilteredTask }>(
        `/api/tasks/${parentTaskId.value}`,
      );
      return data.task;
    },
    enabled: computed(() => Boolean(parentTaskId.value)),
    staleTime: Infinity,
  });

const { data: projects, isLoading: isLoadingProjects } = useQuery<Project[]>({
  queryKey: ["projects", () => route.params["workspaceId"]],
  queryFn: async () => {
    const data = await requestFetch<{ projects: Project[] }>(
      `/api/workspaces/${route.params["workspaceId"]}/projects`,
    );
    return data.projects;
  },
  staleTime: Infinity,
});

const { data: members, isLoading: isLoadingMembers } = useQuery<
  WorkspaceMember[]
>({
  queryKey: ["members", () => route.params["workspaceId"]],
  queryFn: async () => {
    const data = await requestFetch<{ members: WorkspaceMember[] }>(
      `/api/workspaces/${route.params["workspaceId"]}/members`,
    );
    return data.members;
  },
  staleTime: Infinity,
});

const { data: groups, isLoading: isLoadingGroups } = useQuery<WorkspaceGroup[]>(
  {
    queryKey: computed(() => [
      "workspace-groups",
      String(route.params["workspaceId"] ?? ""),
    ]),
    queryFn: async () => {
      const data = await requestFetch<{ groups: WorkspaceGroup[] }>(
        `/api/workspaces/${route.params["workspaceId"]}/groups`,
      );
      return data.groups;
    },
    staleTime: Infinity,
  },
);

const isLoading = computed(
  () =>
    isLoadingProjects.value ||
    isLoadingMembers.value ||
    isLoadingGroups.value ||
    (Boolean(parentTaskId.value) && isLoadingParentTask.value),
);

const projectOptions = computed(() =>
  (
    projects.value?.map(({ $id, name, image_url }) => ({
      $id,
      name: name ?? "",
      image_url: image_url ?? undefined,
    })) ?? []
  ).sort((a, b) =>
    a.$id === parentTask.value?.project_id
      ? -1
      : b.$id === parentTask.value?.project_id
        ? 1
        : 0,
  ),
);
const memberOptions = computed(
  () =>
    members.value?.map(({ $id, name }) => ({ $id, name: name ?? "" })) ?? [],
);
const groupOptions = computed(
  () =>
    groups.value?.map(({ $id, name, color }) => ({ $id, name, color })) ?? [],
);
</script>

<template>
  <Card v-if="isLoading" class="h-[714px] w-full border-none p-0 shadow-none">
    <CardContent class="flex h-full items-center justify-center">
      <Icon
        name="svg-spinners:8-dots-rotate"
        size="20px"
        class="size-5 text-muted-foreground"
      />
    </CardContent>
  </Card>
  <div v-else>
    <TaskCreateTaskForm
      :project-options="projectOptions"
      :member-options="memberOptions"
      :group-options="groupOptions"
      :parent-task-id="parentTaskId || undefined"
      :parent-project-id="parentTask?.project_id"
      :on-cancel="onCancel"
    />
  </div>
</template>
