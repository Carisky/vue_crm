const useCreateProjectModal = () => {
  const {
    value: createProjectModalOpen,
    setQueryValue: setCreateProjectModalOpen,
  } = useUrlQuery("create_project");

  const isOpen = computed(() => createProjectModalOpen.value === "1");
  const { setQueryValue: setParentProjectId } =
    useUrlQuery("parent_project_id");

  const open = (parentProjectId?: string) => {
    setParentProjectId(parentProjectId ?? null);
    setCreateProjectModalOpen(String(1));
  };
  const close = () => {
    setCreateProjectModalOpen(null);
    setParentProjectId(null);
  };

  return {
    isOpen,
    open,
    close,
  };
};

export default useCreateProjectModal;
