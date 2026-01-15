<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';

import type { FilteredTask } from '~/lib/types';
import CommentBody from './comments/CommentBody.vue';

type Person = {
  $id: string;
  name: string | null;
  email: string;
  avatar_url: string | null;
};

type TaskComment = {
  $id: string;
  task_id: string;
  workspace_id: string;
  body: string;
  author: Person;
  mentions: Person[];
  createdAt: string;
  updatedAt: string;
};

const { task } = defineProps<{ task: FilteredTask }>();

const queryClient = useQueryClient();
const queryKey = computed(() => ['task-comments', task.$id]);

const { data: comments, isFetching } = useQuery<TaskComment[]>({
  queryKey,
  queryFn: async () => {
    const res = await $fetch<{ comments: TaskComment[] }>(
      `/api/tasks/${task.$id}/comments`,
    );
    return res.comments ?? [];
  },
});

const { data: people } = useQuery<Person[]>({
  queryKey: computed(() => ['workspace-people', task.workspace_id]),
  queryFn: async () => {
    const res = await $fetch<{ people: Person[] }>(
      `/api/workspaces/${task.workspace_id}/people`,
    );
    return res.people ?? [];
  },
});

const displayName = (person: Person) => person.name ?? person.email ?? 'Unknown';
const formatTimestamp = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

const draft = ref('');
const textareaRef = ref<HTMLTextAreaElement | null>(null);

const mentionContext = ref<{
  query: string;
  startIndex: number;
  endIndex: number;
} | null>(null);

const updateMentionContext = () => {
  const el = textareaRef.value;
  if (!el) {
    mentionContext.value = null;
    return;
  }

  const cursor = el.selectionStart ?? draft.value.length;
  const before = draft.value.slice(0, cursor);

  const m = /(^|\s)@([^\s@]{0,40})$/.exec(before);
  if (!m || m.index == null) {
    mentionContext.value = null;
    return;
  }

  const startIndex = (m.index ?? 0) + (m[1]?.length ?? 0);
  mentionContext.value = {
    query: m[2] ?? '',
    startIndex,
    endIndex: cursor,
  };
};

const suggestions = computed(() => {
  const ctx = mentionContext.value;
  if (!ctx) return [];

  const q = ctx.query.trim().toLowerCase();
  return (people.value ?? [])
    .filter((p) => {
      if (!q) return true;
      return (
        displayName(p).toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q)
      );
    })
    .slice(0, 8);
});

const insertMention = async (person: Person) => {
  const ctx = mentionContext.value;
  const el = textareaRef.value;
  if (!ctx || !el) return;

  const label = displayName(person);
  const token = `@[${label}](${person.$id})`;

  const before = draft.value.slice(0, ctx.startIndex);
  const after = draft.value.slice(ctx.endIndex);
  const nextValue = `${before}${token} ${after}`;
  draft.value = nextValue;

  mentionContext.value = null;
  await nextTick();
  el.focus();
  const caret = before.length + token.length + 1;
  el.setSelectionRange(caret, caret);
};

const extractMentionIds = (value: string) =>
  Array.from(
    new Set(
      Array.from(value.matchAll(/@\[[^\]]+\]\(([^)]+)\)/g)).map((m) => m[1]),
    ),
  ).filter(Boolean);

const { mutateAsync: createComment, isPending } = useMutation({
  mutationFn: async (body: string) => {
    return await $fetch(`/api/tasks/${task.$id}/comments`, {
      method: 'POST',
      body: {
        body,
        mention_ids: extractMentionIds(body),
      },
    });
  },
  onSuccess: async () => {
    draft.value = '';
    mentionContext.value = null;
    await queryClient.invalidateQueries({ queryKey: queryKey.value });
    await queryClient.invalidateQueries({ queryKey: ['inbox', task.workspace_id] });
    toast.success('Comment added');
  },
  onError: () => toast.error('Failed to add comment'),
});

const submit = async () => {
  const body = draft.value.trim();
  if (!body || isPending.value) return;
  await createComment(body);
};
</script>

<template>
  <div class="flex flex-col gap-4 p-4 border rounded-lg lg:col-span-2">
    <div class="flex items-center justify-between">
      <p class="text-lg font-semibold">
        Comments
      </p>
      <span class="text-xs text-muted-foreground">
        {{ comments?.length ?? 0 }}
      </span>
    </div>

    <DottedSeparator class="h-auto my-1" />

    <div class="relative space-y-2">
      <Textarea
        ref="textareaRef"
        v-model="draft"
        rows="3"
        :disabled="isPending"
        placeholder="Write a comment… Use @ to mention teammates. Use { /route/path/File.vue } to share file paths."
        @input="updateMentionContext"
        @click="updateMentionContext"
        @keyup="updateMentionContext"
      />

      <div
        v-if="mentionContext && suggestions.length"
        class="absolute left-0 top-full z-20 mt-1 w-full rounded-lg border bg-background shadow-lg overflow-hidden"
      >
        <button
          v-for="person in suggestions"
          :key="person.$id"
          type="button"
          class="w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted transition"
          @click="insertMention(person)"
        >
          <WorkspaceMemberAvatar :name="displayName(person)" class="size-7" fallback-class="text-xs" />
          <div class="min-w-0">
            <p class="font-semibold truncate">{{ displayName(person) }}</p>
            <p class="text-xs text-muted-foreground truncate">{{ person.email }}</p>
          </div>
        </button>
      </div>

      <div class="flex items-center justify-end gap-2">
        <Button size="sm" :disabled="isPending || !draft.trim()" @click="submit">
          <Icon v-if="isPending" name="svg-spinners:8-dots-rotate" size="16px" class="size-4" />
          <template v-else>Send</template>
        </Button>
      </div>
    </div>

    <div v-if="isFetching" class="py-6">
      <Loader class="h-24" />
    </div>

    <div v-else-if="!comments?.length" class="text-sm text-muted-foreground py-6 text-center">
      No comments yet.
    </div>

    <ul v-else class="space-y-3">
      <li
        v-for="comment in comments"
        :key="comment.$id"
        class="rounded-xl border px-3 py-3"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-start gap-3 min-w-0">
            <WorkspaceMemberAvatar :name="displayName(comment.author)" class="size-8" fallback-class="text-sm" />
            <div class="min-w-0">
              <p class="text-sm font-semibold truncate">{{ displayName(comment.author) }}</p>
              <p class="text-xs text-muted-foreground truncate">
                {{ formatTimestamp(comment.createdAt) }}
              </p>
            </div>
          </div>
        </div>

        <div class="mt-2">
          <CommentBody :body="comment.body" />
        </div>
      </li>
    </ul>
  </div>
</template>
