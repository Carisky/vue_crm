<script setup lang="ts">
import { templateRef } from '@vueuse/core'
import { useQuery } from '@tanstack/vue-query'

import type { Workspace } from '~/lib/types';

const route = useRoute()
const requestFetch = useRequestFetch()
const { t } = useAppI18n()

const { data, isLoading } = useQuery<Workspace[]>
    ({
        queryKey: ['workspaces/all'],
        queryFn: async () => {
            const data = await requestFetch<{ workspaces: Workspace[] }>('/api/workspaces/all')
            return data?.workspaces ?? []
        },
        staleTime: Infinity,
        experimental_prefetchInRender: true
    })

const { open } = useCreateWorkspaceModal()

// Workspace select
const trigger = templateRef('trigger')
const workspaceSelectOpen = ref(false)
const selectedWorkspace: Ref<Workspace | ''> = ref('')

watch([() => route.params['workspaceId'], () => route.query['workspace_id'], data], ([routeId, queryId, data]) => {
    const workspaceId = (
        typeof routeId === 'string' && routeId
            ? routeId
            : typeof queryId === 'string' && queryId
                ? queryId
                : data?.[0]?.$id
    ) ?? ''
    selectedWorkspace.value = data?.find(({ $id }) => $id === workspaceId) ?? ''
}, { immediate: true })
</script>

<template>
    <div class="flex flex-col gap-y-2" data-tour="workspace-switcher" @click="workspaceSelectOpen = false">
        <div class="flex items-center justify-between text-sidebar-foreground/85">
            <p class="text-xs uppercase">{{ t('nav.workspaces') }}</p>
            <button @click="open" class="flex items-center justify-center text-sidebar-foreground hover:text-sidebar-primary">
                <Icon
                    v-if="isLoading && !data"
                    name="svg-spinners:8-dots-rotate"
                    size="20px"
                    class="size-5 text-sidebar-foreground/85"
                />
                <Icon
                    v-else
                    name="heroicons:plus-circle-20-solid"
                    size="20px"
                    class="size-5 text-sidebar-foreground/85 cursor-pointer transition hover:opacity-75"
                />
            </button>
        </div>
        <Select
            :model-value="selectedWorkspace"
            :open="workspaceSelectOpen"
            @update:model-value="workspaceSelectOpen = false"
            class="relative"
        >
            <button
                id="trigger"
                @click.stop="workspaceSelectOpen = !workspaceSelectOpen"
                ref="trigger"
                class="w-full text-left h-12 rounded-md bg-card text-card-foreground font-medium pl-3 border border-border focus-visible:border-primary focus-visible:ring-primary/50 focus-visible:ring focus-visible:ring-offset-0"
            >
                <div v-if="selectedWorkspace" class="flex items-center justify-start gap-3 font-medium text-card-foreground">
                    <WorkspaceAvatar
                        :name="selectedWorkspace.name"
                        :image="selectedWorkspace.image_url ?? undefined"
                    />
                    <span class="truncate">{{ selectedWorkspace.name }}</span>
                </div>
                <template v-else class="text-muted-foreground">{{ t('workspace.noneSelected') }}</template>
            </button>
            <SelectContent
                v-if="data?.length"
                :reference="trigger ?? undefined"
                @pointer-down-outside="workspaceSelectOpen = false"
            >
                <SelectItem v-for="workspace of data" :key="workspace.$id" :value="workspace"
                    @select="navigateTo(`/workspaces/${workspace.$id}`)">
                    <div class="flex items-center justify-start gap-3 font-medium text-card-foreground">
                        <WorkspaceAvatar
                            :name="workspace.name"
                            :image="workspace.image_url ?? undefined"
                        />
                        <span class="truncate">{{ workspace.name }}</span>
                    </div>
                </SelectItem>
            </SelectContent>
        </Select>
    </div>
</template>
