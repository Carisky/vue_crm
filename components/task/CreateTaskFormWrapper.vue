<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';

import type { Project, WorkspaceMember } from '~/lib/types';

const { onCancel } = defineProps<{ onCancel?: () => void }>()

const route = useRoute()
const requestFetch = useRequestFetch()

const { data: projects, isLoading: isLoadingProjects } = useQuery<Project[]>
    ({
        queryKey: ['projects', () => route.params['workspaceId']],
        queryFn: async () => {
            const data = await requestFetch<{ projects: Project[] }>(`/api/workspaces/${route.params['workspaceId']}/projects`)
            return data.projects
        },
        staleTime: Infinity,
    })

const { data: members, isLoading: isLoadingMembers } = useQuery<WorkspaceMember[]>
    ({
        queryKey: ['members', () => route.params['workspaceId']],
        queryFn: async () => {
            const data = await requestFetch<{ members: WorkspaceMember[] }>(`/api/workspaces/${route.params['workspaceId']}/members`)
            return data.members
        },
        staleTime: Infinity,
    })

const isLoading = computed(() => isLoadingProjects.value || isLoadingMembers.value)

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
    <div v-else>
        <TaskCreateTaskForm :project-options="projectOptions" :member-options="memberOptions" :on-cancel="onCancel" />
    </div>
</template>
