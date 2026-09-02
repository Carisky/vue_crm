import assert from "node:assert/strict";
import test from "node:test";

import { ref } from "vue";

import * as taskModalState from "../lib/task-modal-state.ts";

test("opens and closes create-task state without touching navigation", () => {
  const state = ref({
    isOpen: false,
    initialStatus: undefined as string | undefined,
    parentTaskId: undefined as string | undefined,
  });
  const modal = taskModalState.createTaskModalController(state);

  modal.open("IN_PROGRESS", "parent-1");

  assert.equal(modal.isOpen.value, true);
  assert.deepEqual(state.value, {
    isOpen: true,
    initialStatus: "IN_PROGRESS",
    parentTaskId: "parent-1",
  });

  modal.close();

  assert.equal(modal.isOpen.value, false);
  assert.deepEqual(state.value, {
    isOpen: false,
    initialStatus: undefined,
    parentTaskId: undefined,
  });
});

test("opens update-task state with a task id and resets it on close", () => {
  assert.equal(
    typeof (taskModalState as Record<string, unknown>)[
      "createUpdateTaskModalController"
    ],
    "function",
  );
  const createController = (
    taskModalState as unknown as {
      createUpdateTaskModalController(
        state: ReturnType<typeof ref<{ isOpen: boolean; taskId?: string }>>,
      ): {
        isOpen: Readonly<{ value: boolean }>;
        open(taskId: string): void;
        close(): void;
      };
    }
  ).createUpdateTaskModalController;
  const state = ref({ isOpen: false, taskId: undefined as string | undefined });
  const modal = createController(state);

  modal.open("task-1");
  assert.equal(modal.isOpen.value, true);
  assert.deepEqual(state.value, { isOpen: true, taskId: "task-1" });

  modal.close();
  assert.equal(modal.isOpen.value, false);
  assert.deepEqual(state.value, { isOpen: false, taskId: undefined });
});
