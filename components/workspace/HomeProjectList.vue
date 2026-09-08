<script setup lang="ts">
import type { Project } from '~/lib/types';

const { projects, total } = defineProps<{ projects: Project[]; total: number }>()

const { open: openProjectModal } = useCreateProjectModal()
const { t } = useAppI18n()
</script>

<template>
    <section class="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card text-card-foreground">
            <div class="flex h-12 shrink-0 items-center justify-between border-b px-4">
                <p class="font-semibold">
                    {{ t('nav.projects') }} <span class="text-muted-foreground">{{ total }}</span>
                </p>
                <Button variant="ghost" size="icon" class="size-8" @click="() => openProjectModal()">
                    <Icon name="lucide:plus" size="16px" class="size-4 text-muted-foreground" />
                </Button>
            </div>
            <ul class="min-h-0 flex-1 divide-y overflow-hidden">
                <li v-for="(project, index) of projects" :key="project.$id" :class="index >= 4 ? 'hidden sm:block' : ''">
                    <NuxtLink :href="`/workspaces/${project.workspace_id}/projects/${project.$id}`"
                        class="flex min-h-11 items-center gap-2.5 px-4 py-1.5 transition hover:bg-muted/60">
                                <ProjectAvatar
                                    :name="project.name"
                                    :image="project.image_url ?? undefined"
                                    class="size-7 shrink-0"
                                />
                                <div class="min-w-0 flex-1">
                                    <p class="truncate text-sm font-medium">{{ project.name }}</p>
                                    <ProgressBar :value="project.progress" :completed="project.completed_tasks" :total="project.total_tasks" compact />
                                </div>
                                <Icon v-if="project.is_effectively_restricted" name="lucide:lock" class="size-4 shrink-0 text-muted-foreground"
                                    :title="t('project.private')" :aria-label="t('project.private')" />
                    </NuxtLink>
                </li>
                <li v-if="!projects?.length" class="p-4 text-center text-sm text-muted-foreground">
                    {{ t('project.noneFound') }}
                </li>
            </ul>
    </section>
</template>
