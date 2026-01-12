<script setup lang="ts">
import { isSameDay } from 'date-fns'
import { useQueryClient } from '@tanstack/vue-query'

import type { CreateTaskInject, DeleteTaskInject, FilteredTask, UpdateTaskInject } from '~/lib/types'
import { columns } from './Columns'

const { projectId, assigneeId } = defineProps<{ projectId?: string; assigneeId?: string; }>()

const route = useRoute()
const queryClient = useQueryClient()
const { open } = useCreateTaskModal()
const {
    value: view,
    setQueryValue: setView,
} = useUrlQuery("tab")
const { value: filterValues } = useTaskFilterQueries()

const allowedViews = new Set(['table', 'kanban'])

// Default tab value is "table"
const initialView = computed(() => {
    const candidate = view.value ? String(view.value) : 'table'
    return allowedViews.has(candidate) ? candidate : 'table'
})

const isLoadingTasks = ref(false)
const tasks: Ref<FilteredTask[] | undefined> = ref(undefined)
let refetchTimer: ReturnType<typeof setTimeout> | null = null

const fetchTasks = async () => {
    isLoadingTasks.value = true

    const workspace_id = route.params['workspaceId'] as string
    const project_id = projectId ?? filterValues.value['project_id'] as string
    const assignee_id = assigneeId ?? filterValues.value['assignee_id'] as string
    const status = filterValues.value['status'] as string
    const due_date = filterValues.value['due_date'] as string
    const started_at = filterValues.value['started_at'] as string
    const search = filterValues.value['search'] as string

    const searchParams = new URLSearchParams()
    searchParams.set('workspace_id', workspace_id)
    if (project_id) searchParams.set('project_id', project_id)
    if (status) searchParams.set('status', status)
    if (search) searchParams.set('search', search)
    if (assignee_id) searchParams.set('assignee_id', assignee_id)
    if (due_date) searchParams.set('due_date', due_date)
    if (started_at) searchParams.set('started_at', started_at)

    $fetch(`/api/tasks/filter?${searchParams.toString()}`)
        .then(res => tasks.value = res.tasks as FilteredTask[])
        .finally(() => isLoadingTasks.value = false)
}

const scheduleFetchTasks = () => {
    if (refetchTimer) clearTimeout(refetchTimer)
    refetchTimer = setTimeout(() => fetchTasks(), 50)
}

const matchesActiveFilters = (task: FilteredTask) => {
    const workspaceId = String(route.params['workspaceId'])
    if (task.workspace_id !== workspaceId) return false

    const activeProject = projectId ?? (filterValues.value['project_id'] as string | undefined)
    if (activeProject && task.project_id !== activeProject) return false

    const activeAssignee = assigneeId ?? (filterValues.value['assignee_id'] as string | undefined)
    if (activeAssignee && task.assignee_id !== activeAssignee) return false

    const activeStatus = filterValues.value['status'] as string | undefined
    if (activeStatus && task.status !== activeStatus) return false

    const activeDueDate = filterValues.value['due_date'] as string | undefined
    const activeStartDate = filterValues.value['started_at'] as string | undefined
    if (activeDueDate) {
        const filterDate = new Date(activeDueDate)
        if (!isNaN(filterDate.getTime())) {
            if (!task.due_date) return false
            if (!isSameDay(new Date(task.due_date), filterDate)) return false
        }
    }
    if (activeStartDate) {
        const filterDate = new Date(activeStartDate)
        if (!isNaN(filterDate.getTime())) {
            if (!task.started_at) return false
            if (!isSameDay(new Date(task.started_at), filterDate)) return false
        }
    }

    const activeSearch = filterValues.value['search'] as string | undefined
    if (activeSearch && !task.name.toLowerCase().includes(activeSearch.toLowerCase())) return false

    return true
}

const upsertTaskInState = (task: FilteredTask) => {
    const current = tasks.value ?? []
    const withoutCurrent = current.filter((existingTask) => existingTask.$id !== task.$id)
    tasks.value = [task, ...withoutCurrent]
}

