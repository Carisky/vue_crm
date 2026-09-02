import {
  createTaskModalController,
  emptyCreateTaskModalState,
  type CreateTaskModalState,
} from "~/lib/task-modal-state";

const useCreateTaskModal = () => {
  const state = useState<CreateTaskModalState>(
    "create-task-modal",
    emptyCreateTaskModalState,
  );
  return createTaskModalController(state);
};

export default useCreateTaskModal;
