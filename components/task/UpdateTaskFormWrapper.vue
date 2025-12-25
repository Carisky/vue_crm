<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';

import UpdateTaskForm from './UpdateTaskForm.vue';
import type { FilteredTask, Project, WorkspaceMember } from '~/lib/types';

const { onCancel } = defineProps<{ onCancel?: () => void }>()

const route = useRoute()
const { value: taskId } = useUrlQuery('update_task')

const { data: task, isLoading: isLoadingTask } = useQuery<FilteredTask>
    ({
        queryKey: ['task', taskId.value],
        queryFn: async () => {
            const res = await fetch(`/api/tasks/${taskId.value}`)
            const data = await res.json()
            return data?.task ?? null
        },
    })

const { data: projects, isLoading: isLoadingProjects } = useQuery<Project[]>
    ({
        queryKey: ['projects', () => route.params['workspaceId']],
        queryFn: async () => {
            const res = await fetch(`/api/workspaces/${route.params['workspaceId']}/projects`)
            const data = await res.json()
            return data?.projects ?? []
        },
        staleTime: Infinity,
    })

const { data: members, isLoading: isLoadingMembers } = useQuery<WorkspaceMember[]>
    ({
        queryKey: ['members', () => route.params['workspaceId']],
        queryFn: async () => {
            const res = await fetch(`/api/workspaces/${route.params['workspaceId']}/members`)
            const data = await res.json()
            return data?.members ?? []
        },
        staleTime: Infinity,
    })

const isLoading = computed(() => isLoadingTask.value || isLoadingProjects.value || isLoadingMembers.value)

const projectOptions = computed(() =>
    projects.value?.map(({ $id, name, image_url }) => ({
        $id,
        name: name ?? '',
        image_url: image_url ?? undefined,
    })) ?? [])
const memberOptions = computed(() =>
    members.value?.map(({ $id, name }) => ({ $id, name: name ?? '' })) ?? [])
</script>

<template>
    <Card v-if="isLoading" class="w-full h-[714px] p-0 border-none shadow-none">
        <CardContent class="h-full flex items-center justify-center">
            <Icon name="svg-spinners:8-dots-rotate" size="20px" class="size-5 text-muted-foreground" />
        </CardContent>
    </Card>
    <div v-else-if="task">
        <UpdateTaskForm :initial-values="task" :project-options="projectOptions" :member-options="memberOptions"
            :on-cancel="onCancel" />
    </div>
</template>
