import { computed, type Ref } from "vue";

export type TaskModalNavigationState = {
  override: boolean | null;
  sequence: number;
};

type TaskModalControllerDependencies = {
  queryValue: Readonly<Ref<string | undefined>>;
  navigationState: Ref<TaskModalNavigationState>;
  currentQuery(): Record<string, unknown>;
  navigate(query: Record<string, unknown>): PromiseLike<unknown> | unknown;
};

export function createTaskModalController(
  dependencies: TaskModalControllerDependencies,
) {
  const isOpen = computed(
    () =>
      dependencies.navigationState.value.override ??
      Boolean(dependencies.queryValue.value),
  );

  const navigateWithOverride = (
    override: boolean,
    query: Record<string, unknown>,
  ) => {
    const sequence = dependencies.navigationState.value.sequence + 1;
    dependencies.navigationState.value = { override, sequence };

    let navigation: PromiseLike<unknown> | unknown;
    try {
      navigation = dependencies.navigate(query);
    } catch {
      if (dependencies.navigationState.value.sequence === sequence) {
        dependencies.navigationState.value = { override: null, sequence };
      }
      return;
    }

    void Promise.resolve(navigation)
      .catch(() => undefined)
      .finally(() => {
        if (dependencies.navigationState.value.sequence === sequence) {
          dependencies.navigationState.value = { override: null, sequence };
        }
      });
  };

  const open = (status?: string, parentTaskId?: string) => {
    const query: Record<string, unknown> = {
      ...dependencies.currentQuery(),
      create_task: String(status ?? 1),
    };
    if (parentTaskId) query["parent_task_id"] = parentTaskId;
    else delete query["parent_task_id"];

    navigateWithOverride(true, query);
  };

  const close = () => {
    const query = { ...dependencies.currentQuery() };
    delete query["create_task"];
    delete query["parent_task_id"];
    navigateWithOverride(false, query);
  };

  return { isOpen, open, close };
}