const handleRowClick = (task: FilteredTask) => {
    navigateTo(`/workspaces/${task.workspace_id}/tasks/${task.$id}`)
}

// Refetch tasks on these url params' changes
watch(([
    () => projectId ? false : filterValues.value['project_id'],
    () => assigneeId ? false : filterValues.value['assignee_id'],
    () => filterValues.value['status'],
    () => filterValues.value['due_date'],
    () => filterValues.value['started_at'],
    () => filterValues.value['search']
]), () => fetchTasks(), { immediate: true })

// Switch tab
const handleSetView = (nextView: unknown) => {
    const candidate = String(nextView)
    setView(allowedViews.has(candidate) ? candidate : 'table')
}

// Listen to event of creating task via create-task modal
// These listers mainly for "DataTable" tab
// "Kanban" tab has its own listeners
const createTaskInject: CreateTaskInject | undefined = inject('create-task-inject')
const unsubscribeCreateSuccess = createTaskInject?.subscribeToCreateTaskSuccess((task: FilteredTask) => {
    if (!matchesActiveFilters(task)) return
    upsertTaskInState(task)
    fetchTasks()
})

// Listen to event of updating task via update-task modal
const updateTaskInject: UpdateTaskInject | undefined = inject('update-task-inject')
const unsubscribeUpdateSuccess = updateTaskInject?.subscribeToUpdateTaskSuccess((task: FilteredTask) => {
    if (!matchesActiveFilters(task)) {
        tasks.value = tasks.value?.filter((t) => t.$id !== task.$id)
    } else {
        tasks.value = tasks.value?.map((t) => t.$id === task.$id ? task : t)
    }
    queryClient.invalidateQueries({ queryKey: ['task', task.$id] })
    scheduleFetchTasks()
})

// Listen to deleting task event
const deleteTaskInject: DeleteTaskInject | undefined = inject('delete-task-inject')
const unsubscribeDeleteSuccess = deleteTaskInject?.subscribeToDeleteTaskSuccess((taskId: string) => {
    tasks.value = tasks.value?.filter((task) => task.$id !== taskId)
    scheduleFetchTasks()
})

onUnmounted(() => {
    unsubscribeCreateSuccess?.()
    unsubscribeUpdateSuccess?.()
    unsubscribeDeleteSuccess?.()
    if (refetchTimer) clearTimeout(refetchTimer)
})
</script>

<template>
    <Tabs :default-value="initialView" @update:model-value="handleSetView" class="flex-1 w-full border rounded-lg">
        <div class="h-full flex flex-col overflow-auto p-4">
            <div class="flex flex-col gap-y-2 items-center justify-between lg:flex-row">
                <TabsList class="w-full lg:w-auto">
                    <TabsTrigger value="table" class="h-8 w-full lg:w-auto">
                        Table
                    </TabsTrigger>
                    <TabsTrigger value="kanban" class="h-8 w-full lg:w-auto">
                        Kanban
                    </TabsTrigger>
                </TabsList>
                <Button size="sm" @click="open()" class="w-full lg:w-auto">
                    <Icon name="lucide:plus" size="16px" class="size-4" />
                    New
                </Button>
            </div>
            <DottedSeparator class="my-4" />
            <TaskFilters :project-id="projectId" :assignee-id="assigneeId" />
            <DottedSeparator class="my-4" />
            <div v-if="isLoadingTasks" class="w-full border rounded-lg h-52 flex flex-col items-center justify-center">
                <Icon name="svg-spinners:8-dots-rotate" size="20px" class="size-5 text-muted-foreground" />
            </div>
            <TabsContent value="table" class="mt-0">
                <TaskDataTable v-if="tasks && !isLoadingTasks" :columns="columns" :data="tasks"
                    :on-row-click="handleRowClick" />
            </TabsContent>
            <TabsContent value="kanban" class="mt-0">
                <TaskDataKanban v-if="tasks && !isLoadingTasks" :data="tasks" />
            </TabsContent>
        </div>
    </Tabs>
</template>
