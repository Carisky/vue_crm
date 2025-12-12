<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Icon,
} from '#components';

import type { TaskMedia } from '~/lib/types';

const props = defineProps<{ media: TaskMedia[] }>();

const previewMedia = ref<TaskMedia | null>(null);

const hasMedia = computed(() => props.media.length > 0);

const resolveUrl = (path: string) => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return path.startsWith('/') ? path : `/${path}`;
};

const previewUrl = computed(() =>
  previewMedia.value ? resolveUrl(previewMedia.value.path) : '',
);

const mediaFileName = (item: TaskMedia) =>
  item.original_name ?? item.path.split('/').pop() ?? 'attachment';

const isImage = (item: TaskMedia) =>
  Boolean(item.mime && item.mime.startsWith('image'));

const isVideo = (item: TaskMedia) =>
  Boolean(item.mime && item.mime.startsWith('video'));

const openPreview = (item: TaskMedia) => {
  previewMedia.value = item;
};

const handleDialogUpdate = (value: boolean) => {
  if (!value) previewMedia.value = null;
};
</script>

<template>
  <div class="p-4 border rounded-lg">
    <div class="flex items-end justify-between gap-3">
      <div>
        <p class="text-lg font-semibold">Media</p>
      </div>
      <span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {{ props.media.length }} file<span v-if="props.media.length !== 1">s</span>
      </span>
    </div>


    <div v-if="!hasMedia" class="text-sm text-muted-foreground">
      No media files attached to this task yet.
    </div>

    <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <button
        v-for="item in props.media"
        :key="item.id"
        type="button"
        class="group flex h-full flex-col rounded-lg border px-3 py-3 transition hover:border-primary"
        @click="openPreview(item)"
      >
        <div class="relative mb-3 aspect-video overflow-hidden rounded-md bg-muted">
          <img
            v-if="isImage(item)"
            :src="resolveUrl(item.path)"
            :alt="mediaFileName(item)"
            class="h-full w-full object-cover transition duration-200 group-hover:scale-105"
          />
          <div
            v-else-if="isVideo(item)"
            class="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground"
          >
            <Icon name="lucide:video" size="32px" class="size-8" />
            <p class="text-[11px] uppercase tracking-widest">Video file</p>
          </div>
          <div
            v-else
            class="flex h-full items-center justify-center text-xs text-muted-foreground"
          >
            Preview not available
          </div>
        </div>
        <div class="flex flex-col gap-1 text-left text-sm">
          <p class="truncate font-medium">{{ mediaFileName(item) }}</p>
          <div class="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>{{ item.mime ?? 'Unknown format' }}</span>
            <a
              :href="resolveUrl(item.path)"
              target="_blank"
              rel="noreferrer"
              class="flex items-center gap-1 text-primary hover:underline"
              @click.stop
            >
              Open
              <Icon name="lucide:external-link" size="14px" class="size-4" />
            </a>
          </div>
        </div>
      </button>
    </div>
  </div>

  <Dialog :open="!!previewMedia" @update:open="handleDialogUpdate">
    <DialogContent v-if="previewMedia">
      <DialogTitle>{{ mediaFileName(previewMedia) }}</DialogTitle>
      <DialogDescription class="text-xs text-muted-foreground">
        Preview shown below. Use the button to open the file in a new tab if you need the full experience.
      </DialogDescription>
      <div class="mt-4 flex flex-col gap-4">
        <div v-if="isImage(previewMedia)">
          <img
            :src="previewUrl"
            :alt="mediaFileName(previewMedia)"
            class="w-full rounded-lg border bg-black/5 object-contain"
          />
        </div>
        <div v-else-if="isVideo(previewMedia)">
          <video
            controls
            playsinline
            class="w-full rounded-lg border bg-black"
          >
            <source :src="previewUrl" :type="previewMedia?.mime ?? undefined" />
            {{ mediaFileName(previewMedia) }}
          </video>
        </div>
        <div v-else class="rounded-lg border bg-muted/30 p-6 text-center text-sm">
          Preview is not available for this file format.
        </div>
        <div class="flex items-center justify-between text-sm text-muted-foreground">
          <span>Open in browser:</span>
          <a
            :href="previewUrl"
            target="_blank"
            rel="noreferrer"
            class="inline-flex items-center gap-1 text-primary hover:underline"
          >
            {{ previewUrl }}
            <Icon name="lucide:external-link" size="14px" class="size-4" />
          </a>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
