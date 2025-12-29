import { Buffer } from "node:buffer";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import {
  requireUser,
  requireWorkspaceMembership,
} from "~/server/lib/permissions";

const UPLOAD_DIR = join(process.cwd(), "public", "uploads", "tasks", "media");

function sanitizeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const formData = await readFormData(event);
  const workspaceValue = formData?.get("workspace_id");
  const files = formData?.getAll("files") ?? [];

  const workspaceId =
    typeof workspaceValue === "string"
      ? workspaceValue
      : workspaceValue instanceof Blob
        ? await workspaceValue.text()
        : undefined;
  if (!workspaceId) {
    throw createError({ status: 400, statusText: "Workspace ID required" });
  }

  await requireWorkspaceMembership(event, workspaceId);

  const uploadFiles = files.filter(
    (value): value is File =>
      typeof value === "object" &&
      value !== null &&
      "arrayBuffer" in value &&
      "name" in value
  );

  if (!uploadFiles.length) {
    throw createError({ status: 400, statusText: "At least one file required" });
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  const savedFiles = [];
  for (const file of uploadFiles) {
    const name = file.name ? sanitizeFileName(file.name) : "upload";
    const targetName = `${Date.now()}-${randomUUID()}-${name}`;
    const targetPath = join(UPLOAD_DIR, targetName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(targetPath, buffer);

    savedFiles.push({
      path: `/uploads/tasks/media/${targetName}`,
      mime: file.type ?? null,
      original_name: file.name ?? null,
    });
  }

  return { files: savedFiles };
});
