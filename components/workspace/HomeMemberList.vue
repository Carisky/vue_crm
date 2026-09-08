<script setup lang="ts">
import type { MEMBER_ROLE } from '~/lib/constant';
import MemberAvatar from './member/MemberAvatar.vue';

const { members, total } = defineProps<{
    members: {
        $id: string;
        name: string | null;
        email: string;
        membership_id: string;
        role: keyof typeof MEMBER_ROLE;
        is_owner: boolean;
    }[];
    total: number;
}>()

const route = useRoute()
const { t } = useAppI18n()
</script>

<template>
    <section class="rounded-lg border bg-card p-3 text-card-foreground">
            <div class="flex items-center justify-between gap-3">
                <p class="font-semibold">
                    {{ t('nav.members') }} <span class="text-muted-foreground">{{ total }}</span>
                </p>
                <Button variant="ghost" size="icon" class="size-8" :as-child="true">
                    <NuxtLink :href="`/workspaces/${route.params['workspaceId']}/members`">
                        <Icon name="lucide:settings" size="16px" class="size-4 text-muted-foreground" />
                    </NuxtLink>
                </Button>
            </div>
            <ul class="mt-2 flex items-center -space-x-2">
                <li v-for="member of members" :key="member.$id" class="group relative" :title="`${member.name ?? member.email} · ${member.email}`">
                    <MemberAvatar :name="member.name ?? member.email" class="size-9 border-2 border-card" />
                    <WorkspaceMemberRoleIcon :role="member.role" :is-owner="member.is_owner"
                        class="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full bg-card p-0.5" />
                </li>
                <li v-if="total > members.length" class="ml-3 text-xs font-medium text-muted-foreground">+{{ total - members.length }}</li>
                <li v-if="!members?.length" class="text-sm text-muted-foreground">
                    {{ t('members.noneFound') }}
                </li>
            </ul>
    </section>
</template>
