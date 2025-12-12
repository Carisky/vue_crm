<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'

import useAuthStore from '~/stores/auth'

const queryClient = useQueryClient()
const authStore = useAuthStore()

const { isPending, mutate } = useMutation({
    mutationFn: () => fetch('/api/auth/sign-out', { method: 'POST' }),
    onSuccess: async () => {
        await queryClient.invalidateQueries({ type: 'active' })
        await queryClient.resetQueries({ type: 'inactive' })
        await navigateTo('/sign-in')
    }
})
</script>

<template>
    <div
        v-if="isPending"
        class="size-10 rounded-full flex items-center justify-center bg-muted border border-border"
    >
        <Icon name="svg-spinners:8-dots-rotate" size="16px" class="size-4 text-muted-foreground" />
    </div>
    <DropdownMenu v-else :modal="false">
        <DropdownMenuTrigger class="outline-none relative">
            <Avatar class="size-10 hover:opacity-75 transition border border-border bg-muted">
                <AvatarFallback class="bg-muted font-medium text-foreground flex items-center justify-center">
                    {{ (authStore.user?.name || authStore.user?.email || 'U')[0].toUpperCase() }}
                </AvatarFallback>
            </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="bottom" :side-offset="10" class="w-60">
            <div class="flex flex-col items-center justify-center gap-2 px-2.5 py-4">
                <Avatar class="size-[52px] border border-border bg-muted">
                    <AvatarFallback
                        class="bg-muted font-medium text-xl text-foreground flex items-center justify-center">
                        {{ (authStore.user?.name || authStore.user?.email || 'U')[0].toUpperCase() }}
                    </AvatarFallback>
                </Avatar>
                <div class="flex flex-col items-center justify-center">
                    <p class="text-sm font-medium text-foreground">{{ authStore.user?.name ?? 'User' }}</p>
                    <p class="text-xs text-muted-foreground">{{ authStore.user?.email }}</p>
                </div>
            </div>
            <DottedSeparator class="mb-1" />
            <DropdownMenuItem @select="mutate"
                class="h-10 flex items-center justify-between text-destructive font-medium cursor-pointer">
                <Icon name="lucide:log-out" size="16px" class="size-4 mr-1" /> Sign out
            </DropdownMenuItem>
        </DropdownMenuContent>
    </DropdownMenu>
</template>
