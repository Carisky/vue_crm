<script setup lang="ts">
import { ResponsiveModal } from "#components";

const { state, isOpen, close } = useCreateTaskModal();

const onModalOpenUpdate = (isOpen: boolean) => {
  if (!isOpen) close();
};
</script>

<template>
  <ResponsiveModal :open="isOpen" @open-update="onModalOpenUpdate">
    <TaskCreateTaskFormWrapper
      v-if="isOpen"
      :initial-status="state.initialStatus"
      :parent-task-id="state.parentTaskId"
      :on-cancel="close"
    />
  </ResponsiveModal>
</template>
