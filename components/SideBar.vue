<script setup lang="ts">
const route = useRoute()
const { t } = useAppI18n()

withDefaults(defineProps<{
  collapsed?: boolean
  collapsible?: boolean
}>(), {
  collapsed: false,
  collapsible: false,
})

defineEmits<{
  toggle: []
}>()

const profileHref = computed(() => {
  const workspaceId = route.params['workspaceId'] ?? route.query['workspace_id']

  return typeof workspaceId === 'string' && workspaceId
    ? `/profile?workspace_id=${encodeURIComponent(workspaceId)}`
    : '/profile'
})
</script>

<template>
<aside
  class="relative flex min-h-full min-w-0 flex-col overflow-x-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
  :class="collapsed ? 'px-2 py-4' : 'p-4'"
>
  <div class="flex h-[80px] min-w-0 items-center" :class="collapsed ? 'justify-center' : ''">
    <NuxtLink href="/" class="block overflow-hidden" :class="collapsed ? 'size-10 rounded-lg' : 'h-[80px] w-full max-w-[232px]'">
      <picture>
        <source :srcset="collapsed ? '/favicon.svg' : '/TSL%20Silesia%20Collab.svg'" type="image/svg+xml" />
        <img
          :src="collapsed ? '/favicon.png' : '/TSL%20Silesia%20Collab.png'"
          alt="TSL Silesia Collab"
          class="size-full object-cover object-center"
        />
      </picture>
    </NuxtLink>
  </div>
  <div
    v-if="collapsible"
    class="flex h-8 shrink-0 items-center"
    :class="collapsed ? 'justify-center' : 'justify-end'"
  >
    <button
      type="button"
      class="flex size-7 items-center justify-center rounded-full border border-sidebar-border bg-sidebar shadow-sm transition hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      :title="collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')"
      :aria-label="collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')"
      :aria-expanded="!collapsed"
      @click="$emit('toggle')"
    >
      <Icon :name="collapsed ? 'lucide:chevron-right' : 'lucide:chevron-left'" class="size-4" />
    </button>
  </div>
  <div :class="collapsible ? 'mt-1' : 'mt-2'">
    <NuxtLink
        :href="profileHref"
        class="flex items-center rounded-md py-2 text-sm font-medium text-sidebar-foreground transition hover:bg-sidebar-primary/5 hover:text-sidebar-primary"
        :class="collapsed ? 'justify-center px-2' : 'gap-2 px-3'"
        :title="collapsed ? t('nav.profileSettings') : undefined"
    >
      <Icon
        name="heroicons:user-circle"
        size="16px"
        class="size-4 text-sidebar-foreground/85"
      />
      <span v-if="!collapsed" class="truncate">{{ t('nav.profileSettings') }}</span>
    </NuxtLink>
  </div>
    <DottedSeparator class="my-4 h-fit" direction="horizontal" />
    <template v-if="!collapsed">
      <WorkspaceSwitcher />
      <DottedSeparator class="my-4 h-fit" direction="horizontal" />
    </template>
    <Navigation :collapsed="collapsed" />
    <template v-if="!collapsed">
      <DottedSeparator class="my-4 h-fit" direction="horizontal" />
      <ProjectListSidebar />
      <DottedSeparator class="my-4 h-fit" direction="horizontal" />
    </template>
  </aside>
</template>
