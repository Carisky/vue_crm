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
  <div v-if="compact" class="flex min-w-0 items-center gap-2">
    <div class="h-1 min-w-8 flex-1 overflow-hidden rounded-full bg-muted">
      <div
        class="h-full rounded-full bg-primary transition-[width] duration-300"
        :style="{ width: `${safeValue}%` }"
      />
    </div>
    <span
      class="shrink-0 text-[10px] leading-none text-muted-foreground tabular-nums"
      :title="total ? `${completed}/${total}` : undefined"
    >
      {{ safeValue }}%
    </span>
  </div>
  <div v-else class="min-w-0 space-y-1.5">
    <div
      class="flex items-center justify-between gap-2 text-xs text-muted-foreground"
    >
      <span>{{ t("common.progress") }}</span>
      <span class="ml-auto tabular-nums">
        <template v-if="total">{{ completed }}/{{ total }} · </template
        >{{ safeValue }}%
      </span>
    </div>
    <div
      class="h-1.5 overflow-hidden rounded-full bg-muted"
    >
      <div
        class="h-full rounded-full bg-primary transition-[width] duration-300"
        :style="{ width: `${safeValue}%` }"
      />
    </div>
  </div>
</template>
