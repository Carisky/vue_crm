import { promises as fs } from "node:fs";
import { dirname, resolve, posix } from "node:path";

import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

import { resolveTaskMediaPath } from "~/server/lib/task-media";

const TARGET_HEIGHTS = [720, 480, 360];

const resolveBinaryPath = (value: string | { path: string } | undefined) => {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.path ?? null;
};

const ffmpegPath = resolveBinaryPath(ffmpegStatic);
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
} else {
  console.warn("FFmpeg binary not found, video variants will not be generated");
}

const ffprobePath = resolveBinaryPath(ffprobeStatic);
if (ffprobePath) {
  ffmpeg.setFfprobePath(ffprobePath);
} else {
  console.warn("FFprobe binary not found, video metadata will be unavailable");
}

type VideoProbeStream = {
  codec_type?: string;
  height?: number;
};

type VideoProbeData = {
  streams?: VideoProbeStream[];
};

export type VideoVariant = {
  path: string;
  resolution: number;
};

export type VideoConversionResult = {
  height: number | null;
  variants: VideoVariant[];
};

async function getVideoHeight(filePath: string): Promise<number | null> {
  try {
    const data = await new Promise<VideoProbeData>((resolvePromise, reject) => {
      ffmpeg.ffprobe(filePath, (error, metadata) => {
        if (error) {
          reject(error);
          return;
        }
        resolvePromise(metadata ?? {});
      });
    });
    const stream = (data.streams ?? []).find(
      (entry) =>
        entry.codec_type === "video" && typeof entry.height === "number",
    );
    return stream?.height ?? null;
  } catch (error) {
    console.warn("Failed to probe video metadata", error);
    return null;
  }
}

function buildVariantPaths(mediaPath: string, height: number) {
  const normalized =
    mediaPath.startsWith("/") ? mediaPath.slice(1) : mediaPath;
  const parsed = posix.parse(normalized);
  const variantName = `${parsed.name}-${height}p${parsed.ext}`;
  const variantPath = posix.join(parsed.dir, variantName);
  const relativePath = `/${variantPath}`;
  const absolutePath = resolveTaskMediaPath(relativePath);
  return { relativePath, absolutePath };
}

function transcodeVideo(inputPath: string, outputPath: string, height: number) {
  return new Promise<void>((resolvePromise, reject) => {
    ffmpeg(inputPath)
      .videoCodec("libx264")
      .audioCodec("aac")
      .audioBitrate("128k")
      .outputOptions([
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-movflags",
        "+faststart",
        "-y",
      ])
      .videoFilters(`scale=-2:${height}`)
      .output(outputPath)
      .on("end", () => resolvePromise())
      .on("error", reject)
      .run();
  });
}

export async function generateVideoVariants(
  mediaPath: string,
): Promise<VideoConversionResult> {
  const sourcePath = resolveTaskMediaPath(mediaPath);
  if (!sourcePath) {
    return { height: null, variants: [] };
  }

  const height = await getVideoHeight(sourcePath);
  if (!height) {
    return { height: null, variants: [] };
  }

  const variants: VideoVariant[] = [];
  for (const target of TARGET_HEIGHTS) {
    if (target >= height) {
      continue;
    }

    const { relativePath, absolutePath } = buildVariantPaths(mediaPath, target);
    if (!absolutePath) {
      continue;
    }

    await fs.mkdir(dirname(absolutePath), { recursive: true });

    try {
      await transcodeVideo(sourcePath, absolutePath, target);
      variants.push({ path: relativePath, resolution: target });
    } catch (error) {
      console.warn(
        "Failed to generate video variant",
        target,
        mediaPath,
        (error as Error).message,
      );
    }
  }

  return { height, variants };
}
