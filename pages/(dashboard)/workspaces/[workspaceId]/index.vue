<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query';

import { MEMBER_ROLE } from '~/lib/constant';
import type { CreateTaskInject, FilteredTask, Project, Workspace, WorkspaceMember } from '~/lib/types';
import authenticatedPageProtectMiddleware from '~/middleware/page-protect/authenticatedPage';
import { buildHomeDashboardPreview } from '~/lib/home-dashboard';

definePageMeta({
    layout: 'dashboard',
    middleware: [authenticatedPageProtectMiddleware]
})

const route = useRoute()
const queryClient = useQueryClient()
const requestFetch = useRequestFetch()
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
            return await requestFetch(`/api/workspaces/${workspaceId.value}/analytics`)
        },
        staleTime: Infinity,
        experimental_prefetchInRender: true
    })
const { data: projects, isPending: isLoadingProjects, suspense: loadProjects } = useQuery<Project[]>
    ({
        queryKey: computed(() => ['projects', workspaceId.value]),
        queryFn: async () => {
            const data = await requestFetch<{ projects: Project[] }>(`/api/workspaces/${workspaceId.value}/projects`)
            return data?.projects ?? []
        },
        staleTime: Infinity,
        experimental_prefetchInRender: true
    })
const { data: members, isPending: isLoadingMembers, suspense: loadMembers } = useQuery<WorkspaceMember[]>
    ({
        queryKey: computed(() => ['members', workspaceId.value]),
        queryFn: async () => {
            const data = await requestFetch<{ members: WorkspaceMember[] }>(`/api/workspaces/${workspaceId.value}/members`)
            return data?.members ?? []
        },
        staleTime: Infinity,
        experimental_prefetchInRender: true
    })
const { data: tasks, isPending: isLoadingTasks, suspense: loadTasks } = useQuery<FilteredTask[]>
    ({
        queryKey: computed(() => ['tasks', workspaceId.value]),
        queryFn: async () => {
            const data = await requestFetch<{ tasks: FilteredTask[] }>(`/api/tasks/filter?workspace_id=${workspaceId.value}`)
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

const preview = computed(() => buildHomeDashboardPreview({
    tasks: tasks.value ?? [],
    projects: projects.value ?? [],
    members: members.value ?? [],
}))

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
    <div v-if="analytics && tasks && projects && members"
        class="grid h-[calc(100dvh-8rem)] min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden">
        <ProjectAnalytics :data="analytics.analytic_data" />
        <div class="grid min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] lg:grid-rows-1">
            <WorkspaceHomeTaskList :tasks="preview.tasks" :total="tasks.length" />
            <div class="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-3">
                <WorkspaceHomeProjectList :projects="preview.projects" :total="projects.length" />
                <WorkspaceHomeMemberList :members="preview.members" :total="members.length" />
            </div>
        </div>
    </div>
</template>
