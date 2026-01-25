<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Icon,
} from '#components';

import type { TaskMedia } from '~/lib/types';

const props = defineProps<{
  media: TaskMedia[];
  taskId?: string;
  workspaceId?: string;
}>();

const previewMedia = ref<TaskMedia | null>(null);
const mediaInput = ref<HTMLInputElement | null>(null);
const isUploadingMedia = ref(false);
const mediaUploadProgress = ref(0);
const mediaUploadError = ref<string | null>(null);
const selectedVariantId = ref<string | null>(null);

const queryClient = useQueryClient();

const hasMedia = computed(() => props.media.length > 0);
const canEdit = computed(
  () => Boolean(props.taskId && props.workspaceId),
);

const resolveUrl = (path: string) => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return path.startsWith('/') ? path : `/${path}`;
};

type VideoSource = {
  id: string;
  path: string;
  mime: string | null;
  resolution: number | null;
  label: string;
  isOriginal: boolean;
};

const videoSources = computed<VideoSource[]>(() => {
  const media = previewMedia.value;
  if (!media || !isVideo(media)) return [];

  const baseResolution = media.resolution ?? null;
  const baseLabel = baseResolution
    ? `${baseResolution}p (original)`
    : 'Original';

  const baseSource: VideoSource = {
    id: media.id,
    path: media.path,
    mime: media.mime,
    resolution: baseResolution,
    label: baseLabel,
    isOriginal: true,
  };

  const variantSources = (media.variants ?? []).map((variant) => ({
    id: variant.id,
    path: variant.path,
    mime: variant.mime,
    resolution: variant.resolution ?? null,
    label: variant.resolution ? `${variant.resolution}p` : 'Variant',
    isOriginal: false,
  }));

  return [baseSource, ...variantSources].sort(
    (a, b) => (b.resolution ?? 0) - (a.resolution ?? 0),
  );
});

const activeVideoSource = computed<VideoSource | null>(() => {
  const sources = videoSources.value;
  if (!sources.length) return null;
  const selected = selectedVariantId.value
    ? sources.find((source) => source.id === selectedVariantId.value)
    : null;
  return selected ?? sources[0];
});

const previewUrl = computed(() => {
  if (!previewMedia.value) return '';
  if (isVideo(previewMedia.value) && activeVideoSource.value) {
    return resolveUrl(activeVideoSource.value.path);
  }
  return resolveUrl(previewMedia.value.path);
});

watch(() => previewMedia.value?.id, () => {
  selectedVariantId.value = null;
});

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

const sanitizeFileName = (value: string) =>
  value.replace(/[^a-zA-Z0-9_.-]/g, '_');

const uploadMedia = (formData: FormData, onProgress: (value: number) => void) =>
  new Promise<{ files?: { path: string; mime?: string; original_name?: string }[] }>(
    (resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('POST', '/api/tasks/media');
      request.responseType = 'json';

      request.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      };

      request.onload = () => {
        if (request.status >= 200 && request.status < 300) {
          const response =
            request.response ??
            (request.responseText ? JSON.parse(request.responseText) : {});
          resolve(response as { files?: { path: string; mime?: string; original_name?: string }[] });
          return;
        }

        reject(new Error(`Upload failed (${request.status})`));
      };

      request.onerror = () => reject(new Error('Upload failed'));
      request.send(formData);
    },
  );

const refetchTask = async () => {
  if (!props.taskId) return;
  await queryClient.refetchQueries({ queryKey: ['task', props.taskId] });
};

