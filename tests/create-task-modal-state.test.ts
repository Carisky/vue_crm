import assert from "node:assert/strict";
import test from "node:test";

import { ref } from "vue";

import {
  createTaskModalController,
  type TaskModalNavigationState,
} from "../lib/create-task-modal-state.ts";

test("opens the shared task modal immediately while URL navigation is pending", async () => {
  const queryValue = ref<string | undefined>(undefined);
  const navigationState = ref<TaskModalNavigationState>({
    override: null,
    sequence: 0,
  });
  const navigations: Array<Record<string, unknown>> = [];
  let finishNavigation: (() => void) | undefined;

  const createController = () =>
    createTaskModalController({
      queryValue,
      navigationState,
      currentQuery: () => ({ tab: "kanban" }),
      navigate(query) {
        navigations.push(query);
        return new Promise<void>((resolve) => {
          finishNavigation = () => {
            queryValue.value = String(query["create_task"]);
            resolve();
          };
        });
      },
    });

  const trigger = createController();
  const modalRenderedInLayout = createController();

  trigger.open("InProgress", "parent-1");

  assert.equal(modalRenderedInLayout.isOpen.value, true);
  assert.deepEqual(navigations, [
    {
      tab: "kanban",
      create_task: "InProgress",
      parent_task_id: "parent-1",
    },
  ]);

  finishNavigation?.();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(modalRenderedInLayout.isOpen.value, true);
  assert.equal(navigationState.value.override, null);
});

test("closes the shared task modal immediately and removes both modal query values", async () => {
  const queryValue = ref<string | undefined>("Todo");
  const navigationState = ref<TaskModalNavigationState>({
    override: null,
    sequence: 0,
  });
  let navigatedQuery: Record<string, unknown> | undefined;

  const modal = createTaskModalController({
    queryValue,
    navigationState,
    currentQuery: () => ({
      tab: "table",
      create_task: "Todo",
      parent_task_id: "parent-1",
    }),
    async navigate(query) {
      navigatedQuery = query;
      queryValue.value = undefined;
    },
  });

  modal.close();

  assert.equal(modal.isOpen.value, false);
  assert.deepEqual(navigatedQuery, { tab: "table" });

  await Promise.resolve();
  await Promise.resolve();
  assert.equal(modal.isOpen.value, false);
});
