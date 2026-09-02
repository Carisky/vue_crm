<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";

import UpdateTaskForm from "./UpdateTaskForm.vue";
import type {
  FilteredTask,
  Project,
  WorkspaceGroup,
  WorkspaceMember,
} from "~/lib/types";
import {
  taskEditorQueryKey,
  taskMemberOptionsQueryKey,
  taskProjectOptionsQueryKey,
} from "~/lib/task-query-keys";

const { taskId, onCancel } = defineProps<{
  taskId: string;
  onCancel?: () => void;
}>();

const route = useRoute();
const requestFetch = useRequestFetch();
const workspaceId = computed(() => String(route.params["workspaceId"] ?? ""));
const taskQueryKey = computed(() => taskEditorQueryKey(taskId));

const { data: task, isLoading: isLoadingTask } = useQuery<FilteredTask | null>({
  queryKey: taskQueryKey,
  queryFn: async () => {
    const data = await requestFetch<{ task: FilteredTask | null }>(
      `/api/tasks/${taskId}`,
    );
    return data?.task ?? null;
  },
});

const { data: projects, isLoading: isLoadingProjects } = useQuery<Project[]>({
  queryKey: computed(() => taskProjectOptionsQueryKey(workspaceId.value)),
  queryFn: async () => {
    const data = await requestFetch<{ projects: Project[] }>(
      `/api/workspaces/${workspaceId.value}/projects`,
    );
    return data?.projects ?? [];
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
    return data?.members ?? [];
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
      return data.groups ?? [];
    },
    staleTime: Infinity,
  },
);

const isLoading = computed(
  () =>
    isLoadingTask.value ||
    isLoadingProjects.value ||
    isLoadingMembers.value ||
    isLoadingGroups.value,
);

const projectOptions = computed(
  () =>
    projects.value?.map(({ $id, name, image_url }) => ({
      $id,
      name: name ?? "",
      image_url: image_url ?? undefined,
    })) ?? [],
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
  <div v-else-if="task">
    <UpdateTaskForm
      :initial-values="task"
      :project-options="projectOptions"
      :member-options="memberOptions"
      :group-options="groupOptions"
      :on-cancel="onCancel"
    />
  </div>
</template>
