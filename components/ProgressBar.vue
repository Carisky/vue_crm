<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    value: number;
    completed?: number;
    total?: number;
    compact?: boolean;
  }>(),
  { completed: 0, total: 0, compact: false },
);

const safeValue = computed(() =>
  Math.max(0, Math.min(100, Math.round(props.value))),
);
const { t } = useAppI18n();
</script>

<template>
  <div class="min-w-0" :class="compact ? 'space-y-1' : 'space-y-2'">
    <div
      class="flex items-center justify-between gap-2 text-muted-foreground"
      :class="compact ? 'text-[10px]' : 'text-sm'"
    >
      <span v-if="!compact">{{ t("common.progress") }}</span>
      <span class="ml-auto tabular-nums">
        <template v-if="total">{{ completed }}/{{ total }} · </template
        >{{ safeValue }}%
      </span>
    </div>
    <div
      class="overflow-hidden rounded-full bg-muted"
      :class="compact ? 'h-1' : 'h-2.5'"
    >
      <div
        class="h-full rounded-full bg-primary transition-[width] duration-300"
        :style="{ width: `${safeValue}%` }"
      />
    </div>
  </div>
</template>
