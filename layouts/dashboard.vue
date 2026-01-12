<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query';

import type { DeleteTaskInject, FilteredTask, TaskSuccessSubscriber } from '~/lib/types';
import CreateWorkspaceModal from '~/components/workspace/CreateWorkspaceModal.vue';
import CreateProjectModal from '~/components/project/CreateProjectModal.vue';
import CreateTaskModal from '~/components/task/CreateTaskModal.vue';
import UpdateTaskModal from '~/components/task/UpdateTaskModal.vue';

type TaskRealtimeEvent =
    | { type: 'TASK_CREATED'; workspaceId: string; task: FilteredTask }
    | { type: 'TASK_UPDATED'; workspaceId: string; task: FilteredTask }
    | { type: 'TASK_DELETED'; workspaceId: string; taskId: string }

// Provide subscribers for creating, updating & deleting events
// Child components can register their listeners to those events
const createTaskSuccessSubsribers: TaskSuccessSubscriber[] = []

const subscribeToCreateTaskSuccess = (func: (newTask: FilteredTask) => Promise<void> | void) => {
    const index = createTaskSuccessSubsribers.push(func)
    return () => createTaskSuccessSubsribers[index] = null
}

provide('create-task-inject', {
    createTaskSuccessSubsribers,
    subscribeToCreateTaskSuccess
})

const updateTaskSuccessSubsribers: TaskSuccessSubscriber[] = []

const subscribeToUpdateTaskSuccess = (func: (updatedTask: FilteredTask) => Promise<void> | void) => {
    const index = updateTaskSuccessSubsribers.push(func)
    return () => updateTaskSuccessSubsribers[index] = null
}

provide('update-task-inject', {
    updateTaskSuccessSubsribers,
    subscribeToUpdateTaskSuccess
})

const deleteTaskSuccessSubsribers: DeleteTaskInject['deleteTaskSuccessSubsribers'] = []

const subscribeToDeleteTaskSuccess: DeleteTaskInject['subscribeToDeleteTaskSuccess'] = (func) => {
    const index = deleteTaskSuccessSubsribers.push(func)
    return () => deleteTaskSuccessSubsribers[index] = null
}

provide('delete-task-inject', {
    deleteTaskSuccessSubsribers,
    subscribeToDeleteTaskSuccess
})

const route = useRoute()
const queryClient = useQueryClient()

if (import.meta.client) {
    let source: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let reconnectAttempt = 0

    const close = () => {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer)
            reconnectTimer = null
        }
        source?.close()
        source = null
    }

    const connect = (workspaceId: string) => {
        close()
        if (!workspaceId) return

        source = new EventSource(`/api/realtime/tasks?workspace_id=${encodeURIComponent(workspaceId)}`)

        source.onopen = () => {
            reconnectAttempt = 0
            if (import.meta.dev) console.debug('[realtime] connected')
        }

        source.addEventListener('connected', () => {
            if (import.meta.dev) console.debug('[realtime] server connected')
            queryClient.refetchQueries({ queryKey: ['tasks'] })
        })

        source.addEventListener('task', (evt) => {
            try {
                const parsed = JSON.parse((evt as MessageEvent).data) as TaskRealtimeEvent
                if (import.meta.dev) console.debug('[realtime] task event', parsed.type)

                if (parsed.type === 'TASK_CREATED') {
                    createTaskSuccessSubsribers.forEach((fn) => fn?.(parsed.task))
                } else if (parsed.type === 'TASK_UPDATED') {
                    updateTaskSuccessSubsribers.forEach((fn) => fn?.(parsed.task))
                } else if (parsed.type === 'TASK_DELETED') {
                    deleteTaskSuccessSubsribers.forEach((fn) => fn?.(parsed.taskId))
                }

                queryClient.invalidateQueries({ queryKey: ['tasks'] })
                if (parsed.type !== 'TASK_DELETED') {
                    queryClient.invalidateQueries({ queryKey: ['task', parsed.task.$id] })
                } else {
                    queryClient.invalidateQueries({ queryKey: ['task', parsed.taskId] })
                }
                queryClient.invalidateQueries({ queryKey: ['workspace-analytics'] })
                queryClient.invalidateQueries({ queryKey: ['project-analytics'] })
                queryClient.invalidateQueries({ queryKey: ['notifications'] })

                queryClient.refetchQueries({ queryKey: ['tasks'] })
                queryClient.refetchQueries({ queryKey: ['workspace-analytics'] })
                queryClient.refetchQueries({ queryKey: ['project-analytics'] })
                queryClient.refetchQueries({ queryKey: ['notifications'] })
            } catch {
                // ignore malformed events
            }
        })

        source.onerror = () => {
            if (import.meta.dev) console.debug('[realtime] error, reconnecting...')
            close()
            const delay = Math.min(30_000, 500 * (2 ** reconnectAttempt))
            reconnectAttempt += 1
            reconnectTimer = setTimeout(() => connect(workspaceId), delay)
        }
    }

    onMounted(() => connect(String(route.params['workspaceId'] ?? '')))
    watch(() => route.params['workspaceId'], (id) => connect(String(id ?? '')))
    onUnmounted(close)
}
</script>

<template>
    <div class="min-h-screen flex flex-col">
        <div class="h-full grow">
            <div class="fixed left-0 top-0 hidden h-full overflow-y-auto lg:block lg:w-[264px]">
                <SideBar />
            </div>
            <div class="size-full grow lg:pl-[264px]">
                <div class="max-w-screen-2xl mx-auto h-full">
                    <NavBar />
                    <main class="h-full px-6 py-8 flex flex-col">
                        <slot></slot>
                    </main>
                </div>
            </div>
        </div>
    </div>

    <CreateWorkspaceModal />
    <CreateProjectModal />
    <CreateTaskModal />
    <UpdateTaskModal />
</template>
