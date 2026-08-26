const useCreateProjectModal = () => {
  const {
    value: createProjectModalOpen,
    setQueryValue: setCreateProjectModalOpen,
  } = useUrlQuery("create_task");

  const isOpen = computed(() => !!createProjectModalOpen.value);
  const { setQueryValue: setParentTaskId } = useUrlQuery("parent_task_id");

  const open = (status?: string, parentTaskId?: string) => {
    setParentTaskId(parentTaskId ?? null);
    setCreateProjectModalOpen(encodeURIComponent(status ?? 1));
  };
  const close = () => {
    setCreateProjectModalOpen(null);
    setParentTaskId(null);
  };

  return {
    isOpen,
    open,
    close,
  };
};

export default useCreateProjectModal;
