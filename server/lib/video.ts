import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

const TARGET_HEIGHTS = [720, 480, 360];

export function selectVariantHeights(height: number | null): number[] {
  return height ? TARGET_HEIGHTS.filter((target) => target < height) : [];
}

const binaryPath = (value: string | { path: string } | null | undefined) =>
  typeof value === "string" ? value : value?.path ?? null;
const ffmpegPath = binaryPath(ffmpegStatic);
const ffprobePath = binaryPath(ffprobeStatic);
if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
if (ffprobePath) ffmpeg.setFfprobePath(ffprobePath);

export async function probeVideoHeight(path: string): Promise<number | null> {
  try {
    const metadata = await new Promise<{ streams?: { codec_type?: string; height?: number }[] }>((resolve, reject) => ffmpeg.ffprobe(path, (error, data) => error ? reject(error) : resolve(data ?? {})));
    return metadata.streams?.find((stream) => stream.codec_type === "video" && typeof stream.height === "number")?.height ?? null;
  } catch { return null; }
}

export function transcodeVideo(inputPath: string, outputPath: string, height: number): Promise<void> {
  return new Promise((resolve, reject) => ffmpeg(inputPath).videoCodec("libx264").audioCodec("aac").audioBitrate("128k").outputOptions(["-preset", "veryfast", "-crf", "23", "-movflags", "+faststart", "-y"]).videoFilters(`scale=-2:${height}`).output(outputPath).on("end", resolve).on("error", reject).run());
}
