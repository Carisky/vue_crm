<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';

import authenticatedPageProtectMiddleware from '~/middleware/page-protect/authenticatedPage';

definePageMeta({
  layout: 'dashboard',
  middleware: [authenticatedPageProtectMiddleware],
});

type DocSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  sectionId: string | null;
  isLocked: boolean;
};

type Section = {
  id: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
  docs?: DocSummary[];
};

type Doc = {
  id: string;
  projectId: string;
  workspaceId: string;
  title: string;
  body: string;
  isLocked: boolean;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string | null; email: string };
};

type DocWriteResponse = {
  id: string;
  title: string;
  body: string;
  isLocked: boolean;
  createdAt: string;
  updatedAt: string;
};

type WorkspaceProject = {
  $id: string;
  name: string;
  workspace_id: string;
};

const route = useRoute();
const queryClient = useQueryClient();

const workspaceId = computed(() => String(route.params['workspaceId'] ?? ''));
const projectId = computed(() => String(route.params['projectId'] ?? ''));

// Avoid TS/Volar excessive recursion on typed Nitro route strings for $fetch.
const apiFetch = $fetch as unknown as (<T>(url: string, options?: any) => Promise<T>);
const { locale, t } = useAppI18n();

useHead({
  title: 'Documentation',
});

const formatTimestamp = (value: string) =>
  new Date(value).toLocaleString(locale.value, { dateStyle: 'medium', timeStyle: 'short' });

const docsKey = computed(() => ['project-docs', projectId.value]);
const sectionsKey = computed(() => ['project-doc-sections', projectId.value]);

const { data: docsData, isFetching: isFetchingDocs } = useQuery<{
  sections: { id: string; title: string; docs: DocSummary[] }[];
  unsectioned: DocSummary[];
}>({
  queryKey: docsKey,
  queryFn: async () =>
    await apiFetch(`/api/projects/${projectId.value}/docs`),
  enabled: computed(() => Boolean(projectId.value)),
});

const { data: sectionsOnly } = useQuery<Section[]>({
  queryKey: sectionsKey,
  queryFn: async () => {
    const res = await apiFetch<{ sections: Section[] }>(
      `/api/projects/${projectId.value}/doc-sections`,
    );
    return res.sections ?? [];
  },
  enabled: computed(() => Boolean(projectId.value)),
});

const sections = computed<Section[]>(() => docsData.value?.sections ?? []);
const unsectioned = computed(() => docsData.value?.unsectioned ?? []);

// Create/Edit doc modal
const isDocOpen = ref(false);
const activeDocId = ref<string | null>(null);
const activeSectionId = ref<string | null>(null);
const draftTitle = ref('');
const draftBody = ref('');

const docKey = computed(() => ['project-doc', projectId.value, activeDocId.value ?? 'new']);
const { data: activeDoc, isFetching: isFetchingDoc } = useQuery<Doc | null>({
  queryKey: docKey,
  queryFn: async () => {
    if (!activeDocId.value) return null;
    const res = await apiFetch<{ doc: Doc }>(
      `/api/projects/${projectId.value}/docs/${activeDocId.value}`,
    );
    return res.doc;
  },
  enabled: computed(() => Boolean(activeDocId.value)),
});

const isLocked = computed(() => activeDoc.value?.isLocked === true);

watch(
  activeDoc,
  (doc) => {
    if (!doc) return;
    draftTitle.value = doc.title ?? '';
    draftBody.value = doc.body ?? '';
  },
  { immediate: true },
);

const openNewDoc = (sectionId: string | null) => {
  activeDocId.value = null;
  activeSectionId.value = sectionId;
  draftTitle.value = '';
  draftBody.value = '';
  isDocOpen.value = true;
};

const openDoc = (docId: string, sectionId: string | null) => {
  activeDocId.value = docId;
  activeSectionId.value = sectionId;
  isDocOpen.value = true;
};

const setActiveSection = (value: unknown) => {
  if (value === '__none__') {
    activeSectionId.value = null;
    return;
  }
  activeSectionId.value = value ? String(value) : null;
};


