<script setup lang="ts">
import { computed, watch } from "vue";
import { useDragAndDrop } from "fluid-dnd/vue";
import "vue-sonner/style.css";

import useAuthStore from "./stores/auth";
import type { ThemePreference } from "~/lib/types";

const authStore = useAuthStore();
await authStore.init();

provide("useDragAndDrop", useDragAndDrop);

const preferredTheme = computed<ThemePreference>(
  () => authStore.user?.themePreference ?? "light",
);

if (process.client) {
  const setThemeClass = (theme: ThemePreference) => {
    const rootElement = document.documentElement;
    rootElement.classList.toggle("dark", theme === "dark");
    rootElement.classList.toggle("japanese", theme === "japanese");
  };

  watch(preferredTheme, (value) => setThemeClass(value), {
    immediate: true,
  });
}
</script>

<template>
  <Loader v-if="authStore.isFirstLoading" class="fixed size-full top-0 left-0 bg-white z-10" />

  <NuxtLayout>
    <NuxtPage></NuxtPage>
  </NuxtLayout>

  <!-- Vue sonner -->
  <Toaster />
</template>
