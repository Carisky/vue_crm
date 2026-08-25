<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import type { AcceptableValue } from "reka-ui";

import {
  TaskStatus,
  type Project,
  type WorkspaceGroup,
  type WorkspaceMember,
} from "~/lib/types";
import { taskStatusTranslationKeys } from "~/lib/i18n";

const { projectId, assigneeId } = defineProps<{
  projectId?: string;
  assigneeId?: string;
}>();

const route = useRoute();
const requestFetch = useRequestFetch();
const { value: filterValues, setQueryValue } = useTaskFilterQueries();
const { t } = useAppI18n();

const statusOptions = Object.entries(TaskStatus);

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
    isLoadingProjects.value || isLoadingMembers.value || isLoadingGroups.value,
);

const projectOptions = computed(
  () =>
    projects.value?.map(({ $id, name, image_url }) => ({
      $id,
      name,
      image_url,
    })) ?? [],
);
const memberOptions = computed(
  () => members.value?.map(({ $id, name }) => ({ $id, name })) ?? [],
);
const groupOptions = computed(() => groups.value ?? []);

const initialDueDate = computed(() => {
  return filterValues.value.due_date
    ? new Date(filterValues.value.due_date)
    : undefined;
});
const initialStartDate = computed(() => {
  return filterValues.value.started_at
    ? new Date(filterValues.value.started_at)
    : undefined;
});

const handleStatusChange = (val: AcceptableValue) => {
  setQueryValue("status", val === "all" ? null : String(val));
};

const handleAssigneeChange = (val: AcceptableValue) => {
  setQueryValue("assignee_id", val === "all" ? null : String(val));
};

const handleGroupChange = (val: AcceptableValue) => {
  setQueryValue("group_id", val === "all" ? null : String(val));
};

const handleProjectChange = (val: AcceptableValue) => {
  setQueryValue("project_id", val === "all" ? null : String(val));
};

const handleDueDateChange = (val: Date | undefined) => {
  setQueryValue("due_date", val?.toISOString() ?? null);
};
const handleStartDateChange = (val: Date | undefined) => {
  setQueryValue("started_at", val?.toISOString() ?? null);
};
</script>

<template>
  <div v-if="!isLoading" class="flex flex-col gap-2 lg:flex-row">
    <Select
      :default-value="filterValues.status"
      @update:model-value="handleStatusChange"
    >
      <SelectTrigger class="h-8 w-full lg:w-auto">
        <div class="flex items-center pr-2">
          <Icon name="lucide:list-check" size="16px" class="mr-1 size-4" />
          <SelectValue :placeholder="t('task.allStatuses')"></SelectValue>
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{{ t("task.allStatuses") }}</SelectItem>
        <SelectSeparator />
        <SelectItem
          v-for="[label, val] of statusOptions"
          :key="val"
          :value="val"
        >
          {{ t(taskStatusTranslationKeys[val]) }}
        </SelectItem>
      </SelectContent>
    </Select>
    <Select
      :default-value="filterValues.group_id"
      @update:model-value="handleGroupChange"
    >
      <SelectTrigger class="h-8 w-full lg:w-auto">
        <div class="flex items-center pr-2">
          <Icon name="lucide:users" size="16px" class="mr-1 size-4" />
          <SelectValue :placeholder="t('groups.all')"></SelectValue>
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{{ t("groups.all") }}</SelectItem>
        <SelectSeparator />
        <SelectItem
          v-for="group of groupOptions"
          :key="group.$id"
          :value="group.$id"
        >
          {{ group.name }}
        </SelectItem>
      </SelectContent>
    </Select>
    <Select
      v-if="!assigneeId"
      :default-value="filterValues.assignee_id"
      @update:model-value="handleAssigneeChange"
    >
      <SelectTrigger class="h-8 w-full lg:w-auto">
        <div class="flex items-center pr-2">
          <Icon name="lucide:user" size="16px" class="mr-1 size-4" />
          <SelectValue :placeholder="t('task.allAssignees')"></SelectValue>
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{{ t("task.allAssignees") }}</SelectItem>
        <SelectSeparator />
        <SelectItem
          v-for="member of memberOptions"
          :key="member.$id"
          :value="member.$id"
        >
          {{ member.name }}
        </SelectItem>
      </SelectContent>
    </Select>
    <Select
      v-if="!projectId"
      :default-value="filterValues.project_id"
      @update:model-value="handleProjectChange"
    >
      <SelectTrigger class="h-8 w-full lg:w-auto">
        <div class="flex items-center pr-2">
          <Icon name="lucide:folder" size="16px" class="mr-1 size-4" />
          <SelectValue :placeholder="t('task.allProjects')"></SelectValue>
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{{ t("task.allProjects") }}</SelectItem>
        <SelectSeparator />
        <SelectItem
          v-for="project of projectOptions"
          :key="project.$id"
          :value="project.$id"
        >
          {{ project.name }}
        </SelectItem>
      </SelectContent>
    </Select>
    <DatePicker
      :value="initialDueDate"
      :on-change="handleDueDateChange"
      :placeholder="t('task.dueDate')"
      class="h-12 w-full lg:w-auto"
    />
    <DatePicker
      :value="initialStartDate"
      :on-change="handleStartDateChange"
      :placeholder="t('task.started')"
      class="h-12 w-full lg:w-auto"
    />
  </div>
</template>
