export type LegacyMediaRow = {
  id: string;
  path: string | null;
  storageKey: string | null;
};

export type LegacyMigrationReport = {
  referenced: number;
  alreadyMigrated: number;
  missingPath: number;
  invalidPath: number;
};

const LEGACY_PREFIX = "/uploads/tasks/media/";

export async function inspectLegacyMedia(input: {
  rows: LegacyMediaRow[];
}): Promise<LegacyMigrationReport> {
  const report: LegacyMigrationReport = {
    referenced: 0,
    alreadyMigrated: 0,
    missingPath: 0,
    invalidPath: 0,
  };
  for (const row of input.rows) {
    if (row.storageKey) report.alreadyMigrated += 1;
    else if (!row.path) report.missingPath += 1;
    else if (!row.path.startsWith(LEGACY_PREFIX) || row.path.includes("..")) report.invalidPath += 1;
    else report.referenced += 1;
  }
  return report;
}
