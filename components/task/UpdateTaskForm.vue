<script setup lang="ts">
import { useMutation } from "@tanstack/vue-query";
import { configure, useForm } from "vee-validate";
import { toTypedSchema } from "@vee-validate/zod";
import { toast } from "vue-sonner";

import { CreateTasksSchema } from "~/lib/schema/createTask";
import {
  taskPriorityTranslationKeys,
  taskStatusTranslationKeys,
} from "~/lib/i18n";
import {
  TASK_MEDIA_ACCEPT,
  deleteTaskMedia,
  uploadTaskMedia,
  type PendingMedia,
} from "~/lib/task-media-client";
import {
  buildUpdateTaskInitialValues,
  UNASSIGNED_TASK_ASSIGNEE,
} from "~/lib/task-update-form";
import {
  TaskPriority,
  TaskStatus,
  taskPriorityLabels,
  type FilteredTask,
  type UpdateTaskInject,
} from "~/lib/types";
import {
  groupAssigneeValue,
  parseTaskAssigneeValue,
  userAssigneeValue,
} from "~/lib/task-assignee";

const { initialValues, projectOptions, memberOptions, groupOptions, onCancel } =
  defineProps<{
    initialValues: FilteredTask;
    projectOptions: { $id: string; name: string; image_url?: string }[];
    memberOptions: { $id: string; name: string }[];
    groupOptions: { $id: string; name: string; color?: string | null }[];
    onCancel?: () => void;
  }>();

const onUpdateTask: UpdateTaskInject | undefined = inject("update-task-inject");
const UNASSIGNED_VALUE = UNASSIGNED_TASK_ASSIGNEE;
const { t } = useAppI18n();

const existingMedia = ref([...initialValues.media]);
const uploadedMedia = ref<PendingMedia[]>([]);
const isUploadingMedia = ref(false);
const mediaUploadProgress = ref(0);
const mediaUploadError = ref<string | null>(null);
const mediaInput = ref<HTMLInputElement | null>(null);

configure({
  validateOnBlur: false,
});

const form = useForm({
  validationSchema: toTypedSchema(
    CreateTasksSchema.omit({ workspace_id: true, media_ids: true }),
  ),
  initialValues: buildUpdateTaskInitialValues(initialValues),
});

const statuses = Object.entries(TaskStatus);
const priorities = Object.entries(taskPriorityLabels) as [
  TaskPriority,
  string,
][];

const handleMediaChange = async (event: Event) => {
  const target = event.target as HTMLInputElement | null;
  const files = target?.files;
  if (!files?.length) return;

  isUploadingMedia.value = true;
  mediaUploadProgress.value = 0;
  mediaUploadError.value = null;

  const uploadFiles = Array.from(files);

  try {
    const res = await uploadTaskMedia(
      initialValues.workspace_id,
      uploadFiles,
      (value) => {
        mediaUploadProgress.value = value;
      },
    );
    uploadedMedia.value.push(...res.files);
  } catch (error) {
    mediaUploadError.value = "Failed to upload media";
  } finally {
    mediaUploadProgress.value = 0;
    isUploadingMedia.value = false;
    if (target) target.value = "";
  }
};

const removeUploadedMedia = async (index: number) => {
  const removed = uploadedMedia.value.splice(index, 1)[0];
  if (!removed) return;

  try {
    await deleteTaskMedia(removed.id);
  } catch (error) {
    toast.error(t("media.deleteFailed"));
  }
};

const removeExistingMedia = async (index: number) => {
  const removed = existingMedia.value[index];
  if (!removed) return;

  try {
    await $fetch("/api/tasks/media", {
      method: "DELETE",
      body: {
        media_id: removed.id,
      },
    });
    existingMedia.value.splice(index, 1);
  } catch (error) {
    toast.error(t("media.deleteFailed"));
  }
};

const { isPending, mutate } = useMutation({
  mutationFn: async (formData: typeof form.values) => {
    const res = await $fetch(`/api/tasks/${initialValues.$id}`, {
      method: "PATCH",
      body: formData,
    });
    const { task } = (res ?? { task: null }) as unknown as {
      task: FilteredTask | null;
    };
    if (task) {
      // run all subscribers
      await Promise.all(
        (onUpdateTask?.updateTaskSuccessSubsribers ?? []).map((onUpdate) =>
          onUpdate?.(task),
        ),
      );

      // close form
      onCancel?.();
      toast.success(t("task.updated"));
    } else toast.error(t("task.updateFailed"));
  },
  onError: () => toast.error(t("task.updateFailed")),
});

