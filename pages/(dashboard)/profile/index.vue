<script setup lang="ts">
import { toast } from 'vue-sonner';

import authenticatedPageProtectMiddleware from '~/middleware/page-protect/authenticatedPage';
import useAuthStore from '~/stores/auth';

definePageMeta({
    layout: 'dashboard',
    middleware: [authenticatedPageProtectMiddleware]
})

useHead({
    title: 'Profile'
})

const MIN_TARGET = 1
const MAX_TARGET = 744

const authStore = useAuthStore()
const initialTarget = authStore.user?.monthlyWorkloadTargetHours ?? 160
const targetValue = ref(initialTarget)

watch(
    () => authStore.user?.monthlyWorkloadTargetHours,
    (value) => {
        if (typeof value === 'number') {
            targetValue.value = value
        }
    },
)
const isSaving = ref(false)

const isValidTarget = computed(() => {
    const value = Number(targetValue.value)
    return Number.isFinite(value) && value >= MIN_TARGET && value <= MAX_TARGET
})

const clampTarget = (value: number) =>
    Math.min(Math.max(Math.round(value), MIN_TARGET), MAX_TARGET)

const handleSubmit = async () => {
    if (!isValidTarget.value || !authStore.user) return

    isSaving.value = true
    const payload = { monthly_target_hours: clampTarget(Number(targetValue.value)) }

    try {
        const res = await $fetch('/api/profile/monthly-target', {
            method: 'PATCH',
            body: payload
        })

        const updatedUser = {
            ...authStore.user,
            monthlyWorkloadTargetHours: res.monthlyWorkloadTargetHours ?? payload.monthly_target_hours
        }

        authStore.setUser(updatedUser)
        targetValue.value = updatedUser.monthlyWorkloadTargetHours ?? payload.monthly_target_hours

        toast.success('Monthly workload target saved')
    } catch (error) {
        console.error(error)
        toast.error('Failed to save monthly target')
    } finally {
        isSaving.value = false
    }
}
</script>

<template>
    <div class="flex w-full max-w-3xl flex-col gap-6">
        <Card class="border">
            <CardHeader>
                <CardTitle class="text-lg font-semibold">Profile settings</CardTitle>
                <CardDescription>
                    Define the reference monthly workload that will be used as 100% on workload charts.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form class="grid gap-4" @submit.prevent="handleSubmit">
                    <div class="grid gap-2 text-sm">
                        <Label>Monthly workload target (hours)</Label>
                        <Input
                            type="number"
                            step="1"
                            min="1"
                            max="744"
                            v-model.number="targetValue"
                            class="w-32"
                        />
                        <p class="text-xs text-muted-foreground">
                            Used to scale the member workload charts. Accepts values between
                            {{ MIN_TARGET }} and {{ MAX_TARGET }} hours.
                        </p>
                    </div>
                    <Button type="submit" class="w-fit" :disabled="!isValidTarget || isSaving">
                        <span v-if="isSaving">Saving...</span>
                        <span v-else>Save</span>
                    </Button>
                </form>
            </CardContent>
        </Card>
    </div>
</template>
