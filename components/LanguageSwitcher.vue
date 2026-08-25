<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { toast } from 'vue-sonner'

import { localeLabels } from '~/lib/i18n'
import { appLocales, type ApiUser, type AppLocale } from '~/lib/types'
import useAuthStore from '~/stores/auth'

const authStore = useAuthStore()
const queryClient = useQueryClient()
const { locale, t } = useAppI18n()

const { isPending, mutate } = useMutation({
    mutationFn: (nextLocale: AppLocale) => $fetch<{ locale: AppLocale }>('/api/profile/locale', {
        method: 'PATCH',
        body: { locale: nextLocale },
    }),
    onSuccess: ({ locale: savedLocale }) => {
        if (!authStore.user) return

        const updatedUser: ApiUser = { ...authStore.user, locale: savedLocale }
        authStore.setUser(updatedUser)
        queryClient.setQueryData(['auth/me'], updatedUser)
    },
    onError: () => toast.error(t('language.saveError')),
})
</script>

<template>
    <DropdownMenu :modal="false">
        <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="sm" class="gap-1.5 px-2" :disabled="isPending"
                :aria-label="t('language.label')" :title="t('language.label')">
                <Icon v-if="isPending" name="svg-spinners:8-dots-rotate" size="16px" class="size-4" />
                <Icon v-else name="lucide:languages" size="16px" class="size-4 text-muted-foreground" />
                <span class="text-xs font-semibold">{{ localeLabels[locale] }}</span>
            </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="min-w-44">
            <DropdownMenuLabel>{{ t('language.label') }}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem v-for="option in appLocales" :key="option" class="cursor-pointer"
                @select="mutate(option)">
                <span class="w-7 text-xs font-semibold">{{ localeLabels[option] }}</span>
                <span>{{ t(`language.${option}`) }}</span>
                <Icon v-if="locale === option" name="lucide:check" size="16px" class="ml-auto size-4" />
            </DropdownMenuItem>
        </DropdownMenuContent>
    </DropdownMenu>
</template>
