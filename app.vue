<script setup lang="ts">
import { computed, watch } from "vue";
import { useDragAndDrop } from "fluid-dnd/vue";
import "vue-sonner/style.css";

import useAuthStore from "./stores/auth";
import type { AppLocale, ThemePreference } from "~/lib/types";

const authStore = useAuthStore();
const route = useRoute();
const isTelegramMiniApp = computed(() => route.path === "/telegram");
if (!isTelegramMiniApp.value) await authStore.init();
const { locale } = useAppI18n();

useHead(() => ({
  htmlAttrs: { lang: locale.value as AppLocale },
}));

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
  <Loader
    v-if="authStore.isFirstLoading && !isTelegramMiniApp"
    class="fixed top-0 left-0 z-10 size-full bg-white"
  />

  <NuxtLayout>
    <NuxtPage></NuxtPage>
  </NuxtLayout>

  <!-- Vue sonner -->
  <Toaster />
</template>
