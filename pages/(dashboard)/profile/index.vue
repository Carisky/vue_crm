<script setup lang="ts">
import { toast } from 'vue-sonner'

import authenticatedPageProtectMiddleware from '~/middleware/page-protect/authenticatedPage'
import useAuthStore from '~/stores/auth'
import type { ThemePreference } from '~/lib/types'

definePageMeta({
    layout: 'dashboard',
    middleware: [authenticatedPageProtectMiddleware]
})

useHead({
    title: 'Profile'
})

const authStore = useAuthStore()
const { t } = useAppI18n()
const isSavingTheme = ref(false)
const isSavingEmailNotifications = ref(false)

const emailNotificationsEnabled = ref(
    authStore.user?.emailNotificationsEnabled ?? true,
)

watch(
    () => authStore.user?.emailNotificationsEnabled,
    (value) => {
        if (typeof value === 'boolean') {
            emailNotificationsEnabled.value = value
        }
    },
)

const themeOptions = computed((): {
    value: ThemePreference
    title: string
    description: string
    badge: string
}[] => [
    {
        value: 'light',
        title: t('profile.themeLight'),
        description: t('profile.themeLightDescription'),
        badge: t('profile.default'),
    },
    {
        value: 'dark',
        title: t('profile.themeDark'),
        description: t('profile.themeDarkDescription'),
        badge: t('profile.nightMode'),
    },
    {
        value: 'japanese',
        title: t('profile.themeJapanese'),
        description: t('profile.themeJapaneseDescription'),
        badge: t('profile.sakura'),
    },
])

const selectedTheme = ref<ThemePreference>(
    authStore.user?.themePreference ?? 'light',
)

watch(
    () => authStore.user?.themePreference,
    (value) => {
        if (value) {
            selectedTheme.value = value
        }
    },
)

const handleThemeChange = async (theme: ThemePreference) => {
    if (!authStore.user || selectedTheme.value === theme) return

    isSavingTheme.value = true

    try {
        const res = await $fetch<{ themePreference: ThemePreference }>('/api/profile/theme', {
            method: 'PATCH',
            body: { theme },
        })

        const updatedUser = {
            ...authStore.user,
            themePreference: res.themePreference,
        }

        authStore.setUser(updatedUser)
        selectedTheme.value = updatedUser.themePreference

        toast.success(t('profile.themeSaved'))
    } catch (error) {
        console.error(error)
        toast.error(t('profile.themeSaveFailed'))
    } finally {
        isSavingTheme.value = false
    }
}

const handleEmailNotificationsChange = async (checked: boolean | 'indeterminate') => {
    if (!authStore.user || isSavingEmailNotifications.value) return

    const nextValue = checked === 'indeterminate'
        ? !emailNotificationsEnabled.value
        : checked === true
    if (emailNotificationsEnabled.value === nextValue) return

    const previousValue = emailNotificationsEnabled.value
    emailNotificationsEnabled.value = nextValue
    isSavingEmailNotifications.value = true

    try {
        const res = await $fetch<{ emailNotificationsEnabled: boolean }>('/api/profile/email-notifications', {
            method: 'PATCH',
            body: { email_notifications_enabled: nextValue },
        })

        const updatedUser = {
            ...authStore.user,
            emailNotificationsEnabled: res.emailNotificationsEnabled,
        }

        authStore.setUser(updatedUser)
        emailNotificationsEnabled.value = updatedUser.emailNotificationsEnabled

        toast.success(t('profile.emailSaved'))
    } catch (error) {
        console.error(error)
        emailNotificationsEnabled.value = previousValue
        toast.error(t('profile.emailSaveFailed'))
    } finally {
        isSavingEmailNotifications.value = false
    }
}
</script>

<template>
    <div class="flex w-full max-w-3xl flex-col gap-6">
        <Card class="border">
            <CardHeader>
                <CardTitle class="text-lg font-semibold">{{ t('profile.theme') }}</CardTitle>
                <CardDescription>{{ t('profile.themeDescription') }}</CardDescription>
            </CardHeader>
            <CardContent>
                <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <button
                        v-for="option in themeOptions"
                        :key="option.value"
                        type="button"
                        class="flex flex-col gap-2 rounded-lg border px-5 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring focus-visible:ring-ring/70"
                        :class="[
                            selectedTheme === option.value
                                ? 'border-primary bg-primary/10'
                                : 'border-border bg-background hover:border-primary/70 dark:border-neutral-600',
                        ]"
                        :aria-pressed="selectedTheme === option.value"
                        :disabled="isSavingTheme"
                        @click="handleThemeChange(option.value)"
                    >
                        <div class="flex items-center justify-between gap-2">
                            <p class="text-sm font-semibold text-foreground">{{ option.title }}</p>
                            <span
                                class="rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground"
                            >
                                {{ option.badge }}
                            </span>
                        </div>
                        <p class="text-sm text-muted-foreground">{{ option.description }}</p>
                    </button>
                </div>
                <p class="mt-3 text-sm text-muted-foreground">
                    {{ t('profile.themePersistence') }}
                </p>
            </CardContent>
        </Card>
        <Card class="border">
            <CardHeader>
                <CardTitle class="text-lg font-semibold">{{ t('profile.emailNotifications') }}</CardTitle>
                <CardDescription>{{ t('profile.emailNotificationsDescription') }}</CardDescription>
            </CardHeader>
            <CardContent>
                <div class="flex items-start gap-3">
                    <Checkbox
                        :checked="emailNotificationsEnabled"
                        :disabled="isSavingEmailNotifications"
                        @update:checked="handleEmailNotificationsChange"
                    />
                    <div class="grid gap-1">
                        <p class="text-sm font-medium text-foreground">
                            {{ t('profile.receiveTaskUpdates') }}
                        </p>
                        <p class="text-xs text-muted-foreground">
                            {{ t('profile.receiveTaskUpdatesDescription') }}
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    </div>
</template>
