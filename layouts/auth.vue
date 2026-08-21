<script setup lang="ts">
const route = useRoute()

const buttonLabel = computed(() => route.name === 'sign-in' ? 'Sign Up' : "Sign In")
const buttonLink = computed(() => route.name === 'sign-in' ? '/sign-up' : "/sign-in")
</script>

<template>
    <main class="bg-neutral-100 min-h-screen">
        <div class="max-w-screen-2xl mx-auto p-4">
            <nav class="flex items-center justify-between">
                <NuxtLink href="/sign-in" class="block h-[80px] w-[240px] overflow-hidden">
                    <picture>
                        <source :srcset="'/TSL%20Silesia%20Collab.svg'" type="image/svg+xml" />
                        <img src="/TSL%20Silesia%20Collab.png" width="240" height="80" alt="TSL Silesia Collab"
                            class="size-full object-cover object-center" />
                    </picture>
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
