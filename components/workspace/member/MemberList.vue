<script setup lang="ts">
import { MEMBER_ROLE } from '~/lib/constant';
import type { WorkspaceMember } from '~/lib/types';
import useAuthStore from '~/stores/auth';
import MemberItem from './MemberItem.vue';

const { data, workspaceId, periodDays } = defineProps<{
    data: WorkspaceMember[];
    workspaceId: string;
    periodDays: number;
}>()

const route = useRoute()
const authStore = useAuthStore()

const currentUserMembership = data.find(({ $id }) => $id === authStore.user?.id)
const currentUserIsOwner = currentUserMembership!.is_owner
const currentUserIsAdmin = !currentUserIsOwner && currentUserMembership!.role === MEMBER_ROLE.admin
</script>

<template>
    <div class="space-y-3 w-full">
        <div class="flex flex-wrap items-center gap-3 text-sm font-semibold">
            <Button variant="secondary" size="sm" :as-child="true">
                <NuxtLink :href="`/workspaces/${route.params['workspaceId']}`" class="flex items-center gap-2">
                    <Icon name="lucide:arrow-left" size="16px" class="size-4" />
                    Back
                </NuxtLink>
            </Button>
            <h2 class="text-lg font-semibold leading-tight">Member list</h2>
        </div>
        <div class="space-y-2 rounded-2xl border border-border/70 bg-card/50 p-1">
            <template v-for="member of data" :key="member.email">
                <div class="rounded-xl border border-border/80 bg-background/80 px-3 py-3">
                    <MemberItem
                        :data="member"
                        :workspace-id="workspaceId"
                        :total-members="data.length"
                        :period-days="periodDays"
                        :current-user-membership-role="currentUserMembership!.role"
                        :current-user-is-owner="currentUserIsOwner"
                        :current-user-is-admin="currentUserIsAdmin"
                    />
                </div>
            </template>
        </div>
    </div>
</template>
