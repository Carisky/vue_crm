<script setup lang="ts">
import { taskPriorityTranslationKeys, taskStatusTranslationKeys } from '~/lib/i18n';
import type { FilteredTask } from '~/lib/types';

const { task } = defineProps<{ task: FilteredTask }>()

const { t } = useAppI18n()

const { open: openUpdateTaskModal } = useUpdateTaskModal()
</script>

<template>
    <div class="flex flex-col gap-y-4 col-span-1">
        <div class="bg-muted rounded-lg p-4">
            <div class="flex items-center justify-between">
                <p class="text-lg font-semibold">{{ t('task.overview') }}</p>
                <Button variant="secondary" size="sm" @click="openUpdateTaskModal(task.$id)">
                    <Icon name="lucide:pencil" size="16px" class="size-4 mr-1" />
                    {{ t('common.edit') }}
                </Button>
            </div>
            <DottedSeparator class="h-auto my-4" />
        <div class="flex flex-col gap-y-4">
            <TaskOverviewProperty :label="t('common.assignee')">
                <WorkspaceMemberAvatar :name="task.assignee?.name ?? t('common.unassigned')" />
                <p class="text-sm font-medium">{{ task.assignee?.name ?? t('common.unassigned') }}</p>
            </TaskOverviewProperty>
                <TaskOverviewProperty :label="t('task.dueDate')">
                    <TaskDate :value="task.due_date" class="text-sm font-medium" />
                </TaskOverviewProperty>
                <TaskOverviewProperty :label="t('task.started')">
                    <TaskDate
                        :value="task.started_at"
                        class="text-sm font-medium"
                        :empty-text="t('task.notStarted')"
                    />
                </TaskOverviewProperty>
                <TaskOverviewProperty :label="t('common.status')">
                    <Badge :variant="task.status">{{ t(taskStatusTranslationKeys[task.status]) }}</Badge>
                </TaskOverviewProperty>
                <TaskOverviewProperty :label="t('common.priority')">
                    <Badge :variant="task.priority">{{ t(taskPriorityTranslationKeys[task.priority]) }}</Badge>
                </TaskOverviewProperty>
            </div>
        </div>
    </div>
</template>
