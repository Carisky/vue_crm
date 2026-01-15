<script setup lang="ts">
const route = useRoute()

const routes = computed(() => [
    {
        label: 'Home',
        href: `/workspaces/${route.params['workspaceId']}`,
        icon: 'heroicons:home',
        iconActive: 'heroicons:home-solid'
    },
    {
        label: 'My Tasks',
        href: `/workspaces/${route.params['workspaceId']}/tasks`,
        icon: 'heroicons:check-circle',
        iconActive: 'heroicons:check-circle-solid'
    },
    {
        label: 'Messages',
        href: `/workspaces/${route.params['workspaceId']}/messages`,
        icon: 'heroicons:chat-bubble-left-right',
        iconActive: 'heroicons:chat-bubble-left-right-solid'
    },
    {
        label: 'Settings',
        href: `/workspaces/${route.params['workspaceId']}/settings`,
        icon: 'heroicons:cog-6-tooth',
        iconActive: 'heroicons:cog-6-tooth-solid'
    },
    {
        label: 'Members',
        href: `/workspaces/${route.params['workspaceId']}/members`,
        icon: 'heroicons:users',
        iconActive: 'heroicons:users-solid'
    }
])
</script>

<template>
<ul v-if="route.params['workspaceId']" class="flex flex-col gap-1">
        <NuxtLink
            v-for="r of routes"
            :href="r.href"
            active-class="bg-sidebar-primary/10 text-card-foreground shadow-sm"
            class="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition hover:text-sidebar-primary hover:bg-sidebar-primary/5"
        >
            <Icon :name="r.icon" size="20px" class="size-5 text-sidebar-foreground/60" />
            {{ r.label }}
        </NuxtLink>
    </ul>
</template>
