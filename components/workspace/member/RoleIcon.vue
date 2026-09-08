<script setup lang="ts">
import type { WorkspaceMember } from '~/lib/types'

const { role, isOwner } = defineProps<{
    role: WorkspaceMember['role']
    isOwner: boolean
}>()
const { t } = useAppI18n()
const label = computed(() => isOwner ? t('members.owner') : role === 'admin' ? t('members.admin') : t('members.member'))
const icon = computed(() => isOwner ? 'lucide:crown' : role === 'admin' ? 'lucide:shield' : 'lucide:user')
</script>

<template>
    <Icon :name="icon" class="size-4 shrink-0 text-muted-foreground" :title="label" :aria-label="label" />
</template>
