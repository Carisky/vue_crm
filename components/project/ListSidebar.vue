<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import ProjectTreeItem from './TreeItem.vue'

import type { Project, Workspace } from '~/lib/types';

const route = useRoute()
const requestFetch = useRequestFetch()
const { t } = useAppI18n()
const { data: workspaces } = useQuery<Workspace[]>({
    queryKey: ['workspaces/all'],
    queryFn: async () => {
        const data = await requestFetch<{ workspaces: Workspace[] }>('/api/workspaces/all')
        return data?.workspaces ?? []
    },
    staleTime: Infinity,
    experimental_prefetchInRender: true
})

const workspaceId = computed(() => {
    const routeId = route.params['workspaceId']
    const queryId = route.query['workspace_id']

    if (typeof routeId === 'string' && routeId) return routeId
    if (typeof queryId === 'string' && queryId) return queryId
    return workspaces.value?.[0]?.$id ?? ''
})

const { data: projects, isLoading } = useQuery<Project[]>
    ({
        queryKey: ['projects', workspaceId],
        queryFn: async () => {
            const data = await requestFetch<{ projects: Project[] }>(`/api/workspaces/${workspaceId.value}/projects`)
            return data?.projects ?? []
        },
        enabled: computed(() => Boolean(workspaceId.value)),
        staleTime: Infinity,
        experimental_prefetchInRender: true
    })

const { open } = useCreateProjectModal()
const rootProjects = computed(() => {
    const ids = new Set((projects.value ?? []).map((project) => project.$id))
    return (projects.value ?? []).filter((project) => !project.parent_id || !ids.has(project.parent_id))
})
</script>

<template>
    <div class="flex flex-col gap-y-2 text-sidebar-foreground" data-tour="project-list">
        <div class="flex items-center justify-between text-sidebar-foreground/85">
            <p class="text-xs uppercase">{{ t('nav.projects') }}</p>
            <button
                @click="() => open()"
                class="flex items-center justify-center text-sidebar-foreground hover:text-sidebar-primary"
            >
                <Icon
                    v-if="isLoading && !projects"
                    name="svg-spinners:8-dots-rotate"
                    size="20px"
                    class="size-5 text-sidebar-foreground/80"
                />
                <Icon
                    v-else
                    name="heroicons:plus-circle-20-solid"
                    size="20px"
                    class="size-5 text-sidebar-foreground/85 cursor-pointer transition hover:opacity-75"
                />
            </button>
        </div>

        <template v-if="projects?.length">
            <ProjectTreeItem
                v-for="project of rootProjects"
                :key="project.$id"
                :project="project"
                :projects="projects"
                :workspace-id="workspaceId"
            />
        </template>
    </div>
</template>
