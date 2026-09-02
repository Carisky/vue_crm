<script setup lang="ts">
import { toast } from 'vue-sonner'

type AgentKey = {
    id: string
    name: string
    prefix: string
    last_used_at: string | null
    revoked_at: string | null
    created_at: string
}

type AgentProposal = {
    id: string
    title: string
    summary: string | null
    workspace_name: string | null
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'FAILED'
    operations: unknown[]
    operation_summaries: string[]
    error: string | null
    created_at: string
}

const { t, locale } = useAppI18n()
const requestFetch = useRequestFetch()
const keyName = ref('Codex')
const generatedToken = ref<string | null>(null)
const isGenerating = ref(false)
const reviewingId = ref<string | null>(null)
const revokingId = ref<string | null>(null)

const { data, refresh, status } = await useAsyncData('profile-agent-access', async () => {
    const [keys, proposals] = await Promise.all([
        requestFetch<{ keys: AgentKey[] }>('/api/profile/agent-keys'),
        requestFetch<{ proposals: AgentProposal[] }>('/api/profile/agent-proposals'),
    ])
    return { keys: keys.keys, proposals: proposals.proposals }
})

const activeKeys = computed(() => data.value?.keys.filter((key) => !key.revoked_at) ?? [])
const pendingProposals = computed(() => data.value?.proposals.filter((item) => item.status === 'PENDING') ?? [])
const reviewedProposals = computed(() => data.value?.proposals.filter((item) => item.status !== 'PENDING') ?? [])

const formatDate = (value: string | null) => value
    ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : t('agent.never')

const generateKey = async () => {
    if (!keyName.value.trim()) return
    isGenerating.value = true
    try {
        const response = await $fetch<{ token: string }>('/api/profile/agent-keys', {
            method: 'POST',
            body: { name: keyName.value.trim() },
        })
        generatedToken.value = response.token
        await refresh()
        toast.success(t('agent.keyCreated'))
    } catch (error) {
        console.error(error)
        toast.error(t('agent.keyCreateFailed'))
    } finally {
        isGenerating.value = false
    }
}

const copyToken = async () => {
    if (!generatedToken.value) return
    await navigator.clipboard.writeText(generatedToken.value)
    toast.success(t('agent.keyCopied'))
}

const revokeKey = async (keyId: string) => {
    revokingId.value = keyId
    try {
        await $fetch(`/api/profile/agent-keys/${keyId}`, { method: 'DELETE' })
        await refresh()
        toast.success(t('agent.keyRevoked'))
    } catch (error) {
        console.error(error)
        toast.error(t('error.generic'))
    } finally {
        revokingId.value = null
    }
}

const reviewProposal = async (proposalId: string, decision: 'approve' | 'reject') => {
    reviewingId.value = proposalId
    try {
        await $fetch(`/api/profile/agent-proposals/${proposalId}/${decision}`, { method: 'POST' })
        await refresh()
        toast.success(decision === 'approve' ? t('agent.proposalApproved') : t('agent.proposalRejected'))
    } catch (error) {
        console.error(error)
        toast.error(t('agent.proposalReviewFailed'))
        await refresh()
    } finally {
        reviewingId.value = null
    }
}

const statusLabel = (proposalStatus: AgentProposal['status']) => ({
    PENDING: t('agent.statusPending'),
    APPROVED: t('agent.statusApproved'),
    REJECTED: t('agent.statusRejected'),
    FAILED: t('agent.statusFailed'),
})[proposalStatus]
</script>

