<script setup lang="ts">
</script>

<template>
    <main class="bg-neutral-100">
        <div class="min-h-screen max-w-screen-2xl mx-auto p-4">
            <nav class="flex items-center justify-between h-[96px]">
                <NuxtLink href="/" class="block h-[80px] w-[240px] overflow-hidden">
                    <picture>
                        <source :srcset="'/TSL%20Silesia%20Collab.svg'" type="image/svg+xml" />
                        <img src="/TSL%20Silesia%20Collab.png" width="240" height="80" alt="TSL Silesia Collab"
                            class="size-full object-cover object-center" />
                    </picture>
                </NuxtLink>
                <div class="flex items-center gap-2">
                    <ClientOnly>
                        <ProductTourButton />
                    </ClientOnly>
                    <AuthUserButton />
                </div>
            </nav>
            <div class="flex flex-col items-center py-4">
                <slot></slot>
            </div>
        </div>
    </main>
    <ClientOnly>
        <ProductTour />
    </ClientOnly>
</template>
