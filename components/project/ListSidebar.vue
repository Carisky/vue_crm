<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import ProjectAvatar from './ProjectAvatar.vue'

import type { Project } from '~/lib/types';

const route = useRoute()
const workspaceId = computed(() => route.params['workspaceId'])

const { data: projects, isLoading } = useQuery<Project[]>
    ({
        queryKey: ['projects', () => route.params['workspaceId']],
        queryFn: async () => {
            const res = await fetch(`/api/workspaces/${route.params['workspaceId']}/projects`)
            const data = await res.json()
            return data?.projects ?? []
        },
        staleTime: Infinity,
        experimental_prefetchInRender: true
    })

const { open } = useCreateProjectModal()
</script>

<template>
    <div class="flex flex-col gap-y-2 text-sidebar-foreground">
        <div class="flex items-center justify-between text-sidebar-foreground/70">
            <p class="text-xs uppercase">Projects</p>
            <button
                @click="open"
                class="flex items-center justify-center text-sidebar-foreground hover:text-sidebar-primary"
            >
                <Icon
                    v-if="isLoading"
                    name="svg-spinners:8-dots-rotate"
                    size="20px"
                    class="size-5 text-sidebar-foreground/50"
                />
                <Icon
                    v-else
                    name="heroicons:plus-circle-20-solid"
                    size="20px"
                    class="size-5 text-sidebar-foreground/60 cursor-pointer transition hover:opacity-75"
                />
            </button>
        </div>

        <template v-if="projects?.length">
            <NuxtLink
                v-for="project of projects"
                :key="project.$id"
                :href="`/workspaces/${workspaceId}/projects/${project.$id}`"
                active-class="bg-sidebar-primary/10 text-card-foreground shadow-sm"
                class="flex items-center gap-2.5 p-2.5 rounded-md text-sidebar-foreground transition hover:text-sidebar-primary hover:bg-sidebar-primary/5"
            >
                <ProjectAvatar :name="project.name" :image="project.image_url" />
                <span class="truncate">{{ project.name }}</span>
            </NuxtLink>
        </template>
    </div>
</template>
