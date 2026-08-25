<script setup lang="ts">
import { cn } from "~/lib/utils";

const props = defineProps<{
  name: string;
  color?: string | null;
  class?: string;
}>();
</script>

<template>
  <span
    :class="
      cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-md text-sm font-semibold text-white',
        props.class,
      )
    "
    :style="{ backgroundColor: props.color || '#64748b' }"
    :title="props.name"
  >
    {{ props.name.trim().charAt(0).toUpperCase() || "#" }}
  </span>
</template>