const { mutateAsync: createDoc, isPending: isCreatingDoc } = useMutation({
  mutationFn: async () => {
    const res = await apiFetch<{ doc: DocWriteResponse }>(`/api/projects/${projectId.value}/docs`, {
      method: 'POST',
      body: {
        title: draftTitle.value,
        body: draftBody.value,
        section_id: activeSectionId.value ?? undefined,
      },
    });
    return res.doc;
  },
  onSuccess: async (doc) => {
    await queryClient.invalidateQueries({ queryKey: docsKey.value });
    activeDocId.value = doc.id;
    toast.success(t('common.save'));
  },
  onError: () => toast.error(t('docs.saveFailed')),
});

const { mutateAsync: updateDoc, isPending: isUpdatingDoc } = useMutation({
  mutationFn: async () => {
    if (!activeDocId.value) throw new Error('No doc');
    const res = await apiFetch<{ doc: DocWriteResponse }>(
      `/api/projects/${projectId.value}/docs/${activeDocId.value}`,
      {
        method: 'PATCH',
        body: {
          title: draftTitle.value,
          body: draftBody.value,
          section_id: activeSectionId.value,
        },
      },
    );
    return res.doc;
  },
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: docsKey.value });
    await queryClient.invalidateQueries({ queryKey: docKey.value });
    toast.success(t('common.save'));
  },
  onError: () => toast.error(t('docs.saveFailed')),
});

const isSavingDoc = computed(() => isCreatingDoc.value || isUpdatingDoc.value);
const saveDoc = async () => {
  if (isLocked.value) return;
  if (!draftTitle.value.trim() || !draftBody.value.trim()) return;
  if (!activeDocId.value) await createDoc();
  else await updateDoc();
};

const { mutateAsync: setDocLock, isPending: isTogglingLock } = useMutation({
  mutationFn: async (locked: boolean) => {
    if (!activeDocId.value) throw new Error('No doc');
    const res = await apiFetch<{ doc: Pick<Doc, 'id' | 'isLocked' | 'updatedAt'> }>(
      `/api/projects/${projectId.value}/docs/${activeDocId.value}`,
      {
        method: 'PATCH',
        body: { is_locked: locked },
      },
    );
    return res.doc;
  },
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: docsKey.value });
    await queryClient.invalidateQueries({ queryKey: docKey.value });
  },
  onError: () => toast.error(t('docs.toggleLockFailed')),
});

type BodySegment =
  | { type: 'text'; value: string }
  | { type: 'link'; href: string; label: string };

const linkifiedBody = computed<BodySegment[]>(() => {
  const value = draftBody.value ?? '';
  if (!value) return [{ type: 'text', value: '' }];

  const out: BodySegment[] = [];
  const regex = /(https?:\/\/[^\s<>"')\]]+)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(value))) {
    if (match.index > last) {
      out.push({ type: 'text', value: value.slice(last, match.index) });
    }
    const url = match[0];
    out.push({ type: 'link', href: url, label: url });
    last = regex.lastIndex;
  }
  if (last < value.length) {
    out.push({ type: 'text', value: value.slice(last) });
  }
  return out;
});

// Sections: create/rename
const isSectionOpen = ref(false);
const activeSectionEditId = ref<string | null>(null);
const sectionTitle = ref('');

const openNewSection = () => {
  activeSectionEditId.value = null;
  sectionTitle.value = '';
  isSectionOpen.value = true;
};
const openRenameSection = (section: Section) => {
  activeSectionEditId.value = section.id;
  sectionTitle.value = section.title ?? '';
  isSectionOpen.value = true;
};

const { mutateAsync: createSection, isPending: isCreatingSection } = useMutation({
  mutationFn: async () => {
    const res = await apiFetch<{ section: Section }>(
      `/api/projects/${projectId.value}/doc-sections`,
      { method: 'POST', body: { title: sectionTitle.value } },
    );
    return res.section;
  },
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: docsKey.value });
    await queryClient.invalidateQueries({ queryKey: sectionsKey.value });
    isSectionOpen.value = false;
    toast.success(t('docs.newChapter'));
  },
  onError: () => toast.error(t('docs.createSectionFailed')),
});

