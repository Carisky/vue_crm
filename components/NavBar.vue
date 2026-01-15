<script setup lang="ts">
const route = useRoute()
import NotificationCenter from '~/components/NotificationCenter.vue'
import MessageCenter from '~/components/MessageCenter.vue'

const pathnameMap = {
    default: {
        title: 'Home',
        description: 'Monitor all of your projects and tasks here'
    },
    tasks: {
        title: 'My tasks',
        description: 'View all of your tasks here'
    },
    projects: {
        title: 'My project',
        description: 'View tasks of your project here'
    },
    docs: {
        title: 'Docs',
        description: 'Documentation for this project'
    },
    messages: {
        title: 'Messages',
        description: 'Chat with your teammates here'
    },
    chat: {
        title: 'Chat',
        description: 'Conversation'
    },
    members: {
        title: 'Members',
        description: 'Workspace members'
    },
    settings: {
        title: 'Settings',
        description: 'Workspace settings'
    },
}

const titleDescription = computed(() => {
    const segments = route.path.split('/').filter(Boolean)
    // /workspaces/:workspaceId/(...)
    const rootKey = segments[2] ?? 'default'

    let pathnameKey: keyof typeof pathnameMap = 'default'

    if (rootKey === 'projects') {
        // /workspaces/:workspaceId/projects/:projectId/docs
        const projectSub = segments[4]
        pathnameKey = (projectSub === 'docs' ? 'docs' : 'projects')
    } else if (rootKey === 'messages') {
        pathnameKey = segments.length >= 4 ? 'chat' : 'messages'
    } else if (rootKey === 'tasks') {
        pathnameKey = 'tasks'
    } else if (rootKey === 'members') {
        pathnameKey = 'members'
    } else if (rootKey === 'settings') {
        pathnameKey = 'settings'
    }

    return pathnameMap[pathnameKey] ?? pathnameMap.default
})
</script>

<template>
    <nav class="pt-4 px-6 flex items-center justify-between">
        <div class="hidden flex-col lg:flex">
            <h1 class="text-2xl font-semibold">{{ titleDescription.title }}</h1>
            <p class="text-muted-foreground">{{ titleDescription.description }}</p>
        </div>
        <SideBarMobile />
        <ClientOnly>
            <div class="flex items-center gap-2">
                <MessageCenter />
                <NotificationCenter />
                <AuthUserButton />
            </div>
        </ClientOnly>
    </nav>
</template>
