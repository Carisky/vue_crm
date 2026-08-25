<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useQueryClient } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Icon,
} from "#components";

import {
  TASK_MEDIA_ACCEPT,
  deleteTaskMedia,
  uploadTaskMedia,
} from "~/lib/task-media-client";
import {
  formatMediaSize,
  mediaContentUrl,
  mediaIconName,
} from "~/lib/task-media-presentation";
import type { FilteredTask, TaskMedia } from "~/lib/types";

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
const confirmDeleteMedia = ref<TaskMedia | null>(null);
const isDeletingMedia = ref(false);
const previewVideoEl = ref<HTMLVideoElement | null>(null);
const previewVideoSwitchToken = ref(0);
const queryClient = useQueryClient();
const { t } = useAppI18n();

const hasMedia = computed(() => props.media.length > 0);
const canEdit = computed(() => Boolean(props.taskId && props.workspaceId));
const isImage = (item: TaskMedia) =>
  item.kind === "image" && item.mime !== "image/svg+xml";
const isVideo = (item: TaskMedia) => item.kind === "video";
const isPdf = (item: TaskMedia) => item.kind === "pdf";
const contentUrl = (item: TaskMedia) => mediaContentUrl(item.id);

type VideoSource = {
  id: string;
  mime: string;
  resolution: number | null;
  label: string;
  isOriginal: boolean;
};
const videoSources = computed<VideoSource[]>(() => {
  const media = previewMedia.value;
  if (!media || !isVideo(media)) return [];
  const original: VideoSource = {
    id: media.id,
    mime: media.mime,
    resolution: media.resolution,
    label: media.resolution ? `${media.resolution}p (original)` : "Original",
    isOriginal: true,
  };
  const variants = media.variants.map((variant) => ({
    id: variant.id,
    mime: variant.mime,
    resolution: variant.resolution,
    label: variant.resolution ? `${variant.resolution}p` : "Variant",
    isOriginal: false,
  }));
  return [original, ...variants].sort(
    (left, right) => (right.resolution ?? 0) - (left.resolution ?? 0),
  );
});
const activeVideoSource = computed<VideoSource | null>(
  () =>
    videoSources.value.find(
      (source) => source.id === selectedVariantId.value,
    ) ??
    videoSources.value[0] ??
    null,
);
const previewUrl = computed(() => {
  const media = previewMedia.value;
  const source = activeVideoSource.value;
  if (!media) return "";
  return isVideo(media) && source
    ? mediaContentUrl(media.id, source.isOriginal ? undefined : source.id)
    : contentUrl(media);
});

watch(
  () => previewMedia.value?.id,
  () => {
    selectedVariantId.value = null;
  },
);
watch(
  () => previewUrl.value,
  async (nextUrl, previousUrl) => {
    if (
      !nextUrl ||
      nextUrl === previousUrl ||
      !previewMedia.value ||
      !isVideo(previewMedia.value)
    )
      return;
    const video = previewVideoEl.value;
    if (!video) return;
    const token = ++previewVideoSwitchToken.value;
    const currentTime = video.currentTime;
    const shouldResume = !video.paused;
    await nextTick();
    if (token !== previewVideoSwitchToken.value) return;
    video.addEventListener(
      "loadedmetadata",
      () => {
        if (token !== previewVideoSwitchToken.value) return;
        if (Number.isFinite(currentTime) && currentTime > 0)
          video.currentTime = currentTime;
        if (shouldResume) void video.play().catch(() => undefined);
      },
      { once: true },
    );
    video.load();
  },
  { flush: "post" },
);

const openPreview = (item: TaskMedia) => {
  if (isImage(item) || isVideo(item) || isPdf(item)) previewMedia.value = item;
};
const refetchTask = async () => {
  if (props.taskId)
    await queryClient.refetchQueries({ queryKey: ["task", props.taskId] });
};
const handleMediaChange = async (event: Event) => {
  if (!canEdit.value || !props.workspaceId || !props.taskId) return;
  const target = event.target as HTMLInputElement | null;
  const files = target?.files;
  if (!files?.length) return;
  isUploadingMedia.value = true;
  mediaUploadProgress.value = 0;
  mediaUploadError.value = null;
  try {
    const upload = await uploadTaskMedia(
      props.workspaceId,
      Array.from(files),
      (percent) => {
        mediaUploadProgress.value = percent;
      },
    );
    const response = await $fetch<{ task: FilteredTask | null }>(
      `/api/tasks/${props.taskId}`,
      {
        method: "PATCH",
        body: { media_ids: upload.files.map((file) => file.id) },
      },
    );
    if (!response.task) throw new Error("Task update returned no task");
    queryClient.setQueryData(["task", props.taskId], response.task);
    toast.success(t("media.uploaded"));
  } catch {
    mediaUploadError.value = "Failed to upload media";
  } finally {
    isUploadingMedia.value = false;
    mediaUploadProgress.value = 0;
    if (target) target.value = "";
  }
};
const handleDelete = async () => {
  const media = confirmDeleteMedia.value;
  if (!media) return;
  isDeletingMedia.value = true;
  try {
    await deleteTaskMedia(media.id);
    await refetchTask();
    toast.success(t("media.deleted"));
    confirmDeleteMedia.value = null;
  } catch {
    toast.error(t("media.deleteFailed"));
  } finally {
    isDeletingMedia.value = false;
  }
};
</script>

