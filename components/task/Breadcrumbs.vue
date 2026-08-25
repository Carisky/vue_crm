<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';

import type { FilteredTask, Project } from '~/lib/types';
import { ConfirmModal } from '#components';

const { project, task } = defineProps<{ project: Project | null; task: FilteredTask; }>()

const route = useRoute()
const { openModal } = useConfirmModal()

const queryClient = useQueryClient()
const { t } = useAppI18n()

// Delete task
const deleteTask = async () => {
    await $fetch('/api/tasks/delete', { method: 'DELETE', body: { taskId: task.$id } })
        .then(async () => {
            await queryClient.invalidateQueries({ queryKey: ['tasks', route.params['workspaceId']] })
            await navigateTo(`/workspaces/${route.params['workspaceId']}/tasks`)
            toast.success(t('task.deleted'))
        }).catch(() => {
            toast.error(t('task.deleteFailed'))
        })
}

const showDeleteModal = () => {
    openModal(ConfirmModal, {
        onConfirm: deleteTask,
        title: `${t('task.deleteTitle')} "${task.name}"`,
        message: t('common.irreversible'),
        variant: 'destructive'
    })
}
</script>

<template>
    <div class="flex items-center gap-x-2">
        <ProjectAvatar v-if="project" :name="project.name" :image="project.image_url ?? undefined" class="size-6 lg:size-8" />
        <NuxtLink v-if="project" :href="`/workspaces/${route.params['workspaceId']}/projects/${project.$id}`">
            <p class="text-sm font-semibold text-muted-foreground transition hover:opacity-75 lg:text-lg">{{
                project.name }}</p>
        </NuxtLink>
        <Icon v-if="project" name="lucide:chevron-right" size="16px" class="size-4 text-muted-foreground lg:hidden!" />
        <Icon v-if="project" name="lucide:chevron-right" size="20px" class="size-5 text-muted-foreground hidden! lg:block!" />
        <p class="text-sm font-semibold lg:text-lg">{{
            task.name }}</p>
        <Button @click="showDeleteModal" variant="destructive" size="sm" class="ml-auto">
            <Icon name="lucide:trash" class="size-4 lg:mr-1" />
            <span class="hidden lg:block">{{ t('task.deleteTitle') }}</span>
        </Button>
    </div>
</template>