const { mutateAsync: renameSection, isPending: isRenamingSection } = useMutation({
  mutationFn: async () => {
    if (!activeSectionEditId.value) throw new Error('No section');
    const res = await apiFetch<{ section: Section }>(
      `/api/projects/${projectId.value}/doc-sections/${activeSectionEditId.value}`,
      { method: 'PATCH', body: { title: sectionTitle.value } },
    );
    return res.section;
  },
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: docsKey.value });
    await queryClient.invalidateQueries({ queryKey: sectionsKey.value });
    isSectionOpen.value = false;
    toast.success(t('common.save'));
  },
  onError: () => toast.error(t('docs.renameSectionFailed')),
});

const isSavingSection = computed(() => isCreatingSection.value || isRenamingSection.value);
const saveSection = async () => {
  if (!sectionTitle.value.trim()) return;
  if (!activeSectionEditId.value) await createSection();
  else await renameSection();
};

// Import
const isImportOpen = ref(false);
const sourceProjectId = ref<string | null>(null);
const sourceSectionId = ref<string | null>(null);
const sourceDocId = ref<string | null>(null);
const targetSectionId = ref<string | null>(null);
const importMode = ref<'section' | 'doc'>('section');

const { data: projects } = useQuery<WorkspaceProject[]>({
  queryKey: computed(() => ['workspace-projects', workspaceId.value]),
  queryFn: async () => {
    const res = await apiFetch<{ projects: WorkspaceProject[] }>(
      `/api/workspaces/${workspaceId.value}/projects`,
    );
    return res.projects ?? [];
  },
  enabled: computed(() => Boolean(workspaceId.value)),
});

const { data: sourceSections } = useQuery<Section[]>({
  queryKey: computed(() => ['project-doc-sections', sourceProjectId.value ?? '']),
  queryFn: async () => {
    if (!sourceProjectId.value) return [];
    const res = await apiFetch<{ sections: Section[] }>(
      `/api/projects/${sourceProjectId.value}/doc-sections`,
    );
    return res.sections ?? [];
  },
  enabled: computed(() => Boolean(sourceProjectId.value)),
});

const { data: sourceDocs } = useQuery<{ sections: Section[]; unsectioned: DocSummary[] } | null>({
  queryKey: computed(() => ['project-docs', sourceProjectId.value ?? '']),
  queryFn: async () => {
    if (!sourceProjectId.value) return null;
    return await apiFetch(`/api/projects/${sourceProjectId.value}/docs`);
  },
  enabled: computed(() => Boolean(sourceProjectId.value)),
});

watch([sourceProjectId, importMode], () => {
  sourceSectionId.value = null;
  sourceDocId.value = null;
});

const { mutateAsync: importNow, isPending: isImporting } = useMutation({
  mutationFn: async () => {
    const payload: Record<string, unknown> = {
      source_project_id: sourceProjectId.value,
      ...(targetSectionId.value ? { target_section_id: targetSectionId.value } : {}),
    };

    if (!sourceProjectId.value) throw new Error('No source');

    if (importMode.value === 'section') {
      if (!sourceSectionId.value) throw new Error('No section');
      payload.source_section_id = sourceSectionId.value;
    } else {
      if (!sourceDocId.value) throw new Error('No doc');
      payload.source_doc_id = sourceDocId.value;
      payload.target_section_id = targetSectionId.value ?? null;
    }

    return await apiFetch(`/api/projects/${projectId.value}/docs/import`, {
      method: 'POST',
      body: payload,
    });
  },
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: docsKey.value });
    await queryClient.invalidateQueries({ queryKey: sectionsKey.value });
    isImportOpen.value = false;
    toast.success(t('common.import'));
  },
  onError: () => toast.error(t('docs.importFailed')),
});

watch(importMode, (mode) => {
  if (mode === 'section') targetSectionId.value = null;
});
</script>

