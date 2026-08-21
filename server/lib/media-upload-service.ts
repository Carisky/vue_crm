import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  UnsupportedMediaTypeError,
  validateMediaFile,
  type MediaKind,
  type ValidatedMedia,
} from "./storage/file-policy.ts";
import { getPrivateStorage } from "./storage/index.ts";
import type { PrivateStorage } from "./storage/filesystem.ts";
import { probeVideoHeight, selectVariantHeights, transcodeVideo } from "./video.ts";

export type PendingMediaRepository = {
  create(input: {
    workspaceId: string;
    uploadedById: string;
    storageKey: string;
    originalName: string;
    mime: string;
    size: number;
  }): Promise<{ id: string }>;
  remove(id: string): Promise<void>;
  createVariant?(input: { taskMediaId: string; storageKey: string; mime: string; size: number; resolution: number }): Promise<void>;
};

export type PublicPendingMedia = {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: MediaKind;
};

export type MediaUploadDependencies = {
  storage: PrivateStorage;
  maxFileSizeBytes: number;
  repository: PendingMediaRepository;
  validateFile?: (input: {
    path: string;
    originalName: string;
    claimedMime?: string | null;
  }) => Promise<ValidatedMedia>;
};

export class MediaUploadTooLargeError extends Error {
  constructor() {
    super("Uploaded file is too large.");
    this.name = "MediaUploadTooLargeError";
  }
}

export class MediaUploadStorageError extends Error {
  constructor() {
    super("Unable to store media.");
    this.name = "MediaUploadStorageError";
  }
}

class ByteLimitTransform extends Transform {
  private size = 0;
  private readonly maximumBytes: number;

  constructor(maximumBytes: number) {
    super();
    this.maximumBytes = maximumBytes;
  }

  get bytesWritten(): number {
    return this.size;
  }

  override _transform(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: (error?: Error | null, data?: Buffer | string) => void,
  ): void {
    const byteLength = Buffer.isBuffer(chunk)
      ? chunk.length
      : Buffer.byteLength(chunk, encoding);
    if (this.size + byteLength > this.maximumBytes) {
      callback(new MediaUploadTooLargeError());
      return;
    }

    this.size += byteLength;
    callback(null, chunk);
  }
}

async function createDefaultDependencies(): Promise<MediaUploadDependencies> {
  const { config, storage } = getPrivateStorage();
  const { default: prisma } = await import("./prisma.ts");

  return {
    storage,
    maxFileSizeBytes: config.maxFileSizeBytes,
    repository: {
      async create(input) {
        return prisma.taskMedia.create({
          data: input,
          select: { id: true },
        });
      },
      async remove(id) {
        await prisma.taskMedia.delete({ where: { id } });
      },
      async createVariant(input) {
        await prisma.taskMediaVariant.create({ data: input });
      },
    },
  };
}

async function createPrivateVideoVariants(
  mediaId: string,
  originalKey: string,
  storage: PrivateStorage,
  repository: PendingMediaRepository,
): Promise<void> {
  const createVariant = repository.createVariant;
  if (!createVariant) return;
  await storage.withPhysicalPath(originalKey, async (sourcePath) => {
    const height = await probeVideoHeight(sourcePath);
    for (const resolution of selectVariantHeights(height)) {
      const key = storage.createKey("task-media-variant");
      let temporary: Awaited<ReturnType<PrivateStorage["createTemporaryObject"]>> | undefined;
      let committed = false;
      try {
        temporary = await storage.createTemporaryObject(key);
        temporary.stream.destroy();
        await transcodeVideo(sourcePath, temporary.path, resolution);
        await storage.commitTemporaryObject(key, temporary.path);
        committed = true;
        const object = await storage.stat(key);
        await createVariant({ taskMediaId: mediaId, storageKey: key, mime: "video/mp4", size: object.size, resolution });
      } catch {
        if (temporary) await storage.discardTemporaryObject(temporary.path).catch(() => undefined);
        if (committed) await storage.remove(key).catch(() => undefined);
      }
    }
  });
}

function publicMedia(
  id: string,
  originalName: string,
  size: number,
  validated: ValidatedMedia,
): PublicPendingMedia {
  return {
    id,
    name: originalName,
    mime: validated.mime,
    size,
    kind: validated.kind,
  };
}

export async function storePendingMedia(
  input: {
    workspaceId: string;
    userId: string;
    originalName: string;
    claimedMime?: string | null;
    stream: Readable;
  },
  deps?: MediaUploadDependencies,
): Promise<PublicPendingMedia> {
  let dependencies: MediaUploadDependencies;
  let storageKey: string;
  let temporary: Awaited<ReturnType<PrivateStorage["createTemporaryObject"]>>;
  try {
    dependencies = deps ?? (await createDefaultDependencies());
    storageKey = dependencies.storage.createKey("task-media");
    temporary = await dependencies.storage.createTemporaryObject(storageKey);
  } catch {
    throw new MediaUploadStorageError();
  }

  const byteLimit = new ByteLimitTransform(dependencies.maxFileSizeBytes);
  let committed = false;

  try {
    await pipeline(input.stream, byteLimit, temporary.stream);
    if ((input.stream as Readable & { truncated?: boolean }).truncated) {
      throw new MediaUploadTooLargeError();
    }
    const validated = await (dependencies.validateFile ?? validateMediaFile)({
      path: temporary.path,
      originalName: input.originalName,
      claimedMime: input.claimedMime,
    });

    await dependencies.storage.commitTemporaryObject(
      storageKey,
      temporary.path,
    );
    committed = true;

    const row = await dependencies.repository.create({
      workspaceId: input.workspaceId,
      uploadedById: input.userId,
      storageKey,
      originalName: input.originalName,
      mime: validated.mime,
      size: byteLimit.bytesWritten,
    });

    if (validated.kind === "video") {
      await createPrivateVideoVariants(row.id, storageKey, dependencies.storage, dependencies.repository);
    }

    return publicMedia(
      row.id,
      input.originalName,
      byteLimit.bytesWritten,
      validated,
    );
  } catch (error) {
    await Promise.allSettled([
      dependencies.storage.discardTemporaryObject(temporary.path),
      ...(committed ? [dependencies.storage.remove(storageKey)] : []),
    ]);

    if (
      error instanceof MediaUploadTooLargeError ||
      error instanceof UnsupportedMediaTypeError
    ) {
      throw error;
    }
    throw new MediaUploadStorageError();
  }
}
