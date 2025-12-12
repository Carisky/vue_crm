<script setup lang="ts">
import authPageProtectMiddleware from '~/middleware/page-protect/authPage';

definePageMeta({
    layout: 'auth',
    middleware: [authPageProtectMiddleware]
})

useHead({
    title: 'Sign In | DEV crm'
})
</script>

<template>
    <AuthSignInCard />
</template>