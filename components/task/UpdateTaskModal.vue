<script setup lang="ts">
import { ResponsiveModal } from "#components";
import UpdateTaskFormWrapper from "./UpdateTaskFormWrapper.vue";

const { state, isOpen, close } = useUpdateTaskModal();

const onModalOpenUpdate = (isOpen: boolean) => {
  if (!isOpen) close();
};
</script>

<template>
  <ResponsiveModal :open="isOpen" @open-update="onModalOpenUpdate">
    <UpdateTaskFormWrapper
      v-if="isOpen"
      :key="state.taskId"
      :task-id="state.taskId!"
      :on-cancel="close"
    />
  </ResponsiveModal>
</template>
