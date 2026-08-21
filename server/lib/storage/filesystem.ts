import { createReadStream, createWriteStream, type ReadStream, type WriteStream } from "node:fs";
import { mkdir, rename, stat as fileStat, unlink } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";

export type StorageByteRange = { start: number; end: number };

export type PrivateStorage = {
  createKey(scope: "task-media" | "task-media-variant"): string;
  createTemporaryObject(key: string): Promise<{ path: string; stream: WriteStream }>;
  commitTemporaryObject(key: string, temporaryPath: string): Promise<void>;
  discardTemporaryObject(temporaryPath: string): Promise<void>;
  stat(key: string): Promise<{ size: number }>;
  openReadStream(key: string, range?: StorageByteRange): ReadStream;
  remove(key: string): Promise<boolean>;
  withPhysicalPath<T>(key: string, run: (path: string) => Promise<T>): Promise<T>;
};

function isContained(path: string, directory: string): boolean {
  const pathRelativeToDirectory = relative(directory, path);
  return (
    pathRelativeToDirectory !== "" &&
    pathRelativeToDirectory !== ".." &&
    !pathRelativeToDirectory.startsWith(`..${sep}`) &&
    !isAbsolute(pathRelativeToDirectory)
  );
}

function assertStorageKey(key: string): void {
  if (
    typeof key !== "string" ||
    key.length === 0 ||
    key.includes("\0") ||
    key.includes("\\") ||
    isAbsolute(key) ||
    /^[a-zA-Z]:/.test(key)
  ) {
    throw new Error("Invalid storage key.");
  }

  const segments = key.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error("Invalid storage key.");
  }
}

export function resolveStorageObjectPath(root: string, key: string): string {
  assertStorageKey(key);

  const objectsDirectory = resolve(root, "objects");
  const objectPath = resolve(objectsDirectory, key);
  if (!isContained(objectPath, objectsDirectory)) {
    throw new Error("Invalid storage key.");
  }

  return objectPath;
}

function resolveTemporaryPath(root: string, temporaryPath: string): string {
  if (typeof temporaryPath !== "string" || temporaryPath.includes("\0")) {
    throw new Error("Invalid temporary storage path.");
  }

  const temporaryDirectory = resolve(root, ".tmp");
  const resolvedTemporaryPath = resolve(temporaryPath);
  if (!isContained(resolvedTemporaryPath, temporaryDirectory) || !resolvedTemporaryPath.endsWith(".part")) {
    throw new Error("Invalid temporary storage path.");
  }

  return resolvedTemporaryPath;
}

async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
}

async function removeIfPresent(path: string): Promise<boolean> {
  try {
    await unlink(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export function createPrivateFilesystemStorage(root: string): PrivateStorage {
  const storageRoot = resolve(root);
  const temporaryDirectory = resolve(storageRoot, ".tmp");

  return {
    createKey(scope) {
      return `${scope}/${randomUUID()}`;
    },

    async createTemporaryObject(key) {
      assertStorageKey(key);
      await ensureDirectory(storageRoot);
      await ensureDirectory(temporaryDirectory);

      const path = resolve(temporaryDirectory, `${randomUUID()}.part`);
      return { path, stream: createWriteStream(path, { flags: "wx", mode: 0o600 }) };
    },

    async commitTemporaryObject(key, temporaryPath) {
      const objectPath = resolveStorageObjectPath(storageRoot, key);
      const safeTemporaryPath = resolveTemporaryPath(storageRoot, temporaryPath);
      await ensureDirectory(storageRoot);
      await ensureDirectory(resolve(objectPath, ".."));
      await rename(safeTemporaryPath, objectPath);
    },

    async discardTemporaryObject(temporaryPath) {
      await removeIfPresent(resolveTemporaryPath(storageRoot, temporaryPath));
    },

    async stat(key) {
      const metadata = await fileStat(resolveStorageObjectPath(storageRoot, key));
      return { size: metadata.size };
    },

    openReadStream(key, range) {
      const path = resolveStorageObjectPath(storageRoot, key);
      if (range) {
        if (
          !Number.isInteger(range.start) ||
          !Number.isInteger(range.end) ||
          range.start < 0 ||
          range.end < range.start
        ) {
          throw new Error("Invalid storage byte range.");
        }
        return createReadStream(path, { start: range.start, end: range.end });
      }
      return createReadStream(path);
    },

    async remove(key) {
      return removeIfPresent(resolveStorageObjectPath(storageRoot, key));
    },

    async withPhysicalPath(key, run) {
      return run(resolveStorageObjectPath(storageRoot, key));
    },
  };
}
