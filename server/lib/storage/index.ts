import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { resolveStorageConfig, type StorageConfig } from "./config.ts";
import {
  createPrivateFilesystemStorage,
  type PrivateStorage,
} from "./filesystem.ts";

export type PrivateStorageContext = {
  config: StorageConfig;
  storage: PrivateStorage;
};

let singleton: PrivateStorageContext | undefined;

export function getPrivateStorage(): PrivateStorageContext {
  if (!singleton) {
    const config = resolveStorageConfig();
    singleton = {
      config,
      storage: createPrivateFilesystemStorage(config.root),
    };
  }

  return singleton;
}

export async function initializePrivateStorage(): Promise<PrivateStorageContext> {
  const context = getPrivateStorage();
  await Promise.all([
    mkdir(resolve(context.config.root), { recursive: true, mode: 0o700 }),
    mkdir(resolve(context.config.root, ".tmp"), {
      recursive: true,
      mode: 0o700,
    }),
    mkdir(resolve(context.config.root, "objects"), {
      recursive: true,
      mode: 0o700,
    }),
  ]);
  return context;
}
