<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'

import authenticatedPageProtectMiddleware from '~/middleware/page-protect/authenticatedPage'
import MemberList from '~/components/workspace/member/MemberList.vue'
import type { WorkspaceMember } from '~/lib/types';

definePageMeta({
    layout: 'standalone',
    middleware: [authenticatedPageProtectMiddleware]
})

useHead({
    title: 'Members'
})

const route = useRoute()
const requestFetch = useRequestFetch()
const workspaceId = computed(() => route.params['workspaceId'])
const queryKey = computed(() => ['workspace-members', workspaceId.value])

const { data, isFetching, isRefetching, suspense } = useQuery<WorkspaceMember[]>
    ({
        queryKey,
        queryFn: async () => {
            const data = await requestFetch<{ members: WorkspaceMember[] }>(
                `/api/workspaces/${workspaceId.value}/members`,
            )
            return (data?.members ?? []) as WorkspaceMember[]
        },
        staleTime: Infinity,
        experimental_prefetchInRender: true
    })

onServerPrefetch(async () => {
    await suspense()
})
</script>

<template>
    <div class="size-full lg:max-w-xl">
        <Loader v-if="isFetching && !isRefetching" class="min-h-auto h-96" />
        <div v-else class="flex flex-col gap-4">
            <MemberList
                v-if="!!data?.length && !!workspaceId"
                :data="data"
                :workspace-id="String(workspaceId)"
            />
        </div>
    </div>
</template>
