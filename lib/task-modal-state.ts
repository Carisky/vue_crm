import { computed, type Ref } from "vue";

export type CreateTaskModalState = {
  isOpen: boolean;
  initialStatus?: string;
  parentTaskId?: string;
};

export const emptyCreateTaskModalState = (): CreateTaskModalState => ({
  isOpen: false,
  initialStatus: undefined,
  parentTaskId: undefined,
});

export function createTaskModalController(state: Ref<CreateTaskModalState>) {
  const isOpen = computed(() => state.value.isOpen);

  const open = (initialStatus?: string, parentTaskId?: string) => {
    state.value = { isOpen: true, initialStatus, parentTaskId };
  };

  const close = () => {
    state.value = emptyCreateTaskModalState();
  };

  return { state, isOpen, open, close };
}

export type UpdateTaskModalState = {
  isOpen: boolean;
  taskId?: string;
};

export const emptyUpdateTaskModalState = (): UpdateTaskModalState => ({
  isOpen: false,
  taskId: undefined,
});

export function createUpdateTaskModalController(
  state: Ref<UpdateTaskModalState>,
) {
  const isOpen = computed(() => state.value.isOpen);

  const open = (taskId: string) => {
    state.value = { isOpen: true, taskId };
  };

  const close = () => {
    state.value = emptyUpdateTaskModalState();
  };

  return { state, isOpen, open, close };
}
