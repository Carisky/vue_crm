<script setup lang="ts">
const route = useRoute()

const profileHref = computed(() => {
  const workspaceId = route.params['workspaceId'] ?? route.query['workspace_id']

  return typeof workspaceId === 'string' && workspaceId
    ? `/profile?workspace_id=${encodeURIComponent(workspaceId)}`
    : '/profile'
})
</script>

<template>
<aside class="h-full w-full bg-sidebar p-4 text-sidebar-foreground border-r border-sidebar-border">
  <NuxtLink href="/" class="block h-[80px] w-[240px] overflow-hidden">
    <picture>
      <source :srcset="'/TSL%20Silesia%20Collab.svg'" type="image/svg+xml" />
      <img src="/TSL%20Silesia%20Collab.png" width="240" height="80" alt="TSL Silesia Collab"
        class="size-full object-cover object-center" />
    </picture>
  </NuxtLink>
  <div class="mt-2">
    <NuxtLink
        :href="profileHref"
        class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition hover:text-sidebar-primary hover:bg-sidebar-primary/5"
    >
      <Icon
        name="heroicons:user-circle"
        size="16px"
        class="size-4 text-sidebar-foreground/85"
      />
      Profile settings
    </NuxtLink>
  </div>
    <DottedSeparator class="my-4 h-fit" direction="horizontal" />
    <WorkspaceSwitcher />
    <DottedSeparator class="my-4 h-fit" direction="horizontal" />
    <Navigation />
    <DottedSeparator class="my-4 h-fit" direction="horizontal" />
    <ProjectListSidebar />
    <DottedSeparator class="my-4 h-fit" direction="horizontal" />
  </aside>
</template>