<template>
  <div class="rounded-lg border p-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-lg font-semibold">{{ t("common.media") }}</p>
        <p class="text-xs text-muted-foreground">
          {{ props.media.length }} file<span v-if="props.media.length !== 1"
            >s</span
          >
        </p>
      </div>
      <div v-if="canEdit">
        <input
          ref="mediaInput"
          type="file"
          multiple
          :accept="TASK_MEDIA_ACCEPT"
          class="hidden"
          @change="handleMediaChange"
        /><Button
          type="button"
          variant="outline"
          size="sm"
          :disabled="isUploadingMedia"
          @click="mediaInput?.click()"
          ><Icon
            v-if="isUploadingMedia"
            name="svg-spinners:3-dots-rotating"
            size="16px"
          /><span v-else>{{ t("common.uploadFiles") }}</span></Button
        >
      </div>
    </div>
    <div v-if="isUploadingMedia || mediaUploadError" class="mt-3 space-y-1">
      <div v-if="isUploadingMedia" class="h-1 overflow-hidden rounded bg-muted">
        <div
          class="h-full bg-primary"
          :style="{ width: `${mediaUploadProgress}%` }"
        />
      </div>
      <p v-if="isUploadingMedia" class="text-xs text-muted-foreground">
        Uploading… {{ mediaUploadProgress }}%
      </p>
      <p v-if="mediaUploadError" class="text-xs text-destructive">
        {{ mediaUploadError }}
      </p>
    </div>
    <p v-if="!hasMedia" class="mt-4 text-sm text-muted-foreground">
      No media files attached to this task yet.
    </p>
    <div
      v-else
      class="mt-4 grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-3"
    >
      <article
        v-for="item in props.media"
        :key="item.id"
        class="relative flex min-w-0 flex-col rounded-lg border p-3"
      >
        <Button
          v-if="canEdit"
          type="button"
          variant="ghost"
          size="icon"
          class="absolute top-2 right-2"
          :aria-label="t('media.deleteTitle')"
          @click="confirmDeleteMedia = item"
          ><Icon name="lucide:trash-2" size="16px" /></Button
        ><button
          type="button"
          class="mb-3 flex aspect-video items-center justify-center overflow-hidden rounded bg-muted"
          :disabled="!isImage(item) && !isVideo(item) && !isPdf(item)"
          @click="openPreview(item)"
        >
          <img
            v-if="isImage(item)"
            :src="contentUrl(item)"
            :alt="item.name"
            class="h-full w-full object-cover"
          /><Icon
            v-else
            :name="mediaIconName(item.kind)"
            size="36px"
            class="text-muted-foreground"
          />
        </button>
        <p class="truncate font-medium" :title="item.name">{{ item.name }}</p>
        <p class="mt-1 text-xs text-muted-foreground">
          {{ item.mime }} · {{ formatMediaSize(item.size) }}
        </p>
        <a
          :href="contentUrl(item)"
          class="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
          download
          >{{ t("common.download") }} <Icon name="lucide:download" size="14px"
        /></a>
      </article>
    </div>
  </div>
  <Dialog
    :open="Boolean(previewMedia)"
    @update:open="
      (open) => {
        if (!open) previewMedia = null;
      }
    "
    ><DialogContent v-if="previewMedia" class="sm:max-w-3xl"
      ><DialogTitle>{{ previewMedia.name }}</DialogTitle
      ><DialogDescription
        >{{ previewMedia.mime }} ·
        {{ formatMediaSize(previewMedia.size) }}</DialogDescription
      ><img
        v-if="isImage(previewMedia)"
        :src="previewUrl"
        :alt="previewMedia.name"
        class="max-h-[70vh] w-full rounded object-contain" />
      <div v-else-if="isVideo(previewMedia)" class="space-y-3">
        <div v-if="videoSources.length > 1" class="flex flex-wrap gap-2">
          <Button
            v-for="source in videoSources"
            :key="source.id"
            type="button"
            size="sm"
            :variant="
              source.id === activeVideoSource?.id ? 'primary' : 'outline'
            "
            @click="selectedVariantId = source.id"
            >{{ source.label }}</Button
          >
        </div>
        <video
          ref="previewVideoEl"
          controls
          playsinline
          preload="metadata"
          class="w-full rounded bg-black"
        >
          <source
            :key="activeVideoSource?.id ?? previewMedia.id"
            :src="previewUrl"
            :type="activeVideoSource?.mime ?? previewMedia.mime"
          />
        </video>
      </div>
      <iframe
        v-else-if="isPdf(previewMedia)"
        :src="previewUrl"
        :title="previewMedia.name"
        class="h-[70vh] w-full rounded border" /><a
        :href="previewUrl"
        class="inline-flex w-fit items-center gap-1 text-sm text-primary hover:underline"
        download
        >{{ t("common.download") }}
        <Icon name="lucide:download" size="14px" /></a></DialogContent
  ></Dialog>
  <Dialog
    :open="Boolean(confirmDeleteMedia)"
    @update:open="
      (open) => {
        if (!open) confirmDeleteMedia = null;
      }
    "
    ><DialogContent v-if="confirmDeleteMedia" class="sm:max-w-md"
      ><DialogTitle>{{ t("media.deleteTitle") }}</DialogTitle
      ><DialogDescription>{{ confirmDeleteMedia.name }}</DialogDescription>
      <div class="flex justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          :disabled="isDeletingMedia"
          @click="confirmDeleteMedia = null"
          >{{ t("common.cancel") }}</Button
        ><Button
          type="button"
          variant="destructive"
          :disabled="isDeletingMedia"
          @click="handleDelete"
          >{{ t("common.delete") }}</Button
        >
      </div></DialogContent
    ></Dialog
  >
</template>
