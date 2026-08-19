<script setup lang="ts">
</script>

<template>
    <main class="bg-neutral-100">
        <div class="min-h-screen max-w-screen-2xl mx-auto p-4">
            <nav class="flex items-center justify-between h-[73px]">
                <NuxtLink href="/" class="block h-[56px] w-[152px] overflow-hidden">
                    <img src="/logo.png" width="152" height="56" alt="TSL Silesia" class="size-full object-contain object-left" />
                </NuxtLink>
                <AuthUserButton />
            </nav>
            <div class="flex flex-col items-center py-4">
                <slot></slot>
            </div>
        </div>
    </main>
</template>
