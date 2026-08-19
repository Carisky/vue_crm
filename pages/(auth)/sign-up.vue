<script setup lang="ts">
import authPageProtectMiddleware from '~/middleware/page-protect/authPage';

definePageMeta({
    layout: 'auth',
    middleware: [authPageProtectMiddleware]
})

useHead({
    title: 'Sign Up'
})
</script>

<template>
    <AuthSignUpCard />
</template>
