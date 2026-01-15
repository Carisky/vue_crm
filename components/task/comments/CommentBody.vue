<script setup lang="ts">
import { computed } from 'vue';

type Segment =
  | { type: 'text'; value: string }
  | { type: 'mention'; label: string; userId: string }
  | { type: 'file'; path: string; label: string };

const props = defineProps<{ body: string }>();

const segments = computed<Segment[]>(() => {
  const input = props.body ?? '';
  if (!input) return [];

  const out: Segment[] = [];
  const tokenRegex = /@\[[^\]]+\]\([^)]+\)|\{[^}]+\}/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(input))) {
    if (match.index > last) {
      out.push({ type: 'text', value: input.slice(last, match.index) });
    }

    const token = match[0] ?? '';
    if (token.startsWith('@[')) {
      const mentionMatch = /^@\[(.+?)\]\((.+?)\)$/.exec(token);
      if (mentionMatch) {
        out.push({
          type: 'mention',
          label: mentionMatch[1],
          userId: mentionMatch[2],
        });
      } else {
        out.push({ type: 'text', value: token });
      }
    } else if (token.startsWith('{')) {
      const fileMatch = /^\{(.+)\}$/.exec(token);
      const path = (fileMatch?.[1] ?? '').trim();
      const label =
        path.split(/[\\/]/).filter(Boolean).pop() ?? path ?? token;
      if (path) {
        out.push({ type: 'file', path, label });
      } else {
        out.push({ type: 'text', value: token });
      }
    } else {
      out.push({ type: 'text', value: token });
    }

    last = tokenRegex.lastIndex;
  }

  if (last < input.length) {
    out.push({ type: 'text', value: input.slice(last) });
  }

  return out;
});
</script>

<template>
  <p class="text-sm whitespace-pre-wrap leading-relaxed">
    <template v-for="(seg, idx) in segments" :key="idx">
      <span v-if="seg.type === 'text'">{{ seg.value }}</span>
      <span
        v-else-if="seg.type === 'mention'"
        class="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-primary font-semibold"
      >
        @{{ seg.label }}
      </span>
      <Badge
        v-else
        variant="secondary"
        class="mx-0.5 align-middle"
        :title="seg.path"
      >
        {{ seg.label }}
      </Badge>
    </template>
  </p>
</template>

