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

const themeOptions: {
    value: ThemePreference
    title: string
    description: string
    badge: string
}[] = [
    {
        value: 'light',
        title: 'Light',
        description: 'Classic bright interface with clean, white surfaces.',
        badge: 'Default',
    },
    {
        value: 'dark',
        title: 'Dark',
        description: 'Low-light look with deep gray surfaces and muted tones.',
        badge: 'Night mode',
    },
    {
        value: 'japanese',
        title: 'Japanese Sakura',
        description: 'Soft pink accents paired with bark-brown elements.',
        badge: 'Sakura',
    },
]

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

        toast.success('Theme saved')
    } catch (error) {
        console.error(error)
        toast.error('Failed to save theme')
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

        toast.success('Email notification preference saved')
    } catch (error) {
        console.error(error)
        emailNotificationsEnabled.value = previousValue
        toast.error('Failed to save email notification preference')
    } finally {
        isSavingEmailNotifications.value = false
    }
}
</script>

<template>
    <div class="flex w-full max-w-3xl flex-col gap-6">
        <Card class="border">
            <CardHeader>
                <CardTitle class="text-lg font-semibold">Theme</CardTitle>
                <CardDescription>Choose an experience that suits your workflow.</CardDescription>
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
                    Theme choice is saved to your profile and applied automatically on each login.
                </p>
            </CardContent>
        </Card>
        <Card class="border">
            <CardHeader>
                <CardTitle class="text-lg font-semibold">Email notifications</CardTitle>
                <CardDescription>Control when the app can send you email updates.</CardDescription>
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
                            Receive task updates by email
                        </p>
                        <p class="text-xs text-muted-foreground">
                            You will receive emails for new tasks and priority escalations.
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    </div>
</template>
