<script setup lang="ts">
import type { WorkspaceMember } from '~/lib/types';
import MemberItem from './MemberItem.vue';

const { data, workspaceId, currentUserId, currentUserIsOwner, currentUserIsAdmin } = defineProps<{
    data: WorkspaceMember[];
    workspaceId: string;
    currentUserId: string;
    currentUserIsOwner: boolean;
    currentUserIsAdmin: boolean;
}>()

const route = useRoute()
const { t } = useAppI18n()
</script>

<template>
    <div class="space-y-3 w-full">
        <div class="flex flex-wrap items-center gap-3 text-sm font-semibold">
            <Button variant="secondary" size="sm" :as-child="true">
                <NuxtLink :href="`/workspaces/${route.params['workspaceId']}`" class="flex items-center gap-2">
                    <Icon name="lucide:arrow-left" size="16px" class="size-4" />
                    {{ t('common.back') }}
                </NuxtLink>
            </Button>
            <h2 class="text-lg font-semibold leading-tight">{{ t('members.list') }}</h2>
        </div>
        <div class="space-y-2 rounded-2xl border border-border/70 bg-card/50 p-1">
            <template v-for="member of data" :key="member.email">
                <div class="rounded-xl border border-border/80 bg-background/80 px-3 py-3">
                    <MemberItem
                        :data="member"
                        :workspace-id="workspaceId"
                        :total-members="data.length"
                        :current-user-id="currentUserId"
                        :current-user-is-owner="currentUserIsOwner"
                        :current-user-is-admin="currentUserIsAdmin"
                    />
                </div>
            </template>
        </div>
    </div>
</template>
