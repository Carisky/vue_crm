<script setup lang="ts">
import { useMutation } from '@tanstack/vue-query'
import { configure, useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { toast } from 'vue-sonner'

import { ForgotPasswordSchema } from '~/lib/schema/auth'

configure({ validateOnBlur: false })

const sent = ref(false)
const form = useForm({ validationSchema: toTypedSchema(ForgotPasswordSchema) })

const { isPending, mutate } = useMutation({
    mutationFn: (values: typeof form.values) =>
        $fetch('/api/auth/forgot-password', { method: 'POST', body: values }),
    onSuccess: () => {
        sent.value = true
        toast.success('If an account exists for this email, a reset link has been sent.')
    },
    onError: (error: any) =>
        toast.error(error?.data?.statusMessage ?? 'Failed to request a password reset'),
})

const handleSubmit = form.handleSubmit((values) => mutate(values))
</script>

<template>
    <Card class="size-full gap-0 border-none py-0 shadow-none md:w-[487px]">
        <CardHeader class="flex flex-col items-center justify-center p-7 text-center">
            <CardTitle class="text-2xl">Reset your password</CardTitle>
            <CardDescription>
                Enter your email address and we will send you a reset link.
            </CardDescription>
        </CardHeader>
        <div class="px-7"><DottedSeparator /></div>
        <CardContent class="p-7">
            <div v-if="sent" class="space-y-4 text-center">
                <p class="text-sm text-muted-foreground">
                    If an account exists for this email, a password-reset link is on its way.
                </p>
                <Button variant="secondary" class="w-full" :as-child="true">
                    <NuxtLink href="/sign-in">Back to sign in</NuxtLink>
                </Button>
            </div>
            <form v-else class="space-y-4" @submit="handleSubmit">
                <fieldset :disabled="isPending" class="space-y-4">
                    <FormField v-slot="{ componentField }" name="email">
                        <FormItem>
                            <FormControl>
                                <Input type="email" autocomplete="email" placeholder="Enter email address"
                                    v-bind="componentField" />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    </FormField>
                    <Button type="submit" size="lg" class="w-full">
                        <Icon v-if="isPending" name="svg-spinners:8-dots-rotate" size="16px" class="size-4" />
                        <span v-else>Send reset link</span>
                    </Button>
                </fieldset>
            </form>
        </CardContent>
        <div class="px-7"><DottedSeparator /></div>
        <CardContent class="flex items-center justify-center p-7">
            <NuxtLink href="/sign-in" class="text-blue-700">Back to sign in</NuxtLink>
        </CardContent>
    </Card>
</template>
