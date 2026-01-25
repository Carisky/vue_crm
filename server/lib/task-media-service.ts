import type { TaskMedia } from "@prisma/client";

import prisma from "~/server/lib/prisma";
import { generateVideoVariants } from "~/server/lib/video";

export type TaskMediaUploadPayload = {
  path: string;
  mime: string | null;
  original_name: string | null;
};

async function attachVideoVariants(media: TaskMedia) {
  if (!media.mime?.startsWith("video")) {
    return;
  }

  try {
    const { height, variants } = await generateVideoVariants(media.path);
    if (height) {
      await prisma.taskMedia.update({
        where: { id: media.id },
        data: { resolution: height },
      });
    }

    if (!variants.length) {
      return;
    }

    await prisma.taskMediaVariant.createMany({
      data: variants.map((variant) => ({
        taskMediaId: media.id,
        path: variant.path,
        mime: media.mime,
        resolution: variant.resolution,
      })),
    });
  } catch (error) {
    console.warn("Failed to generate video variants for media", media.path, error);
  }
}

export async function attachMediaToTask(
  taskId: string,
  files: TaskMediaUploadPayload[],
) {
  const created: TaskMedia[] = [];
  for (const file of files) {
    const media = await prisma.taskMedia.create({
      data: {
        taskId,
        path: file.path,
        mime: file.mime,
        originalName: file.original_name ?? null,
      },
    });
    created.push(media);
  }

  await Promise.all(created.map((media) => attachVideoVariants(media)));

  return created;
}
