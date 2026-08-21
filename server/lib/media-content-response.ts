import {
  parseSingleRange,
  type ParsedRange,
} from "./http-range.ts";
import {
  buildContentDisposition,
  type ContentDisposition,
} from "./storage/content-disposition.ts";
import type { MediaKind } from "./storage/file-policy.ts";

export type MediaContentMetadata = {
  mime: string;
  name: string;
  size: number;
  kind: MediaKind;
};

export type MediaContentResponse = {
  status: 200 | 206;
  range: ParsedRange | null;
  headers: Record<string, string>;
};

function dispositionFor(media: MediaContentMetadata): ContentDisposition {
  return media.kind === "document" || media.mime === "image/svg+xml"
    ? "attachment"
    : "inline";
}

export function buildMediaContentResponse(
  media: MediaContentMetadata,
  rangeHeader?: string,
): MediaContentResponse {
  const range = parseSingleRange(rangeHeader, media.size);
  const contentLength = range ? range.end - range.start + 1 : media.size;
  const headers: Record<string, string> = {
    "Content-Type": media.mime,
    "Content-Disposition": buildContentDisposition(dispositionFor(media), media.name),
    "Content-Length": String(contentLength),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
  };

  if (media.kind === "video") headers["Accept-Ranges"] = "bytes";
  if (range) headers["Content-Range"] = `bytes ${range.start}-${range.end}/${media.size}`;

  return { status: range ? 206 : 200, range, headers };
}
