<script setup lang="ts">
import { ResponsiveModal } from "#components";

const { isOpen, close } = useCreateTaskModal();

const onModalOpenUpdate = (isOpen: boolean) => {
  if (!isOpen) close();
};
</script>

<template>
  <ResponsiveModal :open="isOpen" @open-update="onModalOpenUpdate">
    <TaskCreateTaskFormWrapper v-if="isOpen" :on-cancel="close" />
  </ResponsiveModal>
</template>
