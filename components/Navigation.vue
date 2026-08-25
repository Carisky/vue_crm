<script setup lang="ts">
const route = useRoute();
const { t } = useAppI18n();

const routes = computed(() => [
  {
    label: t("nav.home"),
    href: `/workspaces/${route.params["workspaceId"]}`,
    icon: "heroicons:home",
    iconActive: "heroicons:home-solid",
  },
  {
    label: t("nav.myTasks"),
    href: `/workspaces/${route.params["workspaceId"]}/tasks`,
    icon: "heroicons:check-circle",
    iconActive: "heroicons:check-circle-solid",
  },
  {
    label: t("nav.messages"),
    href: `/workspaces/${route.params["workspaceId"]}/messages`,
    icon: "heroicons:chat-bubble-left-right",
    iconActive: "heroicons:chat-bubble-left-right-solid",
  },
  {
    label: t("nav.settings"),
    href: `/workspaces/${route.params["workspaceId"]}/settings`,
    icon: "heroicons:cog-6-tooth",
    iconActive: "heroicons:cog-6-tooth-solid",
  },
  {
    label: t("nav.members"),
    href: `/workspaces/${route.params["workspaceId"]}/members`,
    icon: "heroicons:users",
    iconActive: "heroicons:users-solid",
  },
  {
    label: t("nav.groups"),
    href: `/workspaces/${route.params["workspaceId"]}/groups`,
    icon: "heroicons:user-group",
    iconActive: "heroicons:user-group-solid",
  },
]);
</script>

<template>
  <ul
    v-if="route.params['workspaceId']"
    class="flex flex-col gap-1"
    data-tour="main-navigation"
  >
    <NuxtLink
      v-for="r of routes"
      :href="r.href"
      active-class="bg-sidebar-primary/15 text-sidebar-foreground shadow-sm"
      class="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition hover:bg-sidebar-primary/5 hover:text-sidebar-primary"
    >
      <Icon
        :name="r.icon"
        size="20px"
        class="size-5 text-sidebar-foreground/85"
      />
      {{ r.label }}
    </NuxtLink>
  </ul>
</template>
