<script setup lang="ts">
import authenticatedPageProtectMiddleware from "~/middleware/page-protect/authenticatedPage";
import { mediaDownloadContentUrl } from "~/lib/task-media-presentation";
import useAuthStore from "~/stores/auth";

definePageMeta({
  layout: false,
  middleware: [authenticatedPageProtectMiddleware],
});

const route = useRoute();
const authStore = useAuthStore();
const { t } = useAppI18n();
const state = ref<"preparing" | "started" | "failed">("preparing");

useHead({ title: t("download.title") });

const mediaId = computed(() => String(route.params["mediaId"] ?? ""));

function signInAgain() {
  authStore.clear();
  const redirect = encodeURIComponent(route.fullPath);
  window.location.replace(`/sign-in?redirect=${redirect}`);
}

function responseStatus(error: unknown) {
  const value = error as {
    statusCode?: number;
    response?: { status?: number };
  };
  return value.statusCode ?? value.response?.status;
}

onMounted(async () => {
  if (!mediaId.value) {
    state.value = "failed";
    return;
  }

  const downloadUrl = mediaDownloadContentUrl(mediaId.value);

  try {
    await $fetch.raw(downloadUrl, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
    });

    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = "";
    link.rel = "noopener";
    link.className = "hidden";
    document.body.append(link);
    link.click();
    link.remove();
    state.value = "started";

    window.setTimeout(() => window.close(), 900);
  } catch (error) {
    if (responseStatus(error) === 401) {
      signInAgain();
      return;
    }
    state.value = "failed";
  }
});
</script>

<template>
  <main
    v-if="state !== 'preparing'"
    class="flex min-h-screen items-center justify-center bg-neutral-100 p-6"
  >
    <Card class="w-full max-w-md text-center">
      <CardHeader>
        <CardTitle>
          {{
            state === "started" ? t("download.started") : t("download.failed")
          }}
        </CardTitle>
        <CardDescription>
          {{
            state === "started"
              ? t("download.startedDescription")
              : t("download.failedDescription")
          }}
        </CardDescription>
      </CardHeader>
      <CardContent v-if="state === 'failed'">
        <Button type="button" @click="navigateTo('/')">
          {{ t("error.backHome") }}
        </Button>
      </CardContent>
    </Card>
  </main>
</template>
