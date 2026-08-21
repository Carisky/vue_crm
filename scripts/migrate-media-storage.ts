import { resolveStorageConfig } from "../server/lib/storage/config.ts";

const flags = new Set(process.argv.slice(2));
const dryRun = flags.has("--dry-run");
const apply = flags.has("--apply");

if (dryRun === apply || flags.size !== 1) {
  console.error("Usage: npm run storage:migrate -- --dry-run | --apply");
  process.exitCode = 1;
} else {
  try {
    const config = resolveStorageConfig({ production: true });
    if (apply) {
      console.error("STOP THE APPLICATION SERVER BEFORE RUNNING --apply.");
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify({ mode: "dry-run", storageConfigured: Boolean(config.root) }));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid storage configuration.");
    process.exitCode = 1;
  }
}
