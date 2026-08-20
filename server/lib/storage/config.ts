import { isAbsolute, relative, resolve } from "node:path";

export type StorageConfig = {
  root: string;
  maxFileSizeBytes: number;
  maxFilesPerUpload: number;
};

type ResolveStorageConfigInput = {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  production?: boolean;
};

const DEFAULT_MAX_FILE_SIZE_MB = 50;
const DEFAULT_MAX_FILES_PER_UPLOAD = 10;

function parsePositiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a finite positive integer.`);
  }

  return parsed;
}

function isWithinDirectory(path: string, directory: string): boolean {
  const pathRelativeToDirectory = relative(directory, path);
  return (
    pathRelativeToDirectory === "" ||
    (!pathRelativeToDirectory.startsWith("..") && !isAbsolute(pathRelativeToDirectory))
  );
}

export function resolveStorageConfig(input: ResolveStorageConfigInput = {}): StorageConfig {
  const env = input.env ?? process.env;
  const cwd = resolve(input.cwd ?? process.cwd());
  const production = input.production ?? env.NODE_ENV === "production";
  const configuredRoot = env.STORAGE_ROOT;

  if (production && !configuredRoot) {
    throw new Error("STORAGE_ROOT must be configured in production.");
  }

  if (production && configuredRoot && !isAbsolute(configuredRoot)) {
    throw new Error("STORAGE_ROOT must be an absolute path in production.");
  }

  const root = resolve(cwd, configuredRoot || ".data/storage");
  if (isWithinDirectory(root, resolve(cwd, "public"))) {
    throw new Error("STORAGE_ROOT must not be inside the public directory.");
  }

  const maxFileSizeMb = parsePositiveInteger(
    env.STORAGE_MAX_FILE_SIZE_MB,
    DEFAULT_MAX_FILE_SIZE_MB,
    "STORAGE_MAX_FILE_SIZE_MB",
  );
  const maxFilesPerUpload = parsePositiveInteger(
    env.STORAGE_MAX_FILES_PER_UPLOAD,
    DEFAULT_MAX_FILES_PER_UPLOAD,
    "STORAGE_MAX_FILES_PER_UPLOAD",
  );

  return {
    root,
    maxFileSizeBytes: maxFileSizeMb * 1024 * 1024,
    maxFilesPerUpload,
  };
}
