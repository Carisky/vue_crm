import "dotenv/config";

import { resolveStorageConfig } from "../server/lib/storage/config.ts";
import { inspectLegacyMedia } from "../server/lib/storage/legacy-migration.ts";

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
      const { default: prisma } = await import("../server/lib/prisma.ts");
      try {
        const rows = await prisma.taskMedia.findMany({
          select: { id: true, path: true, storageKey: true },
        });
        console.log(JSON.stringify({ mode: "dry-run", storageConfigured: Boolean(config.root), ...(await inspectLegacyMedia({ rows })) }));
      } finally {
        await prisma.$disconnect();
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid storage configuration.");
    process.exitCode = 1;
  }
}
