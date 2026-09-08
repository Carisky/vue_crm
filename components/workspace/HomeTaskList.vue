<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns';
import { enUS, pl, ru } from 'date-fns/locale';
import { taskPriorityTranslationKeys } from '~/lib/i18n';
import type { FilteredTask } from '~/lib/types';

const { tasks, total } = defineProps<{ tasks: FilteredTask[]; total: number }>()

const route = useRoute()
const { open: openTaskModal } = useCreateTaskModal()
const { locale, t } = useAppI18n()
const dateLocales = { en: enUS, pl, ru }
</script>

<template>
    <section class="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
            <div class="flex h-12 shrink-0 items-center justify-between border-b px-4">
                <p class="font-semibold">
                    {{ t('task.total') }} <span class="text-muted-foreground">{{ total }}</span>
                </p>
                <Button variant="ghost" size="icon" class="size-8" @click="openTaskModal('1')">
                    <Icon name="lucide:plus" class="size-4 text-muted-foreground" />
                </Button>
            </div>
            <ul class="min-h-0 flex-1 divide-y overflow-hidden">
                <li v-for="(task, index) of tasks" :key="task.$id" :class="index >= 3 ? 'hidden sm:block' : ''">
                    <NuxtLink :href="`/workspaces/${task.workspace_id}/tasks/${task.$id}`"
                        class="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2 transition hover:bg-muted/60">
                        <div class="min-w-0">
                            <p class="truncate text-sm font-medium">{{ task.name }}</p>
                            <div class="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                                <span class="truncate">{{ task.project?.name ?? '' }}</span>
                                <span>·</span>
                                <Icon name="lucide:calendar" class="size-3 shrink-0" />
                                <span class="truncate">{{ task.due_date ? formatDistanceToNow(task.due_date, { locale: dateLocales[locale] }) : t('task.noDueDate') }}</span>
                            </div>
                        </div>
                        <Badge :variant="task.priority" class="text-[10px]">{{ t(taskPriorityTranslationKeys[task.priority]) }}</Badge>
                    </NuxtLink>
                </li>
                <li v-if="!tasks?.length" class="p-4 text-center text-sm text-muted-foreground">
                    {{ t('task.noneFound') }}
                </li>
            </ul>
            <Button variant="ghost" class="h-10 shrink-0 rounded-none border-t" :as-child="true">
                <NuxtLink :href="`/workspaces/${route.params['workspaceId']}/tasks`">{{ t('task.showAll') }} · {{ total }}</NuxtLink>
            </Button>
    </section>
</template>
