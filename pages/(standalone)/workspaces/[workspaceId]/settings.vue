<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';

import authenticatedPageProtectMiddleware from '~/middleware/page-protect/authenticatedPage';
import type { Workspace } from '~/lib/types';
import { WorkspaceUpdateWorkspaceForm } from '#components';

definePageMeta({
    layout: 'standalone',
    middleware: [authenticatedPageProtectMiddleware]
})

const route = useRoute()
const requestFetch = useRequestFetch()
const workspaceId = computed(() => route.params['workspaceId'])

const { data, isPending, isRefetching, refetch, suspense } = useQuery<{
    workspace: Workspace;
    is_owner: boolean;
    is_admin: boolean;
}>
    ({
        queryKey: ['workspace-settings', () => workspaceId.value],
        queryFn: async () => {
            return await requestFetch(`/api/workspaces/${workspaceId.value}`)
        },
        staleTime: Infinity,
        experimental_prefetchInRender: true
    })

onServerPrefetch(async () => {
    await suspense()
})

const pageTitle = computed(() => data?.value?.workspace.name
    ? `${data?.value?.workspace.name} settings`
    : 'Workspace settings')
useHead({
    title: pageTitle
})

const onUpdateSuccess = async () => {
    refetch()
}
</script>

<template>
    <div class="size-full lg:max-w-xl">
        <WorkspaceUpdateWorkspaceForm v-if="data" :data="data.workspace" :is-owner="data.is_owner"
            :is-admin="data.is_admin" :on-success="onUpdateSuccess" />
        <Loader v-else-if="isPending && !isRefetching" class="min-h-auto h-96" />
    </div>
</template>
