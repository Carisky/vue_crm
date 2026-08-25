<script setup lang="ts">
import { cn } from '~/lib/utils';

const { title, value, variant, increaseValue } = defineProps<{
    title: string;
    value: number;
    variant: 'up' | 'down';
    increaseValue: number;
}>()

const colorVariant = variant === 'up' ? 'text-emerald-500' : 'text-red-500'
const increaseValueVariant = variant === 'up' ? 'text-emerald-500' : 'text-red-500'
const iconName = variant === 'up' ? 'carbon:caret-up' : 'carbon:caret-down'
</script>

<template>
    <Card class="h-full w-full gap-0 rounded-none border-none py-0 shadow-none">
        <CardHeader class="min-w-0 gap-1 px-3 py-2.5 sm:px-4">
            <div class="flex min-w-0 items-start justify-between gap-2">
                <CardDescription class="min-w-0 flex-1 overflow-hidden font-medium">
                    <span class="line-clamp-2 text-xs leading-4 whitespace-normal" :title="title">
                        {{ title }}
                    </span>
                </CardDescription>
                <div class="flex shrink-0 items-center gap-0.5 pt-0.5">
                    <Icon :name="iconName" size="12px" :class="cn('size-3', colorVariant)" />
                    <span :class="cn('text-xs font-medium', increaseValueVariant)">{{ increaseValue }}</span>
                </div>
            </div>
            <CardTitle class="text-xl leading-6 font-semibold">{{ value }}</CardTitle>
        </CardHeader>
    </Card>
</template>
