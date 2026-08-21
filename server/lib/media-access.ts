import { mediaKindFromMime, type MediaKind } from "./storage/file-policy.ts";

export type MediaAccessVariantRow = {
  id: string;
  taskMediaId: string;
  storageKey: string | null;
  mime: string | null;
  size: number;
  resolution: number | null;
};

export type MediaAccessRow = {
  id: string;
  taskId: string | null;
  workspaceId: string;
  uploadedById: string | null;
  storageKey: string | null;
  mime: string | null;
  originalName: string | null;
  size: number;
  resolution: number | null;
  variants: MediaAccessVariantRow[];
};

export type AuthorizedMediaRead = {
  key: string;
  mime: string;
  name: string;
  size: number;
  kind: MediaKind;
  resolution: number | null;
};

export type MediaAccessDependencies = {
  media: {
    findById(mediaId: string): Promise<MediaAccessRow | null>;
  };
  membership: {
    exists(input: { workspaceId: string; userId: string }): Promise<boolean>;
  };
};

export class MediaReadNotFoundError extends Error {
  constructor() {
    super("Media not found.");
    this.name = "MediaReadNotFoundError";
  }
}

export class MediaReadForbiddenError extends Error {
  constructor() {
    super("Media access is forbidden.");
    this.name = "MediaReadForbiddenError";
  }
}

function missingMedia(): never {
  throw new MediaReadNotFoundError();
}

function forbiddenMedia(): never {
  throw new MediaReadForbiddenError();
}

export async function authorizeMediaRead(
  input: { mediaId: string; variantId?: string; userId: string },
  dependencies: MediaAccessDependencies,
): Promise<AuthorizedMediaRead> {
  const media = await dependencies.media.findById(input.mediaId);
  if (!media || !media.storageKey || !media.mime || !media.originalName) missingMedia();

  const isMember = await dependencies.membership.exists({
    workspaceId: media.workspaceId,
    userId: input.userId,
  });
  if (!isMember) forbiddenMedia();
  if (media.taskId === null && media.uploadedById !== input.userId) forbiddenMedia();

  const selected = input.variantId
    ? media.variants.find((variant) => variant.id === input.variantId)
    : media;
  if (!selected || !selected.storageKey || !selected.mime) missingMedia();

  return {
    key: selected.storageKey,
    mime: selected.mime,
    name: media.originalName,
    size: selected.size,
    kind: mediaKindFromMime(selected.mime),
    resolution: selected.resolution,
  };
}
