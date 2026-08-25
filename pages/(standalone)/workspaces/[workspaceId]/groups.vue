<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { toast } from "vue-sonner";

import authenticatedPageProtectMiddleware from "~/middleware/page-protect/authenticatedPage";
import type { WorkspaceGroup, WorkspaceMembersResponse } from "~/lib/types";

definePageMeta({
  layout: "dashboard",
  middleware: [authenticatedPageProtectMiddleware],
});

useHead({ title: "Groups" });

type GroupsResponse = { groups: WorkspaceGroup[] };
type GroupPayload = {
  name: string;
  description: string | null;
  color: string | null;
  member_ids: string[];
};

const route = useRoute();
const queryClient = useQueryClient();
const requestFetch = useRequestFetch();
const { t } = useAppI18n();

const workspaceId = computed(() => String(route.params["workspaceId"] ?? ""));
const editingGroupId = ref<string | null>(null);
const formOpen = ref(false);
const form = reactive({
  name: "",
  description: "",
  color: "#2563eb",
  member_ids: [] as string[],
});

const groupsQueryKey = computed(() => ["workspace-groups", workspaceId.value]);
const membersQueryKey = computed(() => [
  "workspace-members",
  workspaceId.value,
]);

const { data: groupsData, isFetching: isFetchingGroups } =
  useQuery<GroupsResponse>({
    queryKey: groupsQueryKey,
    queryFn: () => requestFetch(`/api/workspaces/${workspaceId.value}/groups`),
    enabled: computed(() => Boolean(workspaceId.value)),
  });

const { data: membersData, isFetching: isFetchingMembers } =
  useQuery<WorkspaceMembersResponse>({
    queryKey: membersQueryKey,
    queryFn: () => requestFetch(`/api/workspaces/${workspaceId.value}/members`),
    enabled: computed(() => Boolean(workspaceId.value)),
  });

const groups = computed(() => groupsData.value?.groups ?? []);
const members = computed(() => membersData.value?.members ?? []);
const canManage = computed(() => Boolean(membersData.value?.is_admin));
const currentUserId = computed(() => membersData.value?.current_user_id ?? "");

const memberName = (member: { name: string | null; email: string }) =>
  member.name?.trim() || member.email;

const resetForm = () => {
  editingGroupId.value = null;
  form.name = "";
  form.description = "";
  form.color = "#2563eb";
  form.member_ids = [];
};

const startCreate = () => {
  resetForm();
  formOpen.value = true;
};

const startEdit = (group: WorkspaceGroup) => {
  editingGroupId.value = group.$id;
  form.name = group.name;
  form.description = group.description ?? "";
  form.color = group.color ?? "#2563eb";
  form.member_ids = group.members.map((member) => member.$id);
  formOpen.value = true;
};

const cancelForm = () => {
  formOpen.value = false;
  resetForm();
};

const toggleMember = (userId: string) => {
  form.member_ids = form.member_ids.includes(userId)
    ? form.member_ids.filter((id) => id !== userId)
    : [...form.member_ids, userId];
};

const payload = (): GroupPayload => ({
  name: form.name.trim(),
  description: form.description.trim() || null,
  color: form.color || null,
  member_ids: form.member_ids,
});

const refreshGroups = async () => {
  await queryClient.invalidateQueries({ queryKey: groupsQueryKey.value });
  queryClient.invalidateQueries({ queryKey: ["inbox", workspaceId.value] });
  queryClient.invalidateQueries({ queryKey: ["tasks"] });
};

const { mutateAsync: saveGroup, isPending: isSaving } = useMutation({
  mutationFn: async () => {
    const groupId = editingGroupId.value;
    return groupId
      ? await $fetch(`/api/workspaces/${workspaceId.value}/groups/${groupId}`, {
          method: "PATCH",
          body: payload(),
        })
      : await $fetch(`/api/workspaces/${workspaceId.value}/groups`, {
          method: "POST",
          body: payload(),
        });
  },
});

const submit = async () => {
  if (!form.name.trim()) return;
  const wasEditing = Boolean(editingGroupId.value);
  try {
    await saveGroup();
    await refreshGroups();
    cancelForm();
    toast.success(t(wasEditing ? "groups.updated" : "groups.created"));
  } catch {
    toast.error(t(wasEditing ? "groups.updateFailed" : "groups.createFailed"));
  }
};

const { mutateAsync: removeGroup, isPending: isDeleting } = useMutation({
  mutationFn: (groupId: string) =>
    $fetch(`/api/workspaces/${workspaceId.value}/groups/${groupId}`, {
      method: "DELETE",
    }),
});

const deleteGroup = async (group: WorkspaceGroup) => {
  if (!window.confirm(t("groups.deleteConfirm", { name: group.name }))) return;
  try {
    await removeGroup(group.$id);
    await refreshGroups();
    toast.success(t("groups.deleted"));
  } catch {
    toast.error(t("groups.deleteFailed"));
  }
};

