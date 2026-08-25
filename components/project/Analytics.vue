<script setup lang="ts">
const { data } = defineProps<{
    data: {
        task_count: number;
        task_diff: number;
        assigned_task_count: number;
        assigned_task_diff: number;
        completed_task_count: number;
        completed_task_diff: number;
        incompleted_task_count?: number;
        incompleted_task_diff?: number;
        overdue_task_count: number;
        overdue_task_diff: number;
        project_count?: number;
        project_diff?: number;
    }
}>()
const { t } = useAppI18n()

const {
    task_count,
    task_diff,
    assigned_task_count,
    assigned_task_diff,
    completed_task_count,
    completed_task_diff,
    incompleted_task_count,
    incompleted_task_diff,
    overdue_task_count,
    overdue_task_diff
} = data

const hasIncompleteStats = computed(
    () => incompleted_task_count !== undefined && incompleted_task_diff !== undefined,
)
</script>

<template>
    <div class="w-full shrink-0 overflow-x-auto rounded-lg border bg-card">
        <div
            class="grid min-w-[720px] divide-x divide-border"
            :class="hasIncompleteStats ? 'grid-cols-5' : 'grid-cols-4'"
        >
            <AnalyticCard :title="t('task.total')" :value="task_count" :variant="task_diff > 0 ? 'up' : 'down'"
                :increase-value="task_diff" />
            <AnalyticCard :title="t('task.assigned')" :value="assigned_task_count"
                :variant="assigned_task_diff > 0 ? 'up' : 'down'" :increase-value="assigned_task_diff" />
            <AnalyticCard :title="t('task.completed')" :value="completed_task_count"
                :variant="completed_task_diff > 0 ? 'up' : 'down'" :increase-value="completed_task_diff" />
            <AnalyticCard :title="t('task.overdue')" :value="overdue_task_count"
                :variant="overdue_task_diff > 0 ? 'up' : 'down'" :increase-value="overdue_task_diff" />
            <AnalyticCard v-if="hasIncompleteStats" :title="t('task.incomplete')"
                :value="incompleted_task_count ?? 0" :variant="(incompleted_task_diff ?? 0) > 0 ? 'up' : 'down'"
                :increase-value="incompleted_task_diff ?? 0" />
        </div>
    </div>
</template>
