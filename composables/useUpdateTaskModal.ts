import {
  createUpdateTaskModalController,
  emptyUpdateTaskModalState,
  type UpdateTaskModalState,
} from "~/lib/task-modal-state";

const useUpdateTaskModal = () => {
  const state = useState<UpdateTaskModalState>(
    "update-task-modal",
    emptyUpdateTaskModalState,
  );
  return createUpdateTaskModalController(state);
};

export default useUpdateTaskModal;
