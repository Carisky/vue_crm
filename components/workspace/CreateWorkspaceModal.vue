<script setup lang="ts">
import { ResponsiveModal } from '#components';
import CreateWorkspaceForm from './CreateWorkspaceForm.vue';

const { isOpen, close } = useCreateWorkspaceModal()

const onModalOpenUpdate = (isOpen: boolean) => {
    if (!isOpen) close()
}
</script>

<template>
    <ResponsiveModal :open="isOpen" @open-update="onModalOpenUpdate">
        <CreateWorkspaceForm v-if="isOpen" :on-cancel="close" />
    </ResponsiveModal>
</template>
