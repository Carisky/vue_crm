<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query';

import authenticatedPageProtectMiddleware from '~/middleware/page-protect/authenticatedPage';
import type { CreateTaskInject, DeleteTaskInject, Project, UpdateTaskInject } from '~/lib/types';

definePageMeta({
    layout: 'dashboard',
    middleware: [authenticatedPageProtectMiddleware]
})

const route = useRoute()
const queryClient = useQueryClient()
const projectId = computed(() => String(route.params['projectId'] ?? ''))

const { data, isPending, isRefetching, suspense } = useQuery<{
    project: Project;
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
        queryKey: computed(() => ['project-analytics', projectId.value]),
        queryFn: async () => {
            const res = await fetch(`/api/projects/${projectId.value}/analytics`)
            const data = await res.json()
            return data
        },
        staleTime: Infinity,
        experimental_prefetchInRender: true
    })

const pageTitle = computed(() => data?.value?.project.name ?? 'Project')
useHead({
    title: pageTitle
})

onServerPrefetch(async () => {
    await suspense()
})

const invalidateProjectAnalytics = () => {
    queryClient.invalidateQueries({ queryKey: ['project-analytics'] })
}

const createTaskInject: CreateTaskInject | undefined = inject('create-task-inject')
const unsubscribeCreateSuccess = createTaskInject?.subscribeToCreateTaskSuccess((task) => {
    if (task.project_id === projectId.value) {
        invalidateProjectAnalytics()
    }
})

const updateTaskInject: UpdateTaskInject | undefined = inject('update-task-inject')
const unsubscribeUpdateSuccess = updateTaskInject?.subscribeToUpdateTaskSuccess((task) => {
    if (task.project_id === projectId.value) {
        invalidateProjectAnalytics()
    }
})

const deleteTaskInject: DeleteTaskInject | undefined = inject('delete-task-inject')
const unsubscribeDeleteSuccess = deleteTaskInject?.subscribeToDeleteTaskSuccess(() => {
    invalidateProjectAnalytics()
})

onUnmounted(() => {
    unsubscribeCreateSuccess?.()
    unsubscribeUpdateSuccess?.()
    unsubscribeDeleteSuccess?.()
})
</script>

<template>
    <Loader v-if="isPending && !isRefetching" class="min-h-auto h-96" />
    <div v-else-if="data" class="flex flex-col gap-y-4">
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-x-2">
                <ProjectAvatar :name="data.project.name" :image="data.project.image_url" class="size-8" />
                <p class="text-lg font-semibold">{{ data.project.name }}</p>
            </div>
            <div>
                <div class="flex items-center gap-2">
                    <Button variant="secondary" size="sm" :as-child="true">
                        <NuxtLink
                            :href="`/workspaces/${route.params['workspaceId']}/projects/${route.params['projectId']}/docs`">
                            <Icon name="lucide:book-open" size="16px" class="size-4 mr-1" />
                            Project docs
                        </NuxtLink>
                    </Button>
                    <Button variant="secondary" size="sm" :as-child="true">
                        <NuxtLink
                            :href="`/workspaces/${route.params['workspaceId']}/projects/${route.params['projectId']}/settings`">
                            <Icon name="lucide:pencil" size="16px" class="size-4 mr-1" />
                            Edit Project
                        </NuxtLink>
                    </Button>
                </div>
            </div>
        </div>

        <ProjectAnalytics :data="data.analytic_data" />
        <TaskSwitcher :project-id="String(route.params['projectId'])" />
    </div>
</template>
