<script setup lang="ts">
import { computed, watch } from "vue";
import { useQuery } from "@tanstack/vue-query";

import authenticatedPageProtectMiddleware from "~/middleware/page-protect/authenticatedPage";
import type { Workspace } from "~/lib/types";
import CreateWorkspaceForm from "~/components/workspace/CreateWorkspaceForm.vue";

definePageMeta({
  layout: "dashboard",
  middleware: [authenticatedPageProtectMiddleware],
});

useHead({
  title: "DEV crm",
});

const { data, isFetching, isSuccess, suspense } = useQuery<Workspace[]>(
  {
    queryKey: ["workspaces/all"],
    queryFn: async () => {
      const res = await fetch("/api/workspaces/all");
      const data = await res.json();
      return data?.workspaces ?? null;
    },
    staleTime: Infinity,
    experimental_prefetchInRender: true,
  },
);

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
      await navigateTo(`/workspaces/${workspaces[0].$id}`);
    }
  },
  { immediate: true },
);
</script>

<template>
  <Loader v-if="isFetching" class="h-96 min-h-auto" />

  <div
    v-else-if="showEmptyState"
    class="flex flex-col gap-6 px-6 py-6 items-center justify-center"
  >
    <Card class="w-full max-w-3xl border shadow">
      <CardHeader>
        <CardTitle class="text-xl font-bold">No workspaces yet</CardTitle>
        <CardDescription>
          You're not a member of any workspace right now. Use an invite link to join an
          existing one or keep the creation form below handy for when you're ready.
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
