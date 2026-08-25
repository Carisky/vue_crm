<script setup lang="ts">
import { useMutation } from '@tanstack/vue-query'
import { configure, useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { toast } from 'vue-sonner'

import { ResetPasswordSchema } from '~/lib/schema/auth'
const { t } = useAppI18n()

const { token } = defineProps<{ token: string }>()

configure({ validateOnBlur: false })

const form = useForm({
    validationSchema: toTypedSchema(ResetPasswordSchema),
    initialValues: { token, password: '', confirmPassword: '' },
})

const { isPending, mutate } = useMutation({
    mutationFn: (values: typeof form.values) =>
        $fetch('/api/auth/reset-password', { method: 'POST', body: values }),
    onSuccess: async () => {
        toast.success(t('auth.passwordChanged'))
        await navigateTo('/sign-in?reset=success')
    },
    onError: (error: any) =>
        toast.error(error?.data?.statusMessage ?? t('auth.resetFailed')),
})

const handleSubmit = form.handleSubmit((values) => mutate(values))
</script>

<template>
    <Card class="size-full gap-0 border-none py-0 shadow-none md:w-[487px]">
        <CardHeader class="flex flex-col items-center justify-center p-7 text-center">
            <CardTitle class="text-2xl">{{ t('auth.newPasswordTitle') }}</CardTitle>
            <CardDescription>{{ t('auth.newPasswordHint') }}</CardDescription>
        </CardHeader>
        <div class="px-7"><DottedSeparator /></div>
        <CardContent class="p-7">
            <form class="space-y-4" @submit="handleSubmit">
                <fieldset :disabled="isPending" class="space-y-4">
                    <FormField v-slot="{ componentField }" name="password">
                        <FormItem>
                            <FormControl>
                                <Input type="password" autocomplete="new-password" minlength="8" maxlength="256"
                                    :placeholder="t('auth.newPasswordPlaceholder')" v-bind="componentField" />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    </FormField>
                    <FormField v-slot="{ componentField }" name="confirmPassword">
                        <FormItem>
                            <FormControl>
                                <Input type="password" autocomplete="new-password" minlength="8" maxlength="256"
                                    :placeholder="t('auth.confirmPasswordPlaceholder')" v-bind="componentField" />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    </FormField>
                    <Button type="submit" size="lg" class="w-full">
                        <Icon v-if="isPending" name="svg-spinners:8-dots-rotate" size="16px" class="size-4" />
                        <span v-else>{{ t('auth.changePassword') }}</span>
                    </Button>
                </fieldset>
            </form>
        </CardContent>
        <div class="px-7"><DottedSeparator /></div>
        <CardContent class="flex items-center justify-center p-7">
            <NuxtLink href="/sign-in" class="text-blue-700">{{ t('auth.backToSignIn') }}</NuxtLink>
        </CardContent>
    </Card>
</template>
