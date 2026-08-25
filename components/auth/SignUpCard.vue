<script setup lang="ts">
import { useMutation } from '@tanstack/vue-query'
import { configure, useForm } from 'vee-validate'
import { toTypedSchema } from "@vee-validate/zod"
import { toast } from 'vue-sonner'

import { SignUpSchema } from '~/lib/schema/auth'
const { t } = useAppI18n()

// Sign up with email & password
configure({
    validateOnBlur: false
});

const form = useForm({
    validationSchema: toTypedSchema(SignUpSchema)
})

const { isPending, mutate } = useMutation({
    mutationFn: async (credentials: typeof form.values) => {
        const res = await $fetch('/api/auth/sign-up', { method: 'POST', body: credentials })
        if (res.ok) {
            toast.success(t('auth.accountCreatedVerify'))
            await navigateTo('/sign-in?registered=1')
        } else toast.error(t('auth.signUpFailed'))
    },
    onError: () => toast.error(t('auth.signUpFailed'))
})

const handleSignUp = form.handleSubmit((values) => mutate(values))
</script>

<template>
    <Card class="size-full md:w-[487px] border-none shadow-none py-0 gap-0">
        <CardHeader class="flex flex-col items-center justify-center text-center p-7">
            <CardTitle class="text-2xl">{{ t('auth.signUp') }}</CardTitle>
            <CardDescription>
                {{ t('auth.agree') }}
                <NuxtLink href="#" class="text-blue-700">{{ t('auth.privacy') }}</NuxtLink>
                {{ t('auth.and') }}
                <NuxtLink href="#" class="text-blue-700">{{ t('auth.terms') }}</NuxtLink>
            </CardDescription>
        </CardHeader>
        <div class="px-7">
            <DottedSeparator />
        </div>
        <CardContent class="p-7">
            <form @submit="handleSignUp" class="space-y-4">
                <FormField v-slot="{ componentField }" name="name">
                    <FormItem>
                        <FormControl>
                            <Input :placeholder="t('auth.namePlaceholder')" v-bind="componentField" />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                </FormField>
                <FormField v-slot="{ componentField }" name="email">
                    <FormItem>
                        <FormControl>
                            <Input type="email" :placeholder="t('auth.emailPlaceholder')" v-bind="componentField" />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                </FormField>
                <FormField v-slot="{ componentField }" name="password">
                    <FormItem>
                        <FormControl>
                            <Input type="password" :placeholder="t('auth.passwordPlaceholder')" v-bind="componentField" />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                </FormField>
                <Button type="submit" size="lg" class="w-full">
                    <Icon v-if="isPending" name="svg-spinners:8-dots-rotate" size="16px" class="size-4" />
                    <span v-else>{{ t('auth.register') }}</span>
                </Button>
            </form>
        </CardContent>
        <div class="px-7">
            <DottedSeparator />
        </div>
        <CardContent class="flex items-center justify-center p-7">
            <p>
                {{ t('auth.hasAccount') }} <NuxtLink href="/sign-in"><span class="text-blue-700">{{ t('auth.signIn') }}</span></NuxtLink>
            </p>
        </CardContent>
    </Card>
</template>
