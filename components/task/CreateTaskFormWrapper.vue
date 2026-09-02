<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";

import type {
  FilteredTask,
  Project,
  WorkspaceGroup,
  WorkspaceMember,
} from "~/lib/types";
import {
  taskMemberOptionsQueryKey,
  taskProjectOptionsQueryKey,
} from "~/lib/task-query-keys";

const { initialStatus, parentTaskId, onCancel } = defineProps<{
  initialStatus?: string;
  parentTaskId?: string;
  onCancel?: () => void;
}>();

const route = useRoute();
const requestFetch = useRequestFetch();
const workspaceId = computed(() => String(route.params["workspaceId"] ?? ""));

const { data: parentTask, isLoading: isLoadingParentTask } =
  useQuery<FilteredTask | null>({
    queryKey: computed(() => ["parent-task", parentTaskId ?? ""]),
    queryFn: async () => {
      if (!parentTaskId) return null;
      const data = await requestFetch<{ task: FilteredTask }>(
        `/api/tasks/${parentTaskId}`,
      );
      return data.task;
    },
    enabled: computed(() => Boolean(parentTaskId)),
    staleTime: Infinity,
  });

const { data: projects, isLoading: isLoadingProjects } = useQuery<Project[]>({
  queryKey: computed(() => taskProjectOptionsQueryKey(workspaceId.value)),
  queryFn: async () => {
    const data = await requestFetch<{ projects: Project[] }>(
      `/api/workspaces/${workspaceId.value}/projects`,
    );
    return data.projects;
  },
  staleTime: Infinity,
});

const { data: members, isLoading: isLoadingMembers } = useQuery<
  WorkspaceMember[]
>({
  queryKey: computed(() => taskMemberOptionsQueryKey(workspaceId.value)),
  queryFn: async () => {
    const data = await requestFetch<{ members: WorkspaceMember[] }>(
      `/api/workspaces/${workspaceId.value}/members`,
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
    (Boolean(parentTaskId) && isLoadingParentTask.value),
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
      :initial-status="initialStatus"
      :parent-task-id="parentTaskId"
      :parent-project-id="parentTask?.project_id"
      :on-cancel="onCancel"
    />
  </div>
</template>
