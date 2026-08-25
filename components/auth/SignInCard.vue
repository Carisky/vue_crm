<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { configure, useForm } from 'vee-validate'
import { toTypedSchema } from "@vee-validate/zod"
import { toast } from 'vue-sonner'

import { SignInSchema } from '~/lib/schema/auth'

const queryClient = useQueryClient()
const route = useRoute()
const { t } = useAppI18n()
const isProtectedDownload = computed(() => {
    const redirect = route.query.redirect
    return typeof redirect === 'string' && redirect.startsWith('/downloads/')
})

function getRedirectPath(): string {
    const redirect = route.query.redirect
    if (typeof redirect !== 'string') return '/'

    // Only allow an internal application path to prevent open redirects.
    return redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/'
}

onMounted(() => {
    const status = route.query.verified
    if (route.query.registered === '1') toast.success(t('auth.verifyCheckEmail'))
    if (route.query.reset === 'success') toast.success(t('auth.passwordChangedSignIn'))
    if (status === 'success') toast.success(t('auth.emailVerified'))
    if (status === 'expired') toast.error(t('auth.verificationExpired'))
    if (status === 'invalid') toast.error(t('auth.verificationInvalid'))
})

// Sign in with email & password
configure({
    validateOnBlur: false
});

const form = useForm({
    validationSchema: toTypedSchema(SignInSchema)
})

const { isPending, mutate } = useMutation({
    mutationFn: async (credentials: typeof form.values) => {
        const res = await $fetch('/api/auth/sign-in', { method: 'POST', body: credentials })
        if (res.ok) {
            await queryClient.refetchQueries({ queryKey: ['auth/me'] })
            await navigateTo(getRedirectPath())
        } else toast.error(t('auth.signInFailed'))
    },
    onError: (error: any) => toast.error(error?.data?.statusMessage ?? t('auth.signInFailed'))
})

const handleSignIn = form.handleSubmit((values) => mutate(values))
</script>

<template>
    <Card class="size-full md:w-[487px] border-none shadow-none py-0 gap-0">
        <CardHeader class="flex flex-col items-center justify-center text-center p-7">
            <CardTitle class="text-2xl">
                {{ isProtectedDownload ? t('auth.downloadTitle') : t('auth.welcome') }}
            </CardTitle>
            <CardDescription v-if="isProtectedDownload" class="mt-2 max-w-sm">
                {{ t('auth.downloadDescription') }}
            </CardDescription>
        </CardHeader>
        <div class="px-7">
            <DottedSeparator />
        </div>
        <CardContent class="p-7">
            <form @submit="handleSignIn">
                <fieldset :disabled="isPending" class="space-y-4">
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
                                <Input type="password" minlength="8" maxlength="256" :placeholder="t('auth.passwordPlaceholder')"
                                    v-bind="componentField" />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    </FormField>
                    <div class="text-right">
                        <NuxtLink href="/forgot-password" class="text-sm text-blue-700">{{ t('auth.forgotPassword') }}</NuxtLink>
                    </div>
                    <Button type="submit" size="lg" class="w-full">
                        <Icon v-if="isPending" name="svg-spinners:8-dots-rotate" size="16px" class="size-4" />
                        <span v-else>{{ t('auth.signIn') }}</span>
                    </Button>
                </fieldset>
            </form>
        </CardContent>
        <div class="px-7">
            <DottedSeparator />
        </div>
        <CardContent class="flex items-center justify-center p-7">
            <p>
                {{ t('auth.noAccount') }} <NuxtLink href="/sign-up"><span class="text-blue-700">{{ t('auth.signUp') }}</span></NuxtLink>
            </p>
        </CardContent>
    </Card>
</template>
