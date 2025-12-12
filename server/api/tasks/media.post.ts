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
  const fields = await readMultipartFormData(event);
  const workspaceField = fields?.find(({ name }) => name === "workspace_id");
  const files = fields?.filter((field) => field.filename);

  const workspaceId = workspaceField?.data.toString();
  if (!workspaceId) {
    throw createError({ status: 400, statusText: "Workspace ID required" });
  }

  await requireWorkspaceMembership(event, workspaceId);

  if (!files?.length) {
    throw createError({ status: 400, statusText: "At least one file required" });
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  const savedFiles = [];
  for (const file of files) {
    const name = file.filename ? sanitizeFileName(file.filename) : "upload";
    const targetName = `${Date.now()}-${randomUUID()}-${name}`;
    const targetPath = join(UPLOAD_DIR, targetName);

    const buffer = Buffer.isBuffer(file.data)
      ? file.data
      : Buffer.from(file.data);
    await fs.writeFile(targetPath, buffer);

    savedFiles.push({
      path: `/uploads/tasks/media/${targetName}`,
      mime: file.type ?? null,
      original_name: file.filename ?? null,
    });
  }

  return { files: savedFiles };
});
