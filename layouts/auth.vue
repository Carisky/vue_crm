<script setup lang="ts">
const route = useRoute()

const buttonLabel = computed(() => route.name === 'sign-in' ? 'Sign Up' : "Sign In")
const buttonLink = computed(() => route.name === 'sign-in' ? '/sign-up' : "/sign-in")
</script>

<template>
    <main class="bg-neutral-100 min-h-screen">
        <div class="max-w-screen-2xl mx-auto p-4">
            <nav class="flex items-center justify-between">
                <NuxtLink href="/sign-in" class="block h-[56px] w-[152px] overflow-hidden">
                    <img src="/TSL%20Silesia%20Collab.svg" width="152" height="56" alt="TSL Silesia Collab"
                        class="size-full object-cover object-center" />
                </NuxtLink>
                <Button variant="secondary" :as-child="true">
                    <NuxtLink :href="buttonLink">
                        {{ buttonLabel }}
                    </NuxtLink>
                </Button>
            </nav>
            <div class="flex flex-col items-center justify-center pt-4 md:pt-14">
                <slot></slot>
            </div>
        </div>
    </main>
</template>