<template>
  <div class="flex items-start justify-between gap-3">
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold">{{ t('header.docs') }}</h1>
      <NuxtLink
        :href="`/workspaces/${workspaceId}/projects/${projectId}`"
        class="text-sm text-muted-foreground hover:underline"
      >
        {{ t('docs.backToProject') }}
      </NuxtLink>
    </div>
    <div class="flex items-center gap-2">
      <Button variant="secondary" size="sm" @click="isImportOpen = true">
        <Icon name="lucide:arrow-left-right" size="16px" class="size-4 mr-1" />
        {{ t('common.import') }}
      </Button>
      <Button variant="secondary" size="sm" @click="openNewSection">
        <Icon name="lucide:folder-plus" size="16px" class="size-4 mr-1" />
        {{ t('docs.chapter') }}
      </Button>
    </div>
  </div>

  <DottedSeparator class="my-6" />

  <div v-if="isFetchingDocs" class="py-10">
    <Loader class="h-24" />
  </div>

  <div v-else class="space-y-6">
    <Card v-if="unsectioned.length" class="border">
      <CardHeader class="py-4">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <CardTitle class="text-base truncate">{{ t('docs.noChapter') }}</CardTitle>
            <CardDescription>{{ t('docs.noTitle') }}</CardDescription>
          </div>
          <Button size="sm" @click="openNewDoc(null)">
            <Icon name="lucide:plus" size="16px" class="size-4 mr-1" />
            {{ t('docs.add') }}
          </Button>
        </div>
      </CardHeader>
      <CardContent class="pt-0">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <button
            v-for="doc in unsectioned"
            :key="doc.id"
            type="button"
            class="rounded-xl border border-border/70 bg-background/90 px-4 py-3 text-left transition hover:border-primary"
            @click="openDoc(doc.id, null)"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="text-sm font-semibold truncate">{{ doc.title }}</p>
              <Icon
                v-if="doc.isLocked"
                name="lucide:lock"
                size="16px"
                class="size-4 text-muted-foreground shrink-0"
              />
            </div>
            <p class="mt-1 text-[11px] text-muted-foreground">
              {{ t('docs.updated', { date: formatTimestamp(doc.updatedAt) }) }}
            </p>
          </button>
        </div>
      </CardContent>
    </Card>

    <Card v-for="section in sections" :key="section.id" class="border">
      <CardHeader class="py-4">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <CardTitle class="text-base truncate">{{ section.title }}</CardTitle>
            <CardDescription>{{ t('docs.list') }}</CardDescription>
          </div>
          <div class="flex items-center gap-2">
            <Button variant="secondary" size="sm" @click="openRenameSection(section)">
              <Icon name="lucide:pencil" size="16px" class="size-4 mr-1" />
              {{ t('docs.rename') }}
            </Button>
            <Button size="sm" @click="openNewDoc(section.id)">
              <Icon name="lucide:plus" size="16px" class="size-4 mr-1" />
              {{ t('docs.add') }}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent class="pt-0">
        <div v-if="!section.docs?.length" class="text-sm text-muted-foreground py-3">
          {{ t('docs.sectionEmpty') }}
        </div>
        <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <button
            v-for="doc in section.docs"
            :key="doc.id"
            type="button"
            class="rounded-xl border border-border/70 bg-background/90 px-4 py-3 text-left transition hover:border-primary"
            @click="openDoc(doc.id, section.id)"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="text-sm font-semibold truncate">{{ doc.title }}</p>
              <Icon
                v-if="doc.isLocked"
                name="lucide:lock"
                size="16px"
                class="size-4 text-muted-foreground shrink-0"
              />
            </div>
            <p class="mt-1 text-[11px] text-muted-foreground">
              {{ t('docs.updated', { date: formatTimestamp(doc.updatedAt) }) }}
            </p>
          </button>
        </div>
      </CardContent>
    </Card>

    <Card v-if="!sections.length && !unsectioned.length" class="border">
      <CardHeader>
        <CardTitle class="text-lg">{{ t('docs.emptyTitle') }}</CardTitle>
        <CardDescription>{{ t('docs.emptyDescription') }}</CardDescription>
      </CardHeader>
    </Card>
  </div>

  <!-- Doc modal -->
  <Dialog v-model:open="isDocOpen">
    <DialogContent class="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle class="flex items-center justify-between gap-3">
          <span>{{ activeDocId ? t('docs.card') : t('docs.newCard') }}</span>
          <Button
            v-if="activeDocId"
            variant="secondary"
            size="sm"
            :disabled="isTogglingLock"
            @click="setDocLock(!isLocked)"
          >
            <Icon
              :name="isLocked ? 'lucide:unlock' : 'lucide:lock'"
              size="16px"
              class="size-4 mr-1"
            />
            {{ isLocked ? t('docs.unlock') : t('docs.lock') }}
          </Button>
        </DialogTitle>
        <DialogDescription>{{ t('docs.editorDescription') }}</DialogDescription>
      </DialogHeader>

      <div v-if="activeDocId && isFetchingDoc" class="py-10">
        <Loader class="h-24" />
      </div>

      <div v-else class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <p v-if="activeDoc?.updatedAt" class="text-[11px] text-muted-foreground">
            {{ t('docs.updated', { date: formatTimestamp(activeDoc.updatedAt) }) }}
          </p>
          <span
            v-if="isLocked"
            class="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest"
          >
            {{ t('docs.readOnly') }}
          </span>
        </div>

        <div v-if="isLocked" class="rounded-lg border bg-muted/20 p-4 space-y-3">
          <p class="text-base font-semibold">{{ draftTitle }}</p>
          <div class="text-sm whitespace-pre-wrap break-words leading-relaxed">
            <template v-for="(seg, idx) in linkifiedBody" :key="idx">
              <span v-if="seg.type === 'text'">{{ seg.value }}</span>
              <a
                v-else
                :href="seg.href"
                target="_blank"
                rel="noreferrer"
                class="text-primary underline underline-offset-2 hover:opacity-80 break-all"
              >
                {{ seg.label }}
              </a>
            </template>
          </div>
        </div>

        <template v-else>
          <Input v-model="draftTitle" :disabled="isSavingDoc" :placeholder="t('docs.titlePlaceholder')" />
          <Textarea v-model="draftBody" :disabled="isSavingDoc" rows="12" :placeholder="t('docs.infoPlaceholder')" class="break-words" />
        </template>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div class="space-y-1">
            <p class="text-xs text-muted-foreground">{{ t('docs.chapter') }}</p>
            <Select
              :model-value="activeSectionId ?? '__none__'"
              @update:model-value="setActiveSection"
              :disabled="isLocked"
            >
              <SelectTrigger class="w-full">
                <SelectValue :placeholder="t('docs.noChapter')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem :value="'__none__'">{{ t('docs.noChapter') }}</SelectItem>
                <SelectItem v-for="s in (sectionsOnly ?? [])" :key="s.id" :value="s.id">
                  {{ s.title }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="hidden sm:block"></div>
        </div>

        <div class="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" :disabled="isSavingDoc" @click="isDocOpen = false">
            {{ t('docs.close') }}
          </Button>
          <Button
            size="sm"
            :disabled="isLocked || isSavingDoc || !draftTitle.trim() || !draftBody.trim()"
            @click="saveDoc"
          >
            <Icon v-if="isSavingDoc" name="svg-spinners:8-dots-rotate" size="16px" class="size-4" />
            <template v-else>{{ t('common.save') }}</template>
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>

  <!-- Section modal -->
  <Dialog v-model:open="isSectionOpen">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ activeSectionEditId ? t('docs.renameChapter') : t('docs.newChapter') }}</DialogTitle>
        <DialogDescription>{{ t('docs.chapterDescription') }}</DialogDescription>
      </DialogHeader>

      <div class="space-y-3">
        <Input v-model="sectionTitle" :disabled="isSavingSection" :placeholder="t('docs.chapterPlaceholder')" />
        <div class="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" :disabled="isSavingSection" @click="isSectionOpen = false">
            {{ t('docs.close') }}
          </Button>
          <Button size="sm" :disabled="isSavingSection || !sectionTitle.trim()" @click="saveSection">
            <Icon v-if="isSavingSection" name="svg-spinners:8-dots-rotate" size="16px" class="size-4" />
            <template v-else>{{ t('common.save') }}</template>
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>

  <!-- Import modal -->
  <Dialog v-model:open="isImportOpen">
    <DialogContent class="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{{ t('common.import') }}</DialogTitle>
        <DialogDescription>{{ t('docs.importDescription') }}</DialogDescription>
      </DialogHeader>

      <div class="space-y-3">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div class="space-y-1">
            <p class="text-xs text-muted-foreground">{{ t('docs.sourceProject') }}</p>
            <Select
              :model-value="sourceProjectId ?? undefined"
              @update:model-value="(v) => (sourceProjectId = v ? String(v) : null)"
            >
              <SelectTrigger class="w-full">
                <SelectValue :placeholder="t('task.selectProject')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="p in (projects ?? []).filter((p) => p.$id !== projectId)"
                  :key="p.$id"
                  :value="p.$id"
                >
                  {{ p.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-1">
            <p class="text-xs text-muted-foreground">{{ t('docs.mode') }}</p>
            <Select :model-value="importMode" @update:model-value="(v) => (importMode = v as any)">
              <SelectTrigger class="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="section">{{ t('docs.section') }}</SelectItem>
                <SelectItem value="doc">{{ t('docs.doc') }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div v-if="importMode === 'section'" class="space-y-1">
          <p class="text-xs text-muted-foreground">{{ t('docs.sourceSection') }}</p>
          <Select
            :disabled="!sourceProjectId"
            :model-value="sourceSectionId ?? undefined"
            @update:model-value="(v) => (sourceSectionId = v ? String(v) : null)"
          >
            <SelectTrigger class="w-full">
              <SelectValue :placeholder="t('docs.selectSection')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="s in (sourceSections ?? [])" :key="s.id" :value="s.id">
                {{ s.title }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div v-else class="space-y-1">
          <p class="text-xs text-muted-foreground">{{ t('docs.sourceDoc') }}</p>
            <Select
              :disabled="!sourceProjectId"
              :model-value="sourceDocId ?? undefined"
              @update:model-value="(v) => (sourceDocId = v ? String(v) : null)"
            >
            <SelectTrigger class="w-full">
              <SelectValue :placeholder="t('docs.selectDoc')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="d in (sourceDocs?.unsectioned ?? [])"
                :key="`u-${d.id}`"
                :value="d.id"
              >
                {{ d.title }}
              </SelectItem>
              <template v-for="s in (sourceDocs?.sections ?? [])" :key="`sec-${s.id}`">
                <SelectItem v-for="d in (s.docs ?? [])" :key="d.id" :value="d.id">
                  {{ s.title }} / {{ d.title }}
                </SelectItem>
              </template>
            </SelectContent>
          </Select>
        </div>

        <div v-if="importMode === 'doc'" class="space-y-1">
          <p class="text-xs text-muted-foreground">{{ t('docs.targetSection') }}</p>
          <Select
            :model-value="targetSectionId ?? undefined"
            @update:model-value="(v) => (targetSectionId = v ? String(v) : null)"
          >
            <SelectTrigger class="w-full">
              <SelectValue :placeholder="t('docs.noChapter')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="s in (sectionsOnly ?? [])" :key="s.id" :value="s.id">
                {{ s.title }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" :disabled="isImporting" @click="isImportOpen = false">
            {{ t('docs.close') }}
          </Button>
          <Button
            size="sm"
            :disabled="
              isImporting ||
              !sourceProjectId ||
              (importMode === 'section' ? !sourceSectionId : !sourceDocId)
            "
            @click="importNow"
          >
            <Icon v-if="isImporting" name="svg-spinners:8-dots-rotate" size="16px" class="size-4" />
            <template v-else>{{ t('common.import') }}</template>
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
