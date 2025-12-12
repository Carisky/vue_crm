<script setup lang="ts"></script>

<template>
  <aside class="h-full w-full bg-neutral-100 p-4">
    <NuxtLink href="/" class="block h-[40px] w-[164px] overflow-hidden">
      <img src="/public/logo.svg" width="164" height="40" alt="Nuxt Jira" />
    </NuxtLink>
    <div class="mt-2">
      <NuxtLink
        href="/profile"
        class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-neutral-500 transition hover:text-primary"
      >
        <Icon
          name="heroicons:user-circle"
          size="16px"
          class="size-4 text-neutral-500"
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
