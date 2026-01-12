<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query';

import { MEMBER_ROLE } from '~/lib/constant';
import type { CreateTaskInject, FilteredTask, Project, Workspace, WorkspaceMember } from '~/lib/types';
import authenticatedPageProtectMiddleware from '~/middleware/page-protect/authenticatedPage';

definePageMeta({
    layout: 'dashboard',
    middleware: [authenticatedPageProtectMiddleware]
})

const route = useRoute()
const queryClient = useQueryClient()
const workspaceId = computed(() => String(route.params['workspaceId'] ?? ''))

const { data: analytics, isPending: isLoadingAnalytics, suspense: loadAnalytics } = useQuery<{
    workspace: Workspace;
    is_owner: boolean;
    is_admin: boolean,
    analytic_data: {
        task_count: number;
        task_diff: number;
        assigned_task_count: number;
        assigned_task_diff: number;
        completed_task_count: number;
        completed_task_diff: number;
        incompleted_task_count: number;
        incompleted_task_diff: number;
        overdue_task_count: number;
        overdue_task_diff: number;
    },
}>
    ({
        queryKey: computed(() => ['workspace-analytics', workspaceId.value]),
        queryFn: async () => {
            const res = await fetch(`/api/workspaces/${workspaceId.value}/analytics`)
            const data = await res.json()
            return data
        },
        staleTime: Infinity,
        experimental_prefetchInRender: true
    })
const { data: projects, isPending: isLoadingProjects, suspense: loadProjects } = useQuery<Project[]>
    ({
        queryKey: computed(() => ['projects', workspaceId.value]),
        queryFn: async () => {
            const res = await fetch(`/api/workspaces/${workspaceId.value}/projects`)
            const data = await res.json()
            return data?.projects ?? []
        },
        staleTime: Infinity,
        experimental_prefetchInRender: true
    })
const { data: members, isPending: isLoadingMembers, suspense: loadMembers } = useQuery<WorkspaceMember[]>
    ({
        queryKey: computed(() => ['members', workspaceId.value]),
        queryFn: async () => {
            const res = await fetch(`/api/workspaces/${workspaceId.value}/members`)
            const data = await res.json()
            return data?.members ?? []
        },
        staleTime: Infinity,
        experimental_prefetchInRender: true
    })
const { data: tasks, isPending: isLoadingTasks, suspense: loadTasks } = useQuery<FilteredTask[]>
    ({
        queryKey: computed(() => ['tasks', workspaceId.value]),
        queryFn: async () => {
            const res = await fetch(`/api/tasks/filter?workspace_id=${workspaceId.value}`)
            const data = await res.json()
            return data?.tasks ?? []
        },
        staleTime: Infinity,
        experimental_prefetchInRender: true
    })

const pageTitle = computed(() => analytics?.value?.workspace.name ?? 'Workspace')
useHead({
    title: pageTitle
})

onServerPrefetch(async () => {
    await Promise.all([
        loadAnalytics(),
        loadProjects(),
        loadMembers(),
        loadTasks()
    ])
})

const isLoading = computed(() =>
    isLoadingAnalytics.value
    || isLoadingProjects.value
    || isLoadingMembers.value
    || isLoadingTasks.value)

// Listen to event of creating task via create-task modal
const onCreateTask: CreateTaskInject | undefined = inject('create-task-inject')

const unsubscribeCreateSuccess = onCreateTask?.subscribeToCreateTaskSuccess(() => {
    queryClient.invalidateQueries({ queryKey: ['tasks', workspaceId.value] })
})

onUnmounted(() => {
    unsubscribeCreateSuccess?.()
})
</script>

<template>
    <Loader v-if="isLoading" class="min-h-auto h-96" />
    <div v-if="analytics && tasks && projects && members" class="h-full flex flex-col space-y-4">
        <ProjectAnalytics :data="analytics.analytic_data" />
        <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <WorkspaceHomeTaskList :tasks="tasks" />
            <WorkspaceHomeProjectList :projects="projects" />
            <WorkspaceHomeMemberList :members="members" />
        </div>
    </div>
</template>
