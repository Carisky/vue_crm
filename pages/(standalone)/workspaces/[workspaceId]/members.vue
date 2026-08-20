<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'

import authenticatedPageProtectMiddleware from '~/middleware/page-protect/authenticatedPage'
import MemberList from '~/components/workspace/member/MemberList.vue'
import type { WorkspaceMembersResponse } from '~/lib/types';

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

const { data, isFetching, isRefetching, suspense } = useQuery<WorkspaceMembersResponse>
    ({
        queryKey,
        queryFn: async () => {
            return await requestFetch<WorkspaceMembersResponse>(
                `/api/workspaces/${workspaceId.value}/members`,
            )
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
                v-if="!!data?.members.length && !!workspaceId"
                :data="data.members"
                :workspace-id="String(workspaceId)"
                :current-user-id="data.current_user_id"
                :current-user-is-owner="data.is_owner"
                :current-user-is-admin="data.is_admin"
            />
        </div>
    </div>
</template>
