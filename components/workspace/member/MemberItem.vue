<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { toast } from 'vue-sonner'

import { MEMBER_ROLE } from '~/lib/constant'
import type { WorkspaceMember } from '~/lib/types'
import { createWorkspaceMemberClient } from '~/lib/workspace-member-client'
import { ConfirmModal } from '#components'

const {
    data,
    workspaceId,
    totalMembers,
    currentUserId,
    currentUserIsOwner,
    currentUserIsAdmin,
    members,
} = defineProps<{
    data: WorkspaceMember
    workspaceId: string
    totalMembers: number
    currentUserId: string
    currentUserIsOwner: boolean
    currentUserIsAdmin: boolean
    members: WorkspaceMember[]
}>()

const queryClient = useQueryClient()
const { t } = useAppI18n()
const memberClient = createWorkspaceMemberClient((url, options) =>
    $fetch(url, options),
)

const isSelf = computed(() => data.$id === currentUserId)
const isMember = computed(() => data.role === MEMBER_ROLE.member)
const displayName = computed(() => data.name ?? t('members.unknown'))
const successorUserId = ref('')
const transferModalOpen = ref(false)
const successorCandidates = computed(() => members.filter((member) => member.$id !== data.$id))

const canUpgradeOtherMembers = computed(
    () =>
        !isSelf.value
        && (currentUserIsOwner || currentUserIsAdmin)
        && isMember.value,
)

const canDowngradeOtherMembers = computed(
    () =>
        !isMember.value
        && (
            (currentUserIsOwner && !isSelf.value)
            || (!currentUserIsOwner && isSelf.value)
        ),
)

const canBeRemoved = computed(
    () =>
        totalMembers > 1
        && (
            (currentUserIsOwner && !isSelf.value)
            || isSelf.value
            || (currentUserIsAdmin && isMember.value)
        ),
)

const currentUserCanControl = computed(
    () =>
        (currentUserIsOwner && !isSelf.value)
        || (currentUserIsAdmin && (isSelf.value || isMember.value))
        || (!currentUserIsOwner && !currentUserIsAdmin && isSelf.value),
)

const { openModal } = useConfirmModal()

const { isPending: isDeleting, mutateAsync: removeMember } = useMutation({
    mutationFn: async () => {
        const res = await memberClient.remove(data.membership_id, successorUserId.value || undefined)
        if (res.ok) {
            await queryClient.refetchQueries({ queryKey: ['workspace-members', workspaceId] })

            if (isSelf.value) await navigateTo('/')

            toast.success(isSelf.value ? t('members.youLeft') : t('members.removed'))
        } else toast.error(isSelf.value ? t('members.leaveFailed') : t('members.removeFailed'))
    },
    onError: (error: any) => toast.error(
        error?.data?.statusMessage
        ?? (isSelf.value ? t('members.leaveFailed') : t('members.removeFailed'))
    )
})

const { isPending: isUpdatingRole, mutateAsync: updateMemberRole } = useMutation({
    mutationFn: async (role: 'ADMIN' | 'MEMBER') =>
        await memberClient.updateRole(data.membership_id, role),
    onSuccess: async (_, role) => {
        await queryClient.refetchQueries({ queryKey: ['workspace-members', workspaceId] })
        toast.success(role === 'ADMIN' ? t('members.adminAssigned') : t('members.adminRemoved'))
    },
    onError: (error: any) => toast.error(
        error?.data?.statusMessage ?? t('members.roleUpdateFailed'),
    ),
})

const changeMemberRole = async () => {
    await updateMemberRole(isMember.value ? 'ADMIN' : 'MEMBER')
}

const openRemoveMemberModal = () => {
    if ((data.creator_project_count ?? 0) > 0) {
        successorUserId.value ||= successorCandidates.value[0]?.$id ?? ''
        transferModalOpen.value = true
        return
    }
    openModal(ConfirmModal, {
        onConfirm: async () => { await removeMember() },
        title: isSelf.value ? t('members.leave') : t('members.remove'),
        message: isSelf.value
            ? t('members.leaveConfirm')
            : t('members.removeConfirm'),
        variant: 'destructive'
    })
}

const confirmTransferAndRemove = async () => {
    if (!successorUserId.value) return
    await removeMember()
    transferModalOpen.value = false
}
</script>

<template>
    <div class="flex min-w-0 items-center gap-3">
        <div class="flex min-w-0 flex-1 items-center gap-3">
            <WorkspaceMemberAvatar :name="displayName" class="size-10 shrink-0" fallback-class="text-lg" />
            <div class="min-w-0">
                <p class="truncate text-sm font-semibold">{{ displayName }}</p>
                <p class="truncate text-xs text-muted-foreground">{{ data.email }}</p>
            </div>
        </div>

        <div class="flex shrink-0 items-center gap-1.5">
            <div class="flex items-center gap-1 opacity-55 capitalize">
                <WorkspaceMemberRoleIcon :role="data.role" :is-owner="data.is_owner" />
                <Badge v-if="isSelf" variant="destructive" class="text-[10px]">
                    {{ t('members.you') }}
                </Badge>
            </div>

            <DropdownMenu v-if="currentUserCanControl">
                <DropdownMenuTrigger :as-child="true">
                    <Button variant="ghost" size="icon" class="size-8 shrink-0">
                        <Icon v-if="isDeleting || isUpdatingRole" name="svg-spinners:8-dots-rotate" size="16px"
                            class="size-4 text-muted-foreground" />
                        <Icon v-else name="heroicons:ellipsis-vertical-16-solid" size="16px"
                            class="size-4 text-muted-foreground" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="bottom" align="end">
                    <DropdownMenuItem v-if="canUpgradeOtherMembers" class="font-medium" @select="changeMemberRole">
                        {{ t('members.setAdmin') }}
                    </DropdownMenuItem>
                    <DropdownMenuItem v-if="canDowngradeOtherMembers" class="font-medium" @select="changeMemberRole">
                        {{ t('members.setMember') }}
                    </DropdownMenuItem>
                    <DropdownMenuItem v-if="canBeRemoved" @select="openRemoveMemberModal"
                        class="font-medium text-amber-700">
                        <span v-if="isSelf">{{ t('members.leave') }}</span>
                        <span v-else>{{ t('members.removeNamed', { name: displayName }) }}</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    </div>
    <ResponsiveModal :open="transferModalOpen" @open-update="transferModalOpen = $event">
        <Card class="size-full border-none shadow-none">
            <CardHeader>
                <CardTitle>{{ t('members.transferProjects') }}</CardTitle>
                <CardDescription>{{ t('members.transferProjectsDescription', { count: data.creator_project_count ?? 0 }) }}</CardDescription>
            </CardHeader>
            <CardContent class="space-y-4">
                <label v-for="member in successorCandidates" :key="member.$id"
                    class="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2">
                    <input v-model="successorUserId" type="radio" :value="member.$id" />
                    <span class="min-w-0 flex-1 truncate">{{ member.name ?? member.email }}</span>
                    <WorkspaceMemberRoleIcon :role="member.role" :is-owner="member.is_owner" />
                </label>
                <div class="flex justify-end gap-2">
                    <Button variant="secondary" @click="transferModalOpen = false">{{ t('common.cancel') }}</Button>
                    <Button variant="destructive" :disabled="isDeleting || !successorUserId" @click="confirmTransferAndRemove">
                        {{ t('common.confirm') }}
                    </Button>
                </div>
            </CardContent>
        </Card>
    </ResponsiveModal>
</template>
