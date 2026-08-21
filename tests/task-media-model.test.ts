import assert from "node:assert/strict";
import test from "node:test";

import { Prisma } from "@prisma/client";

test("generates staged private-media ownership and storage fields", () => {
  const media = Prisma.dmmf.datamodel.models.find(
    (model) => model.name === "TaskMedia",
  );
  const variants = Prisma.dmmf.datamodel.models.find(
    (model) => model.name === "TaskMediaVariant",
  );

  assert.deepEqual(
    media?.fields
      .filter((field) =>
        ["workspaceId", "uploadedById", "storageKey", "size"].includes(
          field.name,
        ),
      )
      .map((field) => ({ name: field.name, type: field.type })),
    [
      { name: "workspaceId", type: "String" },
      { name: "uploadedById", type: "String" },
      { name: "storageKey", type: "String" },
      { name: "size", type: "Int" },
    ],
  );
  assert.deepEqual(
    media?.fields
      .filter((field) => ["workspace", "uploadedBy"].includes(field.name))
      .map((field) => ({
        name: field.name,
        kind: field.kind,
        type: field.type,
        relationName: field.relationName,
      })),
    [
      {
        name: "workspace",
        kind: "object",
        type: "Workspace",
        relationName: "TaskMediaToWorkspace",
      },
      {
        name: "uploadedBy",
        kind: "object",
        type: "User",
        relationName: "TaskMediaUploader",
      },
    ],
  );
  assert.deepEqual(
    variants?.fields
      .filter((field) => ["storageKey", "size"].includes(field.name))
      .map((field) => ({
        name: field.name,
        type: field.type,
      })),
    [
      { name: "storageKey", type: "String" },
      { name: "size", type: "Int" },
    ],
  );
});
