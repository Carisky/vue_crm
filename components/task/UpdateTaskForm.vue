<script setup lang="ts">
import { useMutation } from '@tanstack/vue-query'
import { configure, useForm } from 'vee-validate'
import { toTypedSchema } from "@vee-validate/zod";
import { toast } from 'vue-sonner';

import { CreateTasksSchema } from '~/lib/schema/createTask';
import { TaskStatus, type FilteredTask, type UpdateTaskInject } from '~/lib/types';

const {
    initialValues,
    projectOptions,
    memberOptions,
    onCancel
} = defineProps<{
    initialValues: FilteredTask;
    projectOptions: { $id: string; name: string; image_url?: string; }[];
    memberOptions: { $id: string; name: string; }[];
    onCancel?: () => void;
}>()

const onUpdateTask: UpdateTaskInject | undefined = inject('update-task-inject')
const UNASSIGNED_VALUE = '__UNASSIGNED__'

configure({
    validateOnBlur: false
});

const form = useForm({
    validationSchema: toTypedSchema(CreateTasksSchema.omit({ workspace_id: true, media: true })),
    initialValues: {
        ...initialValues,
        assignee_id: initialValues.assignee_id ?? UNASSIGNED_VALUE,
        due_date: initialValues.due_date ? new Date(initialValues.due_date) : undefined,
        description: initialValues.description ?? "",
        estimated_hours: initialValues.estimated_hours ?? undefined,
        actual_hours: initialValues.actual_hours ?? undefined,
        started_at: initialValues.started_at ? new Date(initialValues.started_at) : undefined,
    }
})

const statuses = Object.entries(TaskStatus)

const { isPending, mutate } = useMutation({
    mutationFn: async (formData: typeof form.values) => {
        const res =
            await $fetch(`/api/tasks/${initialValues.$id}`, { method: 'PATCH', body: formData })
        const { task } = (res ?? { task: null }) as unknown as { task: FilteredTask | null }
        if (task) {
            // run all subscribers
            await Promise.all(
                (onUpdateTask?.updateTaskSuccessSubsribers ?? []).map((onUpdate) => onUpdate?.(task))
            )

            // close form
            onCancel?.()
            toast.success('Task updated')
        } else toast.error('Failed to update task')
    },
    onError: () => toast.error('Failed to update task')
})

const handleSubmit = form.handleSubmit((values) => {
    const payload = {
        ...values,
        assignee_id:
            values.assignee_id === UNASSIGNED_VALUE
                ? null
                : values.assignee_id ?? null,
        due_date: values.due_date ?? null,
        estimated_hours: values.estimated_hours ?? undefined,
        actual_hours: values.actual_hours ?? undefined,
        started_at: values.started_at ?? undefined,
    }

    mutate(payload as typeof form.values)
})
</script>

<template>
    <Card class="size-full border-none shadow-none gap-0 p-0">
        <CardHeader class="flex py-7">
            <CardTitle class="font-bold text-xl">
                Update task
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
                                <FormLabel>Task Name</FormLabel>
                                <FormControl>
                                    <Input placeholder="Enter task name" v-bind="componentField" />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        </FormField>
                        <FormField v-slot="{ componentField }" name="due_date">
                            <FormItem>
                                <FormLabel>Due Date</FormLabel>
                                <FormControl>
                                    <DatePicker :value="componentField.modelValue"
                                        :on-change="componentField.onChange" />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        </FormField>
                        <FormField v-slot="{ componentField }" name="started_at">
                            <FormItem>
                                <FormLabel>Task Started</FormLabel>
                                <FormControl>
                                    <DatePicker :value="componentField.modelValue"
                                        :on-change="componentField.onChange" placeholder="Select start date" />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        </FormField>
                        <FormField v-slot="{ componentField }" name="description">
                            <FormItem>
                                <FormLabel>Description</FormLabel>
                                <FormControl>
                                    <Textarea placeholder="Add task details" v-bind="componentField" />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        </FormField>
                        <div class="grid gap-3 sm:grid-cols-2">
                            <FormField v-slot="{ componentField }" name="estimated_hours">
                                <FormItem>
                                    <FormLabel>Estimated Hours</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="number"
                                            step="0.25"
                                            min="0"
                                            placeholder="0"
                                            v-bind="componentField"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            </FormField>
                            <FormField v-slot="{ componentField }" name="actual_hours">
                                <FormItem>
                                    <FormLabel>Actual Hours</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="number"
                                            step="0.25"
                                            min="0"
                                            placeholder="0"
                                            v-bind="componentField"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            </FormField>
                        </div>
                        <FormField v-slot="{ componentField }" name="assignee_id">
                            <FormItem>
                                <FormLabel>Assignee</FormLabel>
                                <Select :default-value="componentField.modelValue"
                                    @update:model-value="componentField.onChange">
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select assignee"></SelectValue>
                                        </SelectTrigger>
                                    </FormControl>
                                    <FormMessage />
                                    <SelectContent>
                                        <SelectItem :value="UNASSIGNED_VALUE">
                                            Unassigned
                                        </SelectItem>
                                        <SelectSeparator />
                                        <SelectItem v-for="assignee of memberOptions" :key="assignee.$id"
                                            :value="assignee.$id">
                                            <WorkspaceMemberAvatar :name="assignee.name" class="size-6" />
                                            {{ assignee.name }}
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </FormItem>
                        </FormField>
                        <FormField v-slot="{ componentField }" name="status">
                            <FormItem>
                                <FormLabel>Status</FormLabel>
                                <Select :default-value="componentField.modelValue"
                                    @update:model-value="componentField.onChange">
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select status"></SelectValue>
                                        </SelectTrigger>
                                    </FormControl>
                                    <FormMessage />
                                    <SelectContent>
                                        <SelectItem v-for="[label, val] of statuses" :key="val" :value="val">
                                            {{ label }}
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </FormItem>
                        </FormField>
                        <FormField v-slot="{ componentField }" name="project_id">
                            <FormItem>
                                <FormLabel>Project</FormLabel>
                                <Select :default-value="componentField.modelValue"
                                    @update:model-value="componentField.onChange">
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select project"></SelectValue>
                                        </SelectTrigger>
                                    </FormControl>
                                    <FormMessage />
                                    <SelectContent>
                                        <SelectItem v-for="project of projectOptions" :key="project.$id"
                                            :value="project.$id">
                                            <ProjectAvatar :name="project.name" :image="project.image_url"
                                                class="size-6" />
                                            {{ project.name }}
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </FormItem>
                        </FormField>
                    </div>
                    <DottedSeparator class="py-7" />
                    <div class="flex items-center justify-between gap-5">
                        <Button v-if="!!onCancel" type="button" variant="secondary" size="lg" @click="onCancel"
                            class="w-24">Cancel</Button>
                        <Button type="submit" variant="primary" size="lg" class="w-24 ml-auto">
                            <Icon v-if="isPending" name="svg-spinners:8-dots-rotate" size="16px" class="size-4" />
                            <span v-else>Save</span>
                        </Button>
                    </div>
                </fieldset>
            </form>
        </CardContent>
    </Card>
</template>
