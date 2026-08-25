<script setup lang="ts">
import { NuxtLink } from '#components';
const { t } = useAppI18n()
</script>

<template>
    <div class="h-screen flex flex-col gap-2 items-center justify-center">
        <Icon name="lucide:triangle-alert" size="24px" class="size-6" />
        <p class="text-sm">{{ t('error.generic') }}</p>
        <Button variant="secondary" class="mt-1">
            <NuxtLink href="/">
                {{ t('error.backHome') }}
            </NuxtLink>
        </Button>
    </div>
</template>
