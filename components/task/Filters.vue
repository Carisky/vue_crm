<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';
import type { AcceptableValue } from 'reka-ui';

import { TaskStatus, type Project, type WorkspaceMember } from '~/lib/types';

const { projectId, assigneeId } = defineProps<{ projectId?: string; assigneeId?: string; }>()

const route = useRoute()
const { value: filterValues, setQueryValue } = useTaskFilterQueries()

const statusOptions = Object.entries(TaskStatus)

const { data: projects, isLoading: isLoadingProjects } = useQuery<Project[]>
    ({
        queryKey: ['projects', () => route.params['workspaceId']],
        queryFn: async () => {
            const res = await fetch(`/api/workspaces/${route.params['workspaceId']}/projects`)
            const data = await res.json()
            return data.projects
        },
        staleTime: Infinity,
    })

const { data: members, isLoading: isLoadingMembers } = useQuery<WorkspaceMember[]>
    ({
        queryKey: ['members', () => route.params['workspaceId']],
        queryFn: async () => {
            const res = await fetch(`/api/workspaces/${route.params['workspaceId']}/members`)
            const data = await res.json()
            return data.members
        },
        staleTime: Infinity,
    })

const isLoading = computed(() => isLoadingProjects.value || isLoadingMembers.value)

const projectOptions = computed(() =>
    projects.value?.map(({ $id, name, image_url }) => ({ $id, name, image_url })) ?? [])
const memberOptions = computed(() =>
    members.value?.map(({ $id, name }) => ({ $id, name })) ?? [])

const initialDueDate = computed(() => {
    return filterValues.value.due_date ? new Date(filterValues.value.due_date) : undefined
})
const initialStartDate = computed(() => {
    return filterValues.value.started_at ? new Date(filterValues.value.started_at) : undefined
})

const handleStatusChange = (val: AcceptableValue) => {
    setQueryValue('status', val === 'all' ? null : String(val))
}

const handleAssigneeChange = (val: AcceptableValue) => {
    setQueryValue('assignee_id', val === 'all' ? null : String(val))
}

const handleProjectChange = (val: AcceptableValue) => {
    setQueryValue('project_id', val === 'all' ? null : String(val))
}

const handleDueDateChange = (val: Date | undefined) => {
    setQueryValue('due_date', val?.toISOString() ?? null)
}
const handleStartDateChange = (val: Date | undefined) => {
    setQueryValue('started_at', val?.toISOString() ?? null)
}
</script>

<template>
    <div v-if="!isLoading" class="flex flex-col gap-2 lg:flex-row">
        <Select :default-value="filterValues.status" @update:model-value="handleStatusChange">
            <SelectTrigger class="w-full h-8 lg:w-auto">
                <div class="flex items-center pr-2">
                    <Icon name="lucide:list-check" size="16px" class="size-4 mr-1" />
                    <SelectValue placeholder="All statuses"></SelectValue>
                </div>
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectSeparator />
                <SelectItem v-for="[label, val] of statusOptions" :key="val" :value="val">
                    {{ label }}
                </SelectItem>
            </SelectContent>
        </Select>
        <Select v-if="!assigneeId" :default-value="filterValues.assignee_id" @update:model-value="handleAssigneeChange">
            <SelectTrigger class="w-full h-8 lg:w-auto">
                <div class="flex items-center pr-2">
                    <Icon name="lucide:user" size="16px" class="size-4 mr-1" />
                    <SelectValue placeholder="All assignees"></SelectValue>
                </div>
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All assignees</SelectItem>
                <SelectSeparator />
                <SelectItem v-for="member of memberOptions" :key="member.$id" :value="member.$id">
                    {{ member.name }}
                </SelectItem>
            </SelectContent>
        </Select>
        <Select v-if="!projectId" :default-value="filterValues.project_id" @update:model-value="handleProjectChange">
            <SelectTrigger class="w-full h-8 lg:w-auto">
                <div class="flex items-center pr-2">
                    <Icon name="lucide:folder" size="16px" class="size-4 mr-1" />
                    <SelectValue placeholder="All projects"></SelectValue>
                </div>
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                <SelectSeparator />
                <SelectItem v-for="project of projectOptions" :key="project.$id" :value="project.$id">
                    {{ project.name }}
                </SelectItem>
            </SelectContent>
        </Select>
        <DatePicker :value="initialDueDate" :on-change="handleDueDateChange" placeholder="Due Date"
            class="h-12 w-full lg:w-auto" />
        <DatePicker :value="initialStartDate" :on-change="handleStartDateChange" placeholder="Start Date"
            class="h-12 w-full lg:w-auto" />
    </div>
</template>