const handleMediaChange = async (event: Event) => {
  if (!canEdit.value) return;

  const target = event.target as HTMLInputElement | null;
  const files = target?.files;
  if (!files?.length) return;

  isUploadingMedia.value = true;
  mediaUploadProgress.value = 0;
  mediaUploadError.value = null;

  const formData = new FormData();
  formData.append('workspace_id', String(props.workspaceId));
  const uploadFiles = Array.from(files);
  const originalNames = uploadFiles.map((file) => file.name);
  uploadFiles.forEach((file, index) => {
    const safeName = sanitizeFileName(file.name) || `upload-${index}`;
    formData.append('files', file, safeName);
  });

  try {
    const res = await uploadMedia(formData, (value) => {
      mediaUploadProgress.value = value;
    });
    const uploaded = (res?.files ?? []).map((file, index) => ({
      path: file.path,
      mime: file.mime,
      original_name: originalNames[index] ?? file.original_name,
    }));

    if (uploaded.length && props.taskId) {
      const attachRes = await $fetch(`/api/tasks/${props.taskId}`, {
        method: 'PATCH',
        body: { media: uploaded },
      });
      if ((attachRes as { task?: unknown }).task) {
        await refetchTask();
        toast.success('Media uploaded');
      } else {
        toast.error('Failed to attach media');
      }
    }
  } catch (error) {
    mediaUploadError.value = 'Failed to upload media';
  } finally {
    mediaUploadProgress.value = 0;
    isUploadingMedia.value = false;
    if (target) target.value = '';
  }
};

const removeMedia = async (mediaId: string) => {
  try {
    await $fetch('/api/tasks/media', {
      method: 'DELETE',
      body: { media_id: mediaId },
    });
    await refetchTask();
    toast.success('Media deleted');
  } catch (error) {
    toast.error('Failed to delete media file');
  }
};
</script>

<template>
  <div class="p-4 border rounded-lg">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-lg font-semibold">Media</p>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {{ props.media.length }} file<span v-if="props.media.length !== 1">s</span>
        </span>
        <div v-if="canEdit" class="flex items-center gap-2">
          <input ref="mediaInput" type="file" multiple class="hidden" @change="handleMediaChange" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            class="uppercase tracking-wide"
            @click="mediaInput?.click()"
            :disabled="isUploadingMedia"
          >
            <Icon
              v-if="isUploadingMedia"
              name="svg-spinners:3-dots-rotating"
              size="16px"
              class="size-4"
            />
            <span v-else>Upload files</span>
          </Button>
        </div>
      </div>
    </div>

    <div v-if="canEdit && (isUploadingMedia || mediaUploadError)" class="mt-2 space-y-1">
      <div v-if="isUploadingMedia" class="h-1 w-full overflow-hidden rounded bg-muted">
        <div
          class="h-full bg-primary transition-[width] duration-150"
          :style="{ width: `${mediaUploadProgress}%` }"
        ></div>
      </div>
      <p v-if="isUploadingMedia" class="text-[11px] font-medium text-muted-foreground">
        Uploading... {{ mediaUploadProgress }}%
      </p>
      <p v-if="mediaUploadError" class="text-xs text-destructive">
        {{ mediaUploadError }}
      </p>
    </div>

    <div v-if="!hasMedia" class="text-sm text-muted-foreground">
      No media files attached to this task yet.
    </div>

    <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <button
        v-for="item in props.media"
        :key="item.id"
        type="button"
        class="group relative flex h-full flex-col rounded-lg border px-3 py-3 transition hover:border-primary"
        @click="openPreview(item)"
      >
        <Button
          v-if="canEdit"
          type="button"
          variant="secondary"
          size="icon"
          class="absolute right-2 top-2 h-7 w-7 opacity-0 transition group-hover:opacity-100"
          @click.stop="removeMedia(item.id)"
          data-row-click="ignore"
        >
          <Icon name="lucide:trash-2" size="14px" class="size-3.5" />
        </Button>
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
        <div v-else-if="isVideo(previewMedia)" class="flex flex-col gap-3">
          <div
            v-if="videoSources.length > 1"
            class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground"
          >
            <span class="font-semibold uppercase tracking-wide">Quality:</span>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="source in videoSources"
                :key="source.id"
                type="button"
                class="rounded-full border px-3 py-1 text-[11px] uppercase transition hover:border-primary hover:text-primary"
                :class="source.id === activeVideoSource?.id
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground'"
                @click="selectedVariantId = source.id"
              >
                {{ source.label }}
              </button>
            </div>
          </div>
          <video
            controls
            playsinline
            class="w-full rounded-lg border bg-black"
          >
            <source
              :src="resolveUrl(activeVideoSource?.path ?? previewMedia?.path ?? '')"
              :type="activeVideoSource?.mime ?? previewMedia?.mime ?? undefined"
            />
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
