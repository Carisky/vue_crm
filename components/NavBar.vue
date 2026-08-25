<script setup lang="ts">
const route = useRoute();
import NotificationCenter from "~/components/NotificationCenter.vue";
import MessageCenter from "~/components/MessageCenter.vue";
const { t } = useAppI18n();

const pathnameMap = {
  default: {
    title: "nav.home",
    description: "header.home.description",
  },
  tasks: {
    title: "nav.myTasks",
    description: "header.tasks.description",
  },
  projects: {
    title: "header.project.title",
    description: "header.project.description",
  },
  docs: {
    title: "header.docs",
    description: "header.docs.description",
  },
  messages: {
    title: "nav.messages",
    description: "header.messages.description",
  },
  chat: {
    title: "header.chat",
    description: "header.chat.description",
  },
  members: {
    title: "nav.members",
    description: "header.members.description",
  },
  groups: {
    title: "nav.groups",
    description: "header.groups.description",
  },
  settings: {
    title: "nav.settings",
    description: "header.settings.description",
  },
} as const;

const titleDescription = computed(() => {
  const segments = route.path.split("/").filter(Boolean);
  // /workspaces/:workspaceId/(...)
  const rootKey = segments[2] ?? "default";

  let pathnameKey: keyof typeof pathnameMap = "default";

  if (rootKey === "projects") {
    // /workspaces/:workspaceId/projects/:projectId/docs
    const projectSub = segments[4];
    pathnameKey = projectSub === "docs" ? "docs" : "projects";
  } else if (rootKey === "messages") {
    pathnameKey = segments.length >= 4 ? "chat" : "messages";
  } else if (rootKey === "tasks") {
    pathnameKey = "tasks";
  } else if (rootKey === "members") {
    pathnameKey = "members";
  } else if (rootKey === "groups") {
    pathnameKey = "groups";
  } else if (rootKey === "settings") {
    pathnameKey = "settings";
  }

  return pathnameMap[pathnameKey] ?? pathnameMap.default;
});
</script>

<template>
  <nav class="flex items-center justify-between px-6 pt-4">
    <div class="hidden flex-col lg:flex">
      <h1 class="text-2xl font-semibold">{{ t(titleDescription.title) }}</h1>
      <p class="text-muted-foreground">{{ t(titleDescription.description) }}</p>
    </div>
    <SideBarMobile />
    <ClientOnly>
      <div class="flex items-center gap-2">
        <ProductTourButton />
        <div class="flex items-center gap-1" data-tour="collaboration">
          <MessageCenter />
          <NotificationCenter />
        </div>
        <LanguageSwitcher />
        <AuthUserButton />
      </div>
    </ClientOnly>
  </nav>
</template>
