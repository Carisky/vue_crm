<script setup lang="ts">
const route = useRoute();
const { start } = useProductTour();
const { t } = useAppI18n();

async function launchTour() {
  const workspaceId =
    route.params["workspaceId"] ?? route.query["workspace_id"];
  const isDashboard = route.meta.layout === "dashboard";

  if (!isDashboard && typeof workspaceId === "string" && workspaceId) {
    await navigateTo(`/workspaces/${encodeURIComponent(workspaceId)}`);
    await nextTick();
  }

  start();
}
</script>

<template>
  <Button
    type="button"
    variant="ghost"
    size="icon"
    data-tour="restart"
    :aria-label="t('tour.startLabel')"
    :title="t('tour.label')"
    @click="launchTour"
  >
    <Icon
      name="lucide:info"
      size="17px"
      class="size-[17px] text-muted-foreground"
    />
  </Button>
</template>
