import { promises as fs } from "node:fs";
import { join, resolve, sep } from "node:path";

const MEDIA_UPLOAD_DIR = join(process.cwd(), "public", "uploads", "tasks", "media");

export function resolveTaskMediaPath(mediaPath: string) {
  if (!mediaPath) return null;
  const normalized = mediaPath.startsWith("/") ? mediaPath.slice(1) : mediaPath;
  const resolvedPath = resolve(process.cwd(), "public", normalized);

  if (
    resolvedPath !== MEDIA_UPLOAD_DIR &&
    !resolvedPath.startsWith(`${MEDIA_UPLOAD_DIR}${sep}`)
  ) {
    return null;
  }

  return resolvedPath;
}

export async function deleteTaskMediaFile(mediaPath: string) {
  const resolvedPath = resolveTaskMediaPath(mediaPath);
  if (!resolvedPath) return false;

  try {
    await fs.unlink(resolvedPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
