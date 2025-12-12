import { Buffer } from "node:buffer";

export async function normalizeImageInput(image?: File | string) {
  if (!image) return null;

  if (typeof image === "string") {
    return image || null;
  }

  const buffer = Buffer.from(await image.arrayBuffer());
  return `data:${image.type};base64,${buffer.toString("base64")}`;
}
