import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLeafProgressMap,
  buildProjectProgressMap,
  collectDescendantIds,
} from "../lib/hierarchy.ts";

test("collects a project branch without looping", () => {
  const nodes = [
    { id: "root", parentId: null },
    { id: "a", parentId: "root" },
    { id: "b", parentId: "root" },
    { id: "a1", parentId: "a" },
  ];
  assert.deepEqual(collectDescendantIds(nodes, "root"), [
    "root",
    "a",
    "b",
    "a1",
  ]);
});

test("parent task progress is based on leaf subtasks", () => {
  const progress = buildLeafProgressMap([
    { id: "parent", parentId: null, done: false },
    { id: "one", parentId: "parent", done: true },
    { id: "two", parentId: "parent", done: false },
  ]);
  assert.deepEqual(progress.get("parent"), {
    completed: 1,
    total: 2,
    percent: 50,
  });
});

test("root project aggregates tasks from all descendant projects", () => {
  const projects = [
    { id: "root", parentId: null },
    { id: "one", parentId: "root" },
    { id: "two", parentId: "root" },
    { id: "three", parentId: "root" },
  ];
  const tasks = [
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `a${index}`,
      parentId: null,
      projectId: "one",
      done: index < 3,
    })),
    ...Array.from({ length: 10 }, (_, index) => ({
      id: `b${index}`,
      parentId: null,
      projectId: "two",
      done: true,
    })),
    ...Array.from({ length: 6 }, (_, index) => ({
      id: `c${index}`,
      parentId: null,
      projectId: "three",
      done: index < 3,
    })),
  ];
  const progress = buildProjectProgressMap(projects, tasks);
  assert.deepEqual(progress.get("root"), {
    completed: 16,
    total: 21,
    percent: 76,
  });
  assert.deepEqual(progress.get("one"), {
    completed: 3,
    total: 5,
    percent: 60,
  });
});
