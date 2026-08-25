<script setup lang="ts">
import { ResponsiveModal } from "#components";
import UpdateTaskFormWrapper from "./UpdateTaskFormWrapper.vue";

const { isOpen, close } = useUpdateTaskModal();
const route = useRoute();
const modalTaskId = computed(() => String(route.query["update_task"] ?? ""));

const onModalOpenUpdate = (isOpen: boolean) => {
  if (!isOpen) close();
};
</script>

<template>
  <ResponsiveModal :open="isOpen" @open-update="onModalOpenUpdate">
    <UpdateTaskFormWrapper
      v-if="isOpen"
      :key="modalTaskId"
      :on-cancel="close"
    />
  </ResponsiveModal>
</template>
