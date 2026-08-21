import type { TaskMedia } from "./types";

export function mediaContentUrl(mediaId: string, variantId?: string): string {
  const path = `/api/tasks/media/${encodeURIComponent(mediaId)}/content`;
  return variantId
    ? `${path}?variant_id=${encodeURIComponent(variantId)}`
    : path;
}

export function formatMediaSize(size: number): string {
  if (!Number.isFinite(size) || size < 0) return "Unknown size";
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB"];
  let value = size / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${Number(value.toFixed(1))} ${units[unit]}`;
}

export function mediaIconName(kind: TaskMedia["kind"]): string {
  const icons: Record<TaskMedia["kind"], string> = {
    image: "lucide:image",
    video: "lucide:video",
    pdf: "lucide:file-text",
    document: "lucide:file",
  };
  return icons[kind];
}