const canOpenChat = (group: WorkspaceGroup) =>
  Boolean(
    group.conversation_id &&
      group.members.some((member) => member.$id === currentUserId.value),
  );
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-xl font-semibold">{{ t("groups.title") }}</h2>
        <p class="text-sm text-muted-foreground">
          {{ t("groups.description") }}
        </p>
      </div>
      <Button v-if="canManage && !formOpen" @click="startCreate">
        <Icon name="heroicons:plus" class="mr-1 size-4" />
        {{ t("groups.create") }}
      </Button>
    </div>

    <Card v-if="canManage && formOpen" class="border">
      <CardHeader>
        <CardTitle class="text-lg">
          {{ t(editingGroupId ? "groups.edit" : "groups.create") }}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" @submit.prevent="submit">
          <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_110px]">
            <div class="space-y-2">
              <Label for="group-name">{{ t("groups.name") }}</Label>
              <Input
                id="group-name"
                v-model="form.name"
                maxlength="80"
                required
              />
            </div>
            <div class="space-y-2">
              <Label for="group-color">{{ t("groups.color") }}</Label>
              <input
                id="group-color"
                v-model="form.color"
                type="color"
                class="h-10 w-full cursor-pointer rounded-md border bg-background p-1"
              />
            </div>
          </div>

          <div class="space-y-2">
            <Label for="group-description">{{
              t("groups.descriptionLabel")
            }}</Label>
            <Textarea
              id="group-description"
              v-model="form.description"
              maxlength="1000"
              rows="3"
            />
          </div>

          <div class="space-y-2">
            <Label>{{ t("groups.members") }}</Label>
            <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <label
                v-for="member in members"
                :key="member.$id"
                class="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 hover:border-primary"
              >
                <input
                  type="checkbox"
                  :checked="form.member_ids.includes(member.$id)"
                  class="size-4 accent-primary"
                  @change="toggleMember(member.$id)"
                />
                <WorkspaceMemberAvatar
                  :name="memberName(member)"
                  class="size-7"
                  fallback-class="text-xs"
                />
                <span class="min-w-0 truncate text-sm font-medium">{{
                  memberName(member)
                }}</span>
              </label>
            </div>
          </div>

          <div class="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              :disabled="isSaving"
              @click="cancelForm"
            >
              {{ t("common.cancel") }}
            </Button>
            <Button type="submit" :disabled="isSaving || !form.name.trim()">
              <Icon
                v-if="isSaving"
                name="svg-spinners:8-dots-rotate"
                class="mr-1 size-4"
              />
              {{ t("common.save") }}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>

    <Loader v-if="isFetchingGroups || isFetchingMembers" class="h-48" />

    <div
      v-else-if="!groups.length"
      class="rounded-xl border border-dashed py-14 text-center text-sm text-muted-foreground"
    >
      {{ t("groups.noGroups") }}
    </div>

    <div v-else class="grid gap-4 xl:grid-cols-2">
      <Card v-for="group in groups" :key="group.$id" class="border">
        <CardHeader class="pb-3">
          <div class="flex items-start justify-between gap-3">
            <div class="flex min-w-0 items-center gap-3">
              <WorkspaceGroupAvatar
                :name="group.name"
                :color="group.color"
                class="size-10"
              />
              <div class="min-w-0">
                <CardTitle class="truncate text-lg">{{ group.name }}</CardTitle>
                <CardDescription>
                  {{ t("groups.memberCount", { count: group.members.length }) }}
                </CardDescription>
              </div>
            </div>
            <div v-if="canManage" class="flex shrink-0 gap-1">
              <Button
                variant="ghost"
                size="icon"
                :title="t('common.edit')"
                @click="startEdit(group)"
              >
                <Icon name="heroicons:pencil-square" class="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                :title="t('common.delete')"
                :disabled="isDeleting"
                @click="deleteGroup(group)"
              >
                <Icon name="heroicons:trash" class="size-4 text-destructive" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent class="space-y-4">
          <p
            v-if="group.description"
            class="text-sm whitespace-pre-wrap text-muted-foreground"
          >
            {{ group.description }}
          </p>

          <div v-if="group.members.length" class="flex flex-wrap gap-2">
            <span
              v-for="member in group.members"
              :key="member.$id"
              class="inline-flex min-w-0 items-center gap-2 rounded-full border bg-muted/40 py-1 pr-2 pl-1 text-xs"
            >
              <WorkspaceMemberAvatar
                :name="memberName(member)"
                class="size-6"
                fallback-class="text-[10px]"
              />
              <span class="max-w-40 truncate">{{ memberName(member) }}</span>
            </span>
          </div>
          <p v-else class="text-sm text-muted-foreground">
            {{ t("groups.noMembers") }}
          </p>

          <Button
            v-if="canOpenChat(group)"
            as-child
            variant="secondary"
            size="sm"
          >
            <NuxtLink
              :href="`/workspaces/${workspaceId}/messages/${group.conversation_id}`"
            >
              <Icon
                name="heroicons:chat-bubble-left-right"
                class="mr-1 size-4"
              />
              {{ t("groups.openChat") }}
            </NuxtLink>
          </Button>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