<template>
    <Card class="border">
        <CardHeader>
            <CardTitle class="flex items-center gap-2 text-lg font-semibold">
                <Icon name="lucide:bot" class="size-5" />
                {{ t('agent.title') }}
            </CardTitle>
            <CardDescription>{{ t('agent.description') }}</CardDescription>
        </CardHeader>
        <CardContent class="space-y-5">
            <div class="flex flex-col gap-2 sm:flex-row">
                <Input v-model="keyName" :placeholder="t('agent.keyNamePlaceholder')" maxlength="80" />
                <Button :disabled="isGenerating || !keyName.trim()" class="sm:shrink-0" @click="generateKey">
                    <Icon v-if="isGenerating" name="svg-spinners:3-dots-fade" class="mr-2 size-4" />
                    {{ t('agent.generateKey') }}
                </Button>
            </div>

            <div v-if="generatedToken" class="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                <p class="text-sm font-semibold">{{ t('agent.copyKeyNow') }}</p>
                <p class="mt-1 text-xs opacity-80">{{ t('agent.keyShownOnce') }}</p>
                <div class="mt-3 flex items-center gap-2">
                    <code class="min-w-0 flex-1 overflow-x-auto rounded bg-background/80 px-3 py-2 text-xs">{{ generatedToken }}</code>
                    <Button size="sm" variant="outline" @click="copyToken">
                        <Icon name="lucide:copy" class="mr-1 size-4" /> {{ t('agent.copy') }}
                    </Button>
                </div>
            </div>

            <div class="space-y-2">
                <p class="text-sm font-semibold">{{ t('agent.activeKeys') }}</p>
                <p v-if="status === 'pending'" class="text-sm text-muted-foreground">{{ t('common.loading') }}</p>
                <p v-else-if="!activeKeys.length" class="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    {{ t('agent.noKeys') }}
                </p>
                <div v-for="key in activeKeys" :key="key.id" class="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div class="min-w-0">
                        <p class="font-medium">{{ key.name }}</p>
                        <p class="mt-1 text-xs text-muted-foreground">
                            <code>{{ key.prefix }}…</code> · {{ t('agent.lastUsed') }}: {{ formatDate(key.last_used_at) }}
                        </p>
                    </div>
                    <Button size="sm" variant="destructive" :disabled="revokingId === key.id" @click="revokeKey(key.id)">
                        {{ t('agent.revoke') }}
                    </Button>
                </div>
            </div>
        </CardContent>
    </Card>

    <Card class="border">
        <CardHeader>
            <CardTitle class="flex items-center justify-between gap-3 text-lg font-semibold">
                <span>{{ t('agent.proposals') }}</span>
                <Badge variant="secondary">{{ pendingProposals.length }}</Badge>
            </CardTitle>
            <CardDescription>{{ t('agent.proposalsDescription') }}</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
            <p v-if="!pendingProposals.length" class="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                {{ t('agent.noPendingProposals') }}
            </p>
            <article v-for="proposal in pendingProposals" :key="proposal.id" class="rounded-lg border border-primary/30 bg-primary/5 p-4">
                <div class="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <p class="font-semibold">{{ proposal.title }}</p>
                        <p class="mt-1 text-xs text-muted-foreground">{{ proposal.workspace_name }} · {{ formatDate(proposal.created_at) }}</p>
                    </div>
                    <Badge>{{ statusLabel(proposal.status) }}</Badge>
                </div>
                <p v-if="proposal.summary" class="mt-3 text-sm text-muted-foreground">{{ proposal.summary }}</p>
                <ul class="mt-3 space-y-1 text-sm">
                    <li v-for="(summary, index) in proposal.operation_summaries" :key="index">• {{ summary }}</li>
                </ul>
                <details class="mt-3 text-xs">
                    <summary class="cursor-pointer font-medium text-muted-foreground">{{ t('agent.showPayload') }}</summary>
                    <pre class="mt-2 max-h-80 overflow-auto rounded bg-muted p-3">{{ JSON.stringify(proposal.operations, null, 2) }}</pre>
                </details>
                <div class="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" :disabled="reviewingId === proposal.id" @click="reviewProposal(proposal.id, 'approve')">
                        <Icon name="lucide:check" class="mr-1 size-4" /> {{ t('agent.approve') }}
                    </Button>
                    <Button size="sm" variant="outline" :disabled="reviewingId === proposal.id" @click="reviewProposal(proposal.id, 'reject')">
                        <Icon name="lucide:x" class="mr-1 size-4" /> {{ t('agent.reject') }}
                    </Button>
                </div>
            </article>

            <details v-if="reviewedProposals.length" class="border-t pt-4">
                <summary class="cursor-pointer text-sm font-semibold">{{ t('agent.history') }} ({{ reviewedProposals.length }})</summary>
                <div class="mt-3 space-y-2">
                    <div v-for="proposal in reviewedProposals" :key="proposal.id" class="rounded-lg border p-3">
                        <div class="flex items-center justify-between gap-2">
                            <p class="text-sm font-medium">{{ proposal.title }}</p>
                            <Badge :variant="proposal.status === 'APPROVED' ? 'default' : 'secondary'">{{ statusLabel(proposal.status) }}</Badge>
                        </div>
                        <p v-if="proposal.error" class="mt-2 text-xs text-destructive">{{ proposal.error }}</p>
                    </div>
                </div>
            </details>
        </CardContent>
    </Card>
</template>
