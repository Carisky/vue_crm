import type { LocationQueryRaw } from "vue-router";

import {
  createTaskModalController,
  type TaskModalNavigationState,
} from "~/lib/create-task-modal-state";

const useCreateTaskModal = () => {
  const route = useRoute();
  const router = useRouter();
  const navigationState = useState<TaskModalNavigationState>(
    "create-task-modal-navigation",
    () => ({ override: null, sequence: 0 }),
  );
  const queryValue = computed(() => {
    const value = route.query["create_task"];
    const firstValue = Array.isArray(value) ? value[0] : value;
    return typeof firstValue === "string" ? firstValue : undefined;
  });

  return createTaskModalController({
    queryValue,
    navigationState,
    currentQuery: () => ({ ...route.query }),
    navigate: (query) => router.push({ query: query as LocationQueryRaw }),
  });
};

export default useCreateTaskModal;
