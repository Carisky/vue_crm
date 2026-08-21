export type ContentDisposition = "inline" | "attachment";

export function sanitizeDownloadName(value: string): string {
  const withoutControls = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0)!;
    if (
      codePoint <= 0x1f ||
      codePoint === 0x7f ||
      (character.length === 1 && codePoint >= 0xd800 && codePoint <= 0xdfff)
    ) {
      return "";
    }
    return character === "/" || character === "\\" ? "_" : character;
  })
    .join("")
    .trim();

  return withoutControls || "download";
}

function asciiFallback(value: string): string {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint >= 0x20 && codePoint <= 0x7e ? character : "_";
  })
    .join("")
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"');
}

function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function buildContentDisposition(
  disposition: ContentDisposition,
  filename: string,
): string {
  const safeName = sanitizeDownloadName(filename);
  return `${disposition}; filename="${asciiFallback(safeName)}"; filename*=UTF-8''${encodeRfc5987(safeName)}`;
}
