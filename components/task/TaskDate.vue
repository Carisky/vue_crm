<script setup lang="ts">
import { differenceInDays, format } from 'date-fns';

import { cn } from '~/lib/utils';

const { value, class: className = '', emptyText = 'No due date' } = defineProps<{
    value?: string | null;
    class?: string;
    emptyText?: string;
}>()

const today = new Date()
const parsedDate = value ? new Date(value) : null
const isValidDate = parsedDate ? !Number.isNaN(parsedDate.getTime()) : false
const diffInDays = isValidDate ? differenceInDays(parsedDate!, today) : undefined

let textColor = 'text-muted-foreground'
if (typeof diffInDays === 'number') {
    if (diffInDays <= 3) textColor = 'text-red-500'
    else if (diffInDays <= 7) textColor = 'text-orange-500'
    else if (diffInDays <= 14) textColor = 'text-yellow-500'
}

const hasValidDate = isValidDate
const formattedDate = hasValidDate ? format(parsedDate!, 'PPP') : undefined
</script>

<template>
    <div :class="textColor">
        <span v-if="hasValidDate" :class="cn('truncate', className)">
            {{ formattedDate }}
        </span>
        <span v-else class="truncate" :class="className">{{ emptyText }}</span>
    </div>
</template>
