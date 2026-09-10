<script setup lang="ts">
import { computed, watch } from "vue";
import { useQuery } from "@tanstack/vue-query";

import authenticatedPageProtectMiddleware from "~/middleware/page-protect/authenticatedPage";
import type { Workspace } from "~/lib/types";
import CreateWorkspaceForm from "~/components/workspace/CreateWorkspaceForm.vue";
import { chooseWorkspaceId } from "~/lib/last-workspace";

definePageMeta({
  layout: "dashboard",
  middleware: [authenticatedPageProtectMiddleware],
});

useHead({
  title: "TSL Silesia",
});

const requestFetch = useRequestFetch();
const { t } = useAppI18n();
const { workspaceId: lastWorkspaceId, setWorkspaceId } = useLastWorkspace();

const { data, isFetching, isSuccess, suspense } = useQuery<Workspace[]>({
  queryKey: ["workspaces/all"],
  queryFn: async () => {
    const data = await requestFetch<{ workspaces: Workspace[] }>(
      "/api/workspaces/all",
    );
    return data?.workspaces ?? null;
  },
  staleTime: Infinity,
  experimental_prefetchInRender: true,
});

const hasWorkspaces = computed(() => Boolean(data.value?.length));
const showEmptyState = computed(
  () => !isFetching.value && isSuccess.value && !hasWorkspaces.value,
);

onServerPrefetch(async () => {
  await suspense();
});

watch(
  [isFetching, isSuccess, data],
  async ([fetching, success, workspaces]) => {
    if (!fetching && success && workspaces?.length) {
      const workspaceId = chooseWorkspaceId(
        workspaces.map((workspace) => workspace.$id),
        lastWorkspaceId.value,
      );
      if (!workspaceId) return;
      setWorkspaceId(workspaceId);
      await navigateTo(`/workspaces/${workspaceId}`);
    }
  },
  { immediate: true },
);
</script>

<template>
  <Loader v-if="isFetching" class="h-96 min-h-auto" />

  <div
    v-else-if="showEmptyState"
    class="flex flex-col items-center justify-center gap-6 px-6 py-6"
  >
    <Card class="w-full max-w-3xl border shadow">
      <CardHeader>
        <CardTitle class="text-xl font-bold">{{
          t("workspace.empty.title")
        }}</CardTitle>
        <CardDescription>
          {{ t("workspace.empty.description") }}
        </CardDescription>
      </CardHeader>
    </Card>

    <div class="w-full max-w-3xl">
      <CreateWorkspaceForm />
    </div>
  </div>

  <div v-else class="hidden">
    <Loader class="h-96 min-h-auto" />
  </div>
</template>
