import "dotenv/config";
import { createWriteStream } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { finished } from "node:stream/promises";
import { Prisma } from "@prisma/client";
import archiver from "archiver";
import prisma from "../server/lib/prisma.ts";
import {
  buildMattermostImport,
  type MattermostExportSnapshot,
} from "../server/lib/mattermost/export.ts";

async function readSnapshot(): Promise<MattermostExportSnapshot> {
  return prisma.$transaction(
    async (tx) => {
      const snapshotCutoff = new Date();
      const [users, workspaces, memberships, conversations, messages] =
        await Promise.all([
          tx.user.findMany({
            select: {
              id: true,
              email: true,
              name: true,
              emailVerifiedAt: true,
              locale: true,
            },
          }),
          tx.workspace.findMany({
            select: { id: true, name: true, ownerId: true },
          }),
          tx.member.findMany({
            select: { workspaceId: true, userId: true, role: true },
          }),
          tx.conversation.findMany({
            select: {
              id: true,
              workspaceId: true,
              type: true,
              name: true,
              participants: { select: { userId: true } },
            },
          }),
          tx.conversationMessage.findMany({
            where: { createdAt: { lte: snapshotCutoff } },
            select: {
              id: true,
              conversationId: true,
              senderId: true,
              body: true,
              createdAt: true,
            },
          }),
        ]);

      return {
        snapshotCutoff,
        users,
        workspaces,
        memberships: memberships.map((membership) => ({
          ...membership,
          role: membership.role === "ADMIN" ? "ADMIN" : "MEMBER",
        })),
        conversations: conversations.map((conversation) => ({
          id: conversation.id,
          workspaceId: conversation.workspaceId,
          type: conversation.type,
          name: conversation.name,
          participantIds: conversation.participants.map(
            (participant) => participant.userId,
          ),
        })),
        messages,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      maxWait: 10_000,
      timeout: 120_000,
    },
  );
}

async function createZip(sourcePath: string, archivePath: string) {
  const output = createWriteStream(archivePath, {
    flags: "wx",
    mode: 0o600,
  });
  const completion = finished(output);
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (error) => output.destroy(error));
  archive.pipe(output);
  archive.file(sourcePath, {
    name: "mattermost-import.jsonl",
    date: new Date(0),
    mode: 0o600,
  });
  await archive.finalize();
  await completion;
}

async function main() {
  const configuredRoot = process.env.MATTERMOST_IMPORT_DIR;
  if (!configuredRoot) {
    throw new Error("MATTERMOST_IMPORT_DIR is required");
  }
  const importRoot = resolve(configuredRoot);
  await mkdir(importRoot, { recursive: true, mode: 0o700 });
  const temporaryDirectory = await mkdtemp(join(importRoot, ".export-"));

  try {
    const snapshot = await readSnapshot();
    const result = buildMattermostImport(snapshot);
    const timestamp = result.manifest.snapshotCutoff.replace(/[:.]/g, "-");
    const archivePath = join(importRoot, `mattermost-import-${timestamp}.zip`);
    const manifestPath = `${archivePath}.manifest.json`;
    const jsonlPath = join(temporaryDirectory, "mattermost-import.jsonl");

    await writeFile(jsonlPath, result.jsonl, { encoding: "utf8", mode: 0o600 });
    await chmod(jsonlPath, 0o600);
    await createZip(jsonlPath, archivePath);
    await writeFile(
      manifestPath,
      `${JSON.stringify(result.manifest, null, 2)}\n`,
      {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      },
    );
    // Docker preserves this mode when copying the archive into Mattermost.
    // The parent import directory is owner-only; the container's Mattermost
    // user still needs to read the copied archive under /tmp.
    await chmod(archivePath, 0o644);
    await chmod(manifestPath, 0o600);

    process.stdout.write(
      `${JSON.stringify({ archivePath, manifestPath, ...result.manifest })}\n`,
    );
  } finally {
    const resolvedTemporaryDirectory = resolve(temporaryDirectory);
    if (dirname(resolvedTemporaryDirectory) !== importRoot) {
      throw new Error("Refusing to remove an unexpected export directory");
    }
    await rm(resolvedTemporaryDirectory, { recursive: true, force: true });
  }
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Export failed";
    process.stderr.write(`Mattermost export failed: ${message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