const handleSubmit = form.handleSubmit((values) => {
  const assignment = parseTaskAssigneeValue(values.assignee_id);
  const payload = {
    ...values,
    ...assignment,
    due_date: values.due_date ?? null,
    started_at: values.started_at ?? undefined,
    media_ids: uploadedMedia.value.map((file) => file.id),
  };

  mutate(payload as typeof form.values);
});
</script>

<template>
  <Card class="size-full gap-0 border-none p-0 shadow-none">
    <CardHeader class="flex py-7">
      <CardTitle class="text-xl font-bold">
        {{ t("task.updateTitle") }}
      </CardTitle>
    </CardHeader>
    <div class="px-7">
      <DottedSeparator />
    </div>
    <CardContent class="py-7">
      <form @submit="handleSubmit">
        <fieldset :disabled="isPending">
          <div class="flex flex-col gap-y-4">
            <FormField v-slot="{ componentField }" name="name">
              <FormItem>
                <FormLabel>{{ t("task.name") }}</FormLabel>
                <FormControl>
                  <Input
                    :placeholder="t('task.namePlaceholder')"
                    v-bind="componentField"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            </FormField>
            <FormField v-slot="{ componentField }" name="due_date">
              <FormItem>
                <FormLabel>{{ t("task.dueDate") }}</FormLabel>
                <FormControl>
                  <DatePicker
                    :value="componentField.modelValue"
                    :on-change="componentField.onChange"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            </FormField>
            <FormField v-slot="{ componentField }" name="started_at">
              <FormItem>
                <FormLabel>{{ t("task.started") }}</FormLabel>
                <FormControl>
                  <DatePicker
                    :value="componentField.modelValue"
                    :on-change="componentField.onChange"
                    :placeholder="t('task.startDatePlaceholder')"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            </FormField>
            <FormField v-slot="{ componentField }" name="description">
              <FormItem>
                <FormLabel>{{ t("common.description") }}</FormLabel>
                <FormControl>
                  <Textarea
                    :placeholder="t('task.descriptionPlaceholder')"
                    v-bind="componentField"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            </FormField>
            <FormField v-slot="{ componentField }" name="assignee_id">
              <FormItem>
                <FormLabel>{{ t("common.assignee") }}</FormLabel>
                <Select
                  :default-value="componentField.modelValue"
                  :disabled="Boolean(initialValues.parent_id)"
                  @update:model-value="componentField.onChange"
                >
                  <FormControl>
                    <SelectTrigger class="w-full">
                      <SelectValue
                        :placeholder="t('task.selectAssignee')"
                      ></SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <FormMessage />
                  <SelectContent>
                    <SelectItem :value="UNASSIGNED_VALUE">
                      {{ t("common.unassigned") }}
                    </SelectItem>
                    <SelectSeparator />
                    <SelectItem
                      v-for="group of groupOptions"
                      :key="`group-${group.$id}`"
                      :value="groupAssigneeValue(group.$id)"
                    >
                      <WorkspaceGroupAvatar
                        :name="group.name"
                        :color="group.color"
                        class="size-6"
                      />
                      {{ group.name }}
                    </SelectItem>
                    <SelectSeparator v-if="groupOptions.length" />
                    <SelectItem
                      v-for="assignee of memberOptions"
                      :key="assignee.$id"
                      :value="userAssigneeValue(assignee.$id)"
                    >
                      <WorkspaceMemberAvatar
                        :name="assignee.name"
                        class="size-6"
                      />
                      {{ assignee.name }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            </FormField>
            <FormField v-slot="{ componentField }" name="status">
              <FormItem>
                <FormLabel>{{ t("common.status") }}</FormLabel>
                <Select
                  :default-value="componentField.modelValue"
                  @update:model-value="componentField.onChange"
                >
                  <FormControl>
                    <SelectTrigger class="w-full">
                      <SelectValue
                        :placeholder="t('task.selectStatus')"
                      ></SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <FormMessage />
                  <SelectContent>
                    <SelectItem
                      v-for="[label, val] of statuses"
                      :key="val"
                      :value="val"
                    >
                      {{ t(taskStatusTranslationKeys[val]) }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            </FormField>
            <div class="space-y-2">
              <div class="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                <p class="text-sm font-medium text-muted-foreground">
                  {{ t("common.media") }}
                </p>
                <div
                  class="flex items-center justify-start gap-2 sm:justify-end"
                >
                  <input
                    ref="mediaInput"
                    type="file"
                    multiple
                    :accept="TASK_MEDIA_ACCEPT"
                    class="hidden"
                    @change="handleMediaChange"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    class="tracking-wide uppercase"
                    @click="mediaInput?.click()"
                    :disabled="isUploadingMedia"
                  >
                    <Icon
                      v-if="isUploadingMedia"
                      name="svg-spinners:3-dots-rotating"
                      size="16px"
                      class="size-4"
                    />
                    <span v-else>{{ t("common.uploadFiles") }}</span>
                  </Button>
                </div>
              </div>
              <div v-if="mediaUploadError" class="text-xs text-destructive">
                {{ mediaUploadError }}
              </div>
              <div v-if="isUploadingMedia" class="space-y-1">
                <div class="h-1 w-full overflow-hidden rounded bg-muted">
                  <div
                    class="h-full bg-primary transition-[width] duration-150"
                    :style="{ width: `${mediaUploadProgress}%` }"
                  ></div>
                </div>
                <p class="text-[11px] font-medium text-muted-foreground">
                  Uploading... {{ mediaUploadProgress }}%
                </p>
              </div>
              <ul v-if="existingMedia.length" class="grid gap-2 sm:grid-cols-2">
                <li
                  v-for="(file, index) of existingMedia"
                  :key="file.id"
                  class="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm text-muted-foreground"
                >
                  <span class="truncate">{{ file.name }}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    @click="removeExistingMedia(index)"
                  >
                    <Icon name="lucide:trash-2" size="16px" />
                  </Button>
                </li>
              </ul>
              <ul v-if="uploadedMedia.length" class="grid gap-2 sm:grid-cols-2">
                <li
                  v-for="(file, index) of uploadedMedia"
                  :key="file.id"
                  class="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm text-muted-foreground"
                >
                  <span class="truncate">{{ file.name }}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    @click="removeUploadedMedia(index)"
                  >
                    <Icon name="lucide:trash-2" size="16px" />
                  </Button>
                </li>
              </ul>
            </div>
            <FormField v-slot="{ componentField }" name="priority">
              <FormItem>
                <FormLabel>{{ t("common.priority") }}</FormLabel>
                <Select
                  :default-value="componentField.modelValue"
                  @update:model-value="componentField.onChange"
                >
                  <FormControl>
                    <SelectTrigger class="w-full">
                      <SelectValue
                        :placeholder="t('task.selectPriority')"
                      ></SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <FormMessage />
                  <SelectContent>
                    <SelectItem
                      v-for="[value, label] of priorities"
                      :key="value"
                      :value="value"
                    >
                      {{ t(taskPriorityTranslationKeys[value]) }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            </FormField>
            <FormField v-slot="{ componentField }" name="project_id">
              <FormItem>
                <FormLabel>{{ t("common.project") }}</FormLabel>
                <Select
                  :default-value="componentField.modelValue"
                  @update:model-value="componentField.onChange"
                >
                  <FormControl>
                    <SelectTrigger class="w-full">
                      <SelectValue
                        :placeholder="t('task.selectProject')"
                      ></SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <FormMessage />
                  <SelectContent>
                    <SelectItem
                      v-for="project of projectOptions"
                      :key="project.$id"
                      :value="project.$id"
                    >
                      <ProjectAvatar
                        :name="project.name"
                        :image="project.image_url"
                        class="size-6"
                      />
                      {{ project.name }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            </FormField>
          </div>
          <DottedSeparator class="py-7" />
          <div class="flex items-center justify-between gap-4">
            <Button
              v-if="!!onCancel"
              type="button"
              variant="secondary"
              size="lg"
              @click="onCancel"
            >
              {{ t("common.cancel") }}
            </Button>
            <Button type="submit" variant="primary" size="lg" class="ml-auto">
              <Icon
                v-if="isPending"
                name="svg-spinners:8-dots-rotate"
                size="16px"
                class="size-4"
              />
              <span v-else>{{ t("common.save") }}</span>
            </Button>
          </div>
        </fieldset>
      </form>
    </CardContent>
  </Card>
</template>
