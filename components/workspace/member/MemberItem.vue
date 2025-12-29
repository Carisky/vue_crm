<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';

import { MEMBER_ROLE } from '~/lib/constant';
import type { WorkspaceMember } from '~/lib/types';
import useAuthStore from '~/stores/auth';
import {
    ConfirmModal,
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '#components';

const {
    data,
    workspaceId,
    totalMembers,
    currentUserIsOwner,
    currentUserIsAdmin,
    periodDays,
} = defineProps<{
    data: WorkspaceMember;
    workspaceId: string;
    totalMembers: number;
    currentUserIsOwner: boolean;
    currentUserIsAdmin: boolean;
    periodDays: number;
}>()

const queryClient = useQueryClient()
const authStore = useAuthStore()

const isSelf = computed(() => data.$id === authStore.user?.id)
const isMember = computed(() => data.role === MEMBER_ROLE.member)
const displayName = computed(() => data.name ?? 'Unknown member')

const canUpgradeOtherMembers = computed(() =>
    !isSelf.value
    && (currentUserIsOwner || currentUserIsAdmin)
    && isMember.value) // only admin can upgrade members to admin

const canDowngradeOtherMembers = computed(() =>
    !isMember.value
    && (
        (currentUserIsOwner && !isSelf.value)
        || (!currentUserIsOwner && isSelf.value)
    )
) // only allow self-downgrade or by workspace owner

const canBeRemoved = computed(() =>
    totalMembers > 1
    && ((currentUserIsOwner && !isSelf.value) || isSelf.value || (currentUserIsAdmin && isMember.value))
)  // owner can remove members or admins remove members

const currentUserCanControl = computed(() =>
    (currentUserIsOwner && !isSelf.value)
    || (currentUserIsAdmin && (isSelf.value || isMember.value))
    || (!currentUserIsOwner && !currentUserIsAdmin && isSelf.value)
)

const reportedHours = computed(() => {
    const value = data.actual_hours ?? 0
    return Number(value)
})

type MemberChartEntry = {
    month: string;
    label: string;
    hours: number;
    doneHours: number;
    reviewHours: number;
    percentage: number;
    isOverTarget: boolean;
    barHeight: number;
    doneHeight: number;
    reviewHeight: number;
    isZero: boolean;
}

const monthlyTargetHours = computed(
    () => authStore.user?.monthlyWorkloadTargetHours ?? 160,
)
const normalizedTargetHours = computed(() =>
    Math.max(1, monthlyTargetHours.value),
)

const chartSeries = computed<MemberChartEntry[]>(() => {
    const source = data.monthly_hours ?? []
    return source.map((entry) => {
        const doneHours = Number(entry.done_hours ?? 0)
        const reviewHours = Number(entry.review_hours ?? 0)
        const fallbackHours = Number(entry.hours ?? 0)
        const hours = doneHours || reviewHours ? doneHours + reviewHours : fallbackHours
        const fraction = normalizedTargetHours.value
            ? hours / normalizedTargetHours.value
            : 0
        const isZero = hours === 0
        const cappedFraction = Math.min(Math.max(fraction, 0), 1)
        const barHeight = isZero
            ? 100
            : Math.min(Math.max(cappedFraction * 100, 4), 100)
        const isOverTarget = hours > normalizedTargetHours.value
        const hasBreakdown = doneHours > 0 || reviewHours > 0
        const donePortion = hasBreakdown ? doneHours : hours
        const reviewPortion = hasBreakdown ? reviewHours : 0
        const doneHeight = hours > 0 ? (barHeight * (donePortion / hours)) : 0
        const reviewHeight = hours > 0 ? (barHeight * (reviewPortion / hours)) : 0

        return {
            month: entry.month,
            label: entry.label,
            hours,
            doneHours: donePortion,
            reviewHours: reviewPortion,
            percentage: cappedFraction,
            isOverTarget,
            barHeight,
            doneHeight,
            reviewHeight,
            isZero,
        }
    })
})

const targetLabel = computed(
    () => `${Math.round(normalizedTargetHours.value)}h target`,
)

const chartDialogOpen = ref(false)
const openDetailedChart = () => {
    if (!chartSeries.value.length) return
    chartDialogOpen.value = true
}
const handleChartDialogUpdate = (value: boolean) => {
    chartDialogOpen.value = value
}
const formatBarTitle = (entry: MemberChartEntry) =>
    `${entry.label}: ${entry.hours.toFixed(1)}h total (${entry.doneHours.toFixed(1)}h done, ${entry.reviewHours.toFixed(1)}h review)`

// Update member role

// Remove member
const { openModal } = useConfirmModal()

const { isPending: isDeleting, mutate: removeMember } = useMutation({
    mutationFn: async () => {
        const res =
            await $fetch('/api/workspaces/remove-member', {
                method: 'DELETE', body: { membershipId: data.membership_id }
            })
        if (res.ok) {
            await queryClient.refetchQueries({ queryKey: ['members', workspaceId] }) // re-fetch workspace members

            // navigate to homepage if user leaves the workspace
            if (isSelf.value) await navigateTo('/')

            toast.success(isSelf.value ? 'You left the workspace' : 'Member removed')
        } else toast.error(isSelf.value ? 'Failed to leave workspace' : 'Failed to remove member')
    },
    onError: () => toast.error(isSelf.value ? 'Failed to leave workspace' : 'Failed to remove member')
})

const openRemoveMemberModal = () => {
    openModal(ConfirmModal, {
        onConfirm: removeMember,
        title: isSelf.value ? 'Leave workspace' : 'Remove member',
        message: isSelf.value
            ? 'Are you sure you want to leave this workspace?'
            : 'This member will be removed from the workspace.',
        variant: 'destructive'
    })
}
</script>

<template>
    <div class="flex flex-1 flex-col gap-3">
        <div class="flex items-start justify-between gap-4">
            <div class="flex items-center gap-4">
                <WorkspaceMemberAvatar :name="displayName" class="size-10" fallback-class="text-lg" />
                <div>
                    <p class="text-sm font-semibold">{{ displayName }}</p>
                    <p class="text-xs text-muted-foreground">{{ data.email }}</p>
                </div>
            </div>
            <div class="text-right">
                <p class="text-[10px] uppercase text-muted-foreground tracking-[0.15em]">Target</p>
                <p class="text-sm font-semibold text-foreground">{{ targetLabel }}</p>
            </div>
        </div>

        <p class="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Monthly actuals</p>
        <div class="grid grid-cols-3 gap-3 text-center">
            <div
                v-for="entry in chartSeries"
                :key="entry.month"
                class="flex flex-col items-center justify-center gap-2 text-[10px] text-muted-foreground"
            >
                <button
                    type="button"
                    class="flex flex-col items-center gap-3"
                    :title="formatBarTitle(entry)"
                    :aria-label="formatBarTitle(entry)"
                    @click="openDetailedChart"
                >
                    <span class="text-[11px] font-semibold text-muted-foreground">
                        {{ entry.hours.toFixed(1) }}h
                    </span>
                    <div
                        class="relative h-24 w-10 overflow-hidden rounded-2xl border border-border/50 bg-muted/20"
                        :class="entry.isOverTarget ? 'ring-2 ring-rose-500/40' : ''"
                    >
                        <span
                            v-if="entry.isZero"
                            class="absolute inset-x-0 bottom-0 rounded-2xl bg-muted/40 opacity-60"
                            :style="{ height: `${entry.barHeight}%` }"
                        />
                        <template v-else>
                            <span
                                class="absolute inset-x-0 bottom-0 rounded-2xl bg-slate-400/70 transition-all"
                                :style="{ height: `${entry.doneHeight}%` }"
                            />
                            <span
                                v-if="entry.reviewHeight > 0"
                                class="absolute inset-x-0 rounded-2xl bg-sky-400 transition-all"
                                :style="{ height: `${entry.reviewHeight}%`, bottom: `${entry.doneHeight}%` }"
                            />
                        </template>
                    </div>
                    <span class="text-[10px]">{{ entry.label }}</span>
                </button>
            </div>
        </div>
        <p class="text-[10px] text-muted-foreground">
            Click a column to open the detailed chart.
        </p>
        <div class="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span class="flex items-center gap-1">
                <span class="size-2 rounded-full bg-slate-400/80" />
                Done
            </span>
            <span class="flex items-center gap-1">
                <span class="size-2 rounded-full bg-sky-400" />
                In review
            </span>
        </div>
        <div class="flex items-center gap-1 opacity-55 capitalize">
            <Badge v-if="data.role === MEMBER_ROLE.admin" class="text-[10px]">
                {{ data.role }}
            </Badge>
            <Badge v-if="isSelf" variant="destructive" class="text-[10px]">
                You
            </Badge>
        </div>
    </div>
        <DropdownMenu v-if="currentUserCanControl">
            <DropdownMenuTrigger :as-child="true">
                <Button variant="secondary" size="icon" class="ml-auto">
                    <Icon v-if="isDeleting" name="svg-spinners:8-dots-rotate" size="16px"
                        class="size-4 text-muted-foreground" />
                    <Icon v-else name="heroicons:ellipsis-vertical-16-solid" size="16px"
                        class="size-4 text-muted-foreground" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end">
                <DropdownMenuItem v-if="canUpgradeOtherMembers" class="font-medium">
                    Set as Administrator
                </DropdownMenuItem>
                <DropdownMenuItem v-if="canDowngradeOtherMembers" class="font-medium">
                    Set as Member
                </DropdownMenuItem>
                <DropdownMenuItem v-if="canBeRemoved" @select="openRemoveMemberModal"
                    class="font-medium text-amber-700">
                    <span v-if="isSelf">Leave workspace</span>
                    <span v-else>Remove {{ displayName }}</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
        <Dialog :open="chartDialogOpen" @update:open="handleChartDialogUpdate">
            <DialogContent
                v-if="chartSeries.length"
                class="max-w-3xl rounded-2xl border border-border bg-card p-6 shadow-lg"
            >
                <DialogTitle class="text-lg font-semibold">
                    Monthly hours — {{ data.name ?? 'member' }}
                </DialogTitle>
                <DialogDescription class="text-sm text-muted-foreground">
                    Each column shows how many hours were reported for the month.
                    The {{ targetLabel }} value checks what is considered 100% load.
                </DialogDescription>
                <div class="mt-6">
                    <div class="flex items-end justify-between gap-6 h-48">
                        <div
                            v-for="entry in chartSeries"
                            :key="`modal-${entry.month}`"
                            class="flex w-16 flex-col items-center justify-end gap-3"
                        >
                            <span class="text-xs font-semibold text-muted-foreground">
                                {{ entry.hours.toFixed(1) }}h
                            </span>
                            <div
                                class="relative h-40 w-full overflow-hidden rounded-xl border border-border/50 bg-muted/30"
                                :class="entry.isOverTarget ? 'ring-2 ring-rose-500/40' : ''"
                            >
                                <span
                                    v-if="entry.isZero"
                                    class="absolute inset-x-0 bottom-0 rounded-xl bg-muted/40 opacity-60"
                                    :style="{ height: `${entry.barHeight}%` }"
                                />
                                <template v-else>
                                    <span
                                        class="absolute inset-x-0 bottom-0 rounded-xl bg-slate-400/70 transition-all"
                                        :style="{ height: `${entry.doneHeight}%` }"
                                    />
                                    <span
                                        v-if="entry.reviewHeight > 0"
                                        class="absolute inset-x-0 rounded-xl bg-sky-400 transition-all"
                                        :style="{ height: `${entry.reviewHeight}%`, bottom: `${entry.doneHeight}%` }"
                                    />
                                </template>
                            </div>
                            <span class="text-[11px] text-muted-foreground">{{ entry.label }}</span>
                        </div>
                    </div>
                    <div class="mt-6 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>Target: {{ targetLabel }}</span>
                        <div class="flex items-center gap-3">
                            <span class="flex items-center gap-1">
                                <span class="size-2 rounded-full bg-slate-400/80" />
                                Done
                            </span>
                            <span class="flex items-center gap-1">
                                <span class="size-2 rounded-full bg-sky-400" />
                                In review
                            </span>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>

</template>
