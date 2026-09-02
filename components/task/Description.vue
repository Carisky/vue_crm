<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';

import type { FilteredTask } from '~/lib/types';
import { invalidateTaskQueries } from '~/lib/task-query-keys';
import TaskMediaGallery from './TaskMediaGallery.vue';

const { task } = defineProps<{ task: FilteredTask }>()

const queryClient = useQueryClient()
const { t } = useAppI18n()

const inputDescription = ref(task.description ?? '')
const isEditing = ref(false)

const { isPending, mutate: save } = useMutation({
    mutationFn: async () => {
        isEditing.value = true
        const res =
            await $fetch(`/api/tasks/${task.$id}`, { method: 'PATCH', body: { description: inputDescription.value } })
        if ((res as unknown as { task: FilteredTask }).task) {
            await invalidateTaskQueries(queryClient, task.$id)
            isEditing.value = false
            toast.success(t('task.descriptionUpdated'))
        } else toast.error(t('task.descriptionUpdateFailed'))
    },
    onError: () => toast.error(t('task.descriptionUpdateFailed'))
})
</script>

<template>
    <div class="flex flex-col gap-4 p-4 border rounded-lg">
        <div class="flex items-center justify-between">
            <p class="text-lg font-semibold">
                {{ t('common.description') }}
            </p>
            <Button variant="secondary" size="sm" :disabled="isPending" @click="isEditing = !isEditing">
                <Icon v-if="isEditing" name="heroicons:x-mark" size="16px" class="size-4 mr-1" />
                <Icon v-else name="lucide:pencil" size="16px" class="size-4 mr-1" />
                <template v-if="isEditing">{{ t('common.cancel') }}</template>
                <template v-else>{{ t('common.edit') }}</template>
            </Button>
        </div>
        <DottedSeparator class="h-auto my-4" />
        <div v-if="isEditing" class="flex flex-col gap-y-4">
            <Textarea v-model="inputDescription" rows="4" :disabled="isPending"
                :placeholder="t('task.descriptionPlaceholder')"></Textarea>
            <Button size="sm" :disabled="isPending" @click="save" class="w-32 ml-auto">
                <Icon v-if="isPending" name="svg-spinners:8-dots-rotate" size="16px" class="size-4" />
                <template v-else>{{ t('task.saveChanges') }}</template>
            </Button>
        </div>
        <div v-else class="min-w-0">
            <div v-if="task.description"
                class="max-h-96 overflow-y-auto whitespace-pre-wrap break-words pr-2 leading-relaxed">{{ task.description }}</div>
            <span v-else class="text-muted-foreground">{{ t('task.noDescription') }}</span>
        </div>
        
    </div>
    <TaskMediaGallery :media="task.media" :task-id="task.$id" :workspace-id="task.workspace_id" />
</template>
