<script setup lang="ts">
import authPageProtectMiddleware from '~/middleware/page-protect/authPage'

definePageMeta({
    layout: 'auth',
    middleware: [authPageProtectMiddleware],
})

const route = useRoute()
const token = computed(() => String(route.params.token ?? ''))

useHead({ title: 'Reset Password' })
</script>

<template>
    <AuthResetPasswordCard :token="token" />
</template>
