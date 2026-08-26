<script setup lang="ts">
import { ResponsiveModal } from '#components';
import CreateProjectForm from './CreateProjectForm.vue';

const { isOpen, close } = useCreateProjectModal()
const route = useRoute()
const formKey = computed(() => String(route.query['parent_project_id'] ?? 'root'))

const onModalOpenUpdate = (isOpen: boolean) => {
    if (!isOpen) close()
}
</script>

<template>
    <ResponsiveModal :open="isOpen" @open-update="onModalOpenUpdate">
        <CreateProjectForm v-if="isOpen" :key="formKey" :on-cancel="close" />
    </ResponsiveModal>
</template>
