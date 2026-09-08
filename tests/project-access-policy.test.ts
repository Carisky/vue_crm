import assert from "node:assert/strict";
import test from "node:test";

import { calculateEffectivelyRestrictedProjectIds, calculateVisibleProjectIds } from "../server/lib/project-access-policy.ts";

const projects = [
  {
    id: "public-root",
    parentId: null,
    visibility: "PUBLIC" as const,
    creatorId: "owner",
  },
  {
    id: "private-child",
    parentId: "public-root",
    visibility: "PRIVATE" as const,
    creatorId: "owner",
  },
  {
    id: "public-grandchild",
    parentId: "private-child",
    visibility: "PUBLIC" as const,
    creatorId: "owner",
  },
  {
    id: "private-deep",
    parentId: "public-grandchild",
    visibility: "PRIVATE" as const,
    creatorId: "other",
  },
];

test("a private ancestor restricts its complete branch", () => {
  assert.deepEqual(
    [...calculateVisibleProjectIds({
      userId: "member",
      isAdmin: false,
      projects,
      grantedProjectIds: new Set(),
    })],
    ["public-root"],
  );
});

test("every private node in the ancestor chain requires access", () => {
  assert.deepEqual(
    [...calculateVisibleProjectIds({
      userId: "member",
      isAdmin: false,
      projects,
      grantedProjectIds: new Set(["private-child"]),
    })],
    ["public-root", "private-child", "public-grandchild"],
  );
});

test("a creator passes their private node and admins pass all valid nodes", () => {
  const creatorVisible = calculateVisibleProjectIds({
    userId: "owner",
    isAdmin: false,
    projects,
    grantedProjectIds: new Set(["private-deep"]),
  });
  assert.deepEqual([...creatorVisible], [
    "public-root",
    "private-child",
    "public-grandchild",
    "private-deep",
  ]);

  const adminVisible = calculateVisibleProjectIds({
    userId: "admin",
    isAdmin: true,
    projects,
    grantedProjectIds: new Set(),
  });
  assert.deepEqual([...adminVisible], projects.map(({ id }) => id));
});

test("missing parents and cycles fail closed", () => {
  const malformed = [
    { id: "orphan", parentId: "missing", visibility: "PUBLIC" as const, creatorId: "owner" },
    { id: "cycle-a", parentId: "cycle-b", visibility: "PUBLIC" as const, creatorId: "owner" },
    { id: "cycle-b", parentId: "cycle-a", visibility: "PUBLIC" as const, creatorId: "owner" },
  ];
  assert.deepEqual(
    [...calculateVisibleProjectIds({
      userId: "member",
      isAdmin: false,
      projects: malformed,
      grantedProjectIds: new Set(),
    })],
    [],
  );
});

test("private ancestry marks the complete branch as restricted", () => {
  assert.deepEqual([...calculateEffectivelyRestrictedProjectIds(projects)], [
    "private-child",
    "public-grandchild",
    "private-deep",
  ]);
});
