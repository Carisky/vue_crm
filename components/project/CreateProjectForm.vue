<script setup lang="ts">
import { templateRef } from '@vueuse/core';
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { configure, useForm } from 'vee-validate'
import { toTypedSchema } from "@vee-validate/zod";
import { toast } from 'vue-sonner';

import { CreateProjectsSchema } from '~/lib/schema/createProject';
import type { Project } from '~/lib/types';

const { onCancel } = defineProps<{ onCancel?: () => void }>()

const route = useRoute()
const queryClient = useQueryClient()
const { t } = useAppI18n()
const parentProjectId = computed(() => {
    const value = route.query['parent_project_id']
    return typeof value === 'string' && value ? value : null
})

configure({
    validateOnBlur: false
});

const form = useForm({
    validationSchema: toTypedSchema(CreateProjectsSchema),
    initialValues: {
        workspace_id: String(route.params['workspaceId']),
        parent_project_id: parentProjectId.value
    }
})

const fileInputRef = templateRef('fileInputRef')
const image = ref('')
const onUploadImage = (e: Event) => {
    const file = (e.currentTarget as HTMLInputElement).files?.[0]
    image.value = file ? URL.createObjectURL(file) : ''
}

const removeImage = () => {
    form.resetField('image')
    if (fileInputRef.value) {
        fileInputRef.value.value = ''
    }
    image.value = ''
}

const { isPending, mutate } = useMutation({
    mutationFn: async (formData: typeof form.values) => {
        // Handle image manually for zod to validate properly on server-side
        const manualFormData = new FormData()
        manualFormData.append('name', formData.name!)
        manualFormData.append('workspace_id', formData.workspace_id!)
        if (formData.parent_project_id) manualFormData.append('parent_project_id', formData.parent_project_id)
        if (fileInputRef.value?.files?.[0]) manualFormData.append('image', fileInputRef.value.files[0])

        const res =
            await $fetch('/api/projects/create', { method: 'POST', body: manualFormData })
        if (res.project) {
            await queryClient.refetchQueries({ queryKey: ['projects', formData.workspace_id] }) // re-fetch projects

            // reset form
            form.resetForm()
            if (fileInputRef.value) {
                fileInputRef.value.value = ''
            }
            image.value = ''

            // navigate to the newly created project
            await navigateTo(`/workspaces/${formData.workspace_id!}/projects/${(res.project as Project).$id}`)
            toast.success(t('project.created'))
        } else toast.error(t('project.createFailed'))
    },
    onError: () => toast.error(t('project.createFailed'))
})

const handleSubmit = form.handleSubmit((values) => mutate(values))
</script>

<template>
    <Card class="size-full border-none shadow-none gap-0 p-0">
        <CardHeader class="flex py-7">
            <CardTitle class="font-bold text-xl">
                {{ t('project.create') }}
            </CardTitle>
        </CardHeader>
        <div class="px-7">
            <DottedSeparator />
        </div>
        <CardContent class="py-7">
            <form @submit="handleSubmit">
                <fieldset :disabled="isPending">
                    <div class="flex flex-col gap-y-4">
                        <FormField v-slot="{ componentField }" name="workspace_id">
                            <Input type="hidden" v-bind="componentField" />
                        </FormField>
                        <FormField v-slot="{ componentField }" name="parent_project_id">
                            <Input type="hidden" v-bind="componentField" />
                        </FormField>
                        <div v-if="parentProjectId" class="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                            <Icon name="lucide:git-branch" class="size-4" />
                            {{ t('project.subprojectNotice') }}
                        </div>
                        <FormField v-slot="{ componentField }" name="name">
                            <FormItem>
                                <FormLabel>{{ t('project.name') }}</FormLabel>
                                <FormControl>
                                    <Input :placeholder="t('project.namePlaceholder')" v-bind="componentField" />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        </FormField>
                        <FormField v-slot="{ componentField }" name="image">
                            <FormItem>
                                <div class="flex flex-col gap-y-2">
                                    <div class="flex items-center gap-x-5">
                                        <div v-if="image" class="size-[72px] relative rounded-md overflow-hidden">
                                            <img alt="logo" class="object-cover" :src="image" />
                                        </div>
                                        <Avatar v-else class="size-[72px]">
                                            <AvatarFallback>
                                                <Icon name="lucide:image" size="36px" class="size-9 text-neutral-400" />
                                            </AvatarFallback>
                                        </Avatar>
                                        <div class="flex flex-col">
                                            <p class="text-sm">{{ t('project.icon') }}</p>
                                            <p class="text-sm text-muted-foreground">{{ t('upload.imageHint') }}</p>
                                            <input type="file" accept=".jpg, .jpeg, .png, .svg" ref="fileInputRef"
                                                class="hidden" v-bind="componentField" @change="onUploadImage" />
                                            <Button v-if="componentField.modelValue" type="button" variant="destructive"
                                                size="xs" @click="removeImage" class="w-fit mt-2">
                                                {{ t('common.removeImage') }}
                                            </Button>
                                            <Button v-else type="button" variant="teritary" size="xs"
                                                @click="fileInputRef?.click()" class="w-fit mt-2">
                                                {{ t('common.uploadImage') }}
                                            </Button>
                                        </div>
                                    </div>
                                    <FormMessage />
                                </div>
                            </FormItem>
                        </FormField>
                    </div>
                    <DottedSeparator class="py-7" />
                    <div class="flex items-center justify-between gap-5">
                        <Button v-if="!!onCancel" type="button" variant="secondary" size="lg" @click="onCancel"
                            class="w-24">{{ t('common.cancel') }}</Button>
                        <Button type="submit" variant="primary" size="lg" class="w-44 ml-auto">
                            <Icon v-if="isPending" name="svg-spinners:8-dots-rotate" size="16px" class="size-4" />
                            <span v-else>{{ t('project.create') }}</span>
                        </Button>
                    </div>
                </fieldset>
            </form>
        </CardContent>
    </Card>
</template>
