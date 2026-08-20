import {
  open,
  readFile,
  stat as fileStat,
  type FileHandle,
} from "node:fs/promises";
import { extname } from "node:path";
import { inflateRawSync } from "node:zlib";

import { fileTypeFromFile, type FileTypeResult } from "file-type";

export type MediaKind = "image" | "video" | "pdf" | "document";

export type ValidatedMedia = {
  mime: string;
  extension: string;
  kind: MediaKind;
  disposition: "inline" | "attachment";
};

type Policy = ValidatedMedia & {
  detectedExtensions: readonly string[];
  validation:
    | "binary"
    | "cfb"
    | "ooxml"
    | "opendocument"
    | "svg"
    | "rtf"
    | "csv";
  packageRoot?: string;
};

const TEXT_INSPECTION_LIMIT_BYTES = 256 * 1024;
const ZIP_METADATA_LIMIT_BYTES = 4 * 1024 * 1024;
const ZIP_ENTRY_LIMIT = 2048;
const ZIP_TEXT_ENTRY_LIMIT_BYTES = 256 * 1024;

const policies = {
  jpg: policy("image/jpeg", "jpg", "image", "inline", "binary", ["jpg"]),
  jpeg: policy("image/jpeg", "jpeg", "image", "inline", "binary", ["jpg"]),
  png: policy("image/png", "png", "image", "inline", "binary", ["png"]),
  webp: policy("image/webp", "webp", "image", "inline", "binary", ["webp"]),
  gif: policy("image/gif", "gif", "image", "inline", "binary", ["gif"]),
  mp4: policy("video/mp4", "mp4", "video", "inline", "binary", ["mp4"]),
  webm: policy("video/webm", "webm", "video", "inline", "binary", ["webm"]),
  pdf: policy("application/pdf", "pdf", "pdf", "inline", "binary", ["pdf"]),
  svg: policy("image/svg+xml", "svg", "image", "attachment", "svg", ["xml"]),
  doc: policy("application/msword", "doc", "document", "attachment", "cfb", [
    "cfb",
  ]),
  docx: packagePolicy(
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "docx",
    "ooxml",
    "word/document.xml",
  ),
  xls: policy(
    "application/vnd.ms-excel",
    "xls",
    "document",
    "attachment",
    "cfb",
    ["cfb"],
  ),
  xlsx: packagePolicy(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xlsx",
    "ooxml",
    "xl/workbook.xml",
  ),
  ppt: policy(
    "application/vnd.ms-powerpoint",
    "ppt",
    "document",
    "attachment",
    "cfb",
    ["cfb"],
  ),
  pptx: packagePolicy(
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "pptx",
    "ooxml",
    "ppt/presentation.xml",
  ),
  odt: packagePolicy(
    "application/vnd.oasis.opendocument.text",
    "odt",
    "opendocument",
  ),
  ods: packagePolicy(
    "application/vnd.oasis.opendocument.spreadsheet",
    "ods",
    "opendocument",
  ),
  odp: packagePolicy(
    "application/vnd.oasis.opendocument.presentation",
    "odp",
    "opendocument",
  ),
  rtf: policy("application/rtf", "rtf", "document", "attachment", "rtf", [
    "rtf",
  ]),
  csv: policy("text/csv", "csv", "document", "attachment", "csv", []),
} satisfies Record<string, Policy>;

const approvedExtensions = new Set(Object.keys(policies));
const suspiciousInnerExtensions = new Set([
  ...approvedExtensions,
  "bat",
  "cmd",
  "com",
  "docm",
  "exe",
  "html",
  "jar",
  "js",
  "msi",
  "php",
  "ps1",
  "pptm",
  "scr",
  "sh",
  "vbs",
  "xlsm",
  "zip",
]);

export const MEDIA_ACCEPT_ATTRIBUTE =
  ".jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.pdf,.svg,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf,.csv";

export class UnsupportedMediaTypeError extends Error {
  constructor() {
    super("Unsupported media type.");
    this.name = "UnsupportedMediaTypeError";
  }
}

function policy(
  mime: string,
  extension: string,
  kind: MediaKind,
  disposition: "inline" | "attachment",
  validation: Policy["validation"],
  detectedExtensions: readonly string[],
): Policy {
  return { mime, extension, kind, disposition, validation, detectedExtensions };
}

function packagePolicy(
  mime: string,
  extension: string,
  validation: "ooxml" | "opendocument",
  packageRoot?: string,
): Policy {
  return {
    ...policy(mime, extension, "document", "attachment", validation, [
      extension,
    ]),
    packageRoot,
  };
}

function unsupported(): never {
  throw new UnsupportedMediaTypeError();
}

function normalizeClaimedMime(
  value: string | null | undefined,
): string | undefined {
  if (value == null || value.trim() === "") {
    return undefined;
  }

  const [mime, ...parameters] = value.split(";");
  if (!mime || parameters.some((parameter) => parameter.trim() === "")) {
    unsupported();
  }
  return mime.trim().toLowerCase();
}

function resolvePolicy(originalName: string): Policy {
  if (
    typeof originalName !== "string" ||
    originalName.trim() === "" ||
    originalName !== originalName.trim() ||
    /[\0\r\n/\\]/u.test(originalName)
  ) {
    unsupported();
  }

  const extensionWithDot = extname(originalName).toLowerCase();
  if (extensionWithDot.length <= 1) {
    unsupported();
  }

  const extension = extensionWithDot.slice(1);
  const selected = policies[extension as keyof typeof policies] as
    | Policy
    | undefined;
  if (!selected) {
    unsupported();
  }

  const nameParts = originalName.toLowerCase().split(".");
  if (
    nameParts.slice(1, -1).some((part) => suspiciousInnerExtensions.has(part))
  ) {
    unsupported();
  }

  return selected;
}

function detectionMatches(
  detected: FileTypeResult | undefined,
  selected: Policy,
): boolean {
  return Boolean(
    detected &&
      selected.detectedExtensions.includes(detected.ext.toLowerCase()) &&
      (selected.validation === "cfb" ||
        detected.mime.toLowerCase() === selected.mime),
  );
}

async function inspectBoundedUtf8(path: string): Promise<string> {
  const metadata = await fileStat(path);
  if (metadata.size <= 0 || metadata.size > TEXT_INSPECTION_LIMIT_BYTES) {
    unsupported();
  }

  const content = await readFile(path);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    return unsupported();
  }
}

async function validateText(
  path: string,
  selected: Policy,
  detected: FileTypeResult | undefined,
) {
  if (selected.validation === "svg") {
    if (
      !detected ||
      detected.ext !== "xml" ||
      detected.mime !== "application/xml"
    ) {
      unsupported();
    }
  } else if (selected.validation === "rtf") {
    if (!detectionMatches(detected, selected)) {
      unsupported();
    }
  } else if (detected) {
    unsupported();
  }

  const content = (await inspectBoundedUtf8(path)).replace(/^\uFEFF/u, "");
  if (/\u0000/u.test(content)) {
    unsupported();
  }

  if (selected.validation === "svg") {
    const withoutPreamble = content
      .replace(/^\s*<\?xml[\s\S]*?\?>/iu, "")
      .replace(/^(?:\s*<!--[\s\S]*?-->\s*)*/u, "")
      .trimStart();
    if (!/^<svg(?:\s|>)/iu.test(withoutPreamble)) {
      unsupported();
    }
    return;
  }

  if (selected.validation === "rtf") {
    if (!/^\{\\rtf\d+(?:\\|\s)/u.test(content)) {
      unsupported();
    }
    return;
  }

  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(content)) {
    unsupported();
  }
  const firstContentLine = content
    .split(/\r?\n/u)
    .find((line) => line.trim() !== "");
  if (!firstContentLine || !/[,;\t]/u.test(firstContentLine)) {
    unsupported();
  }
}

type ZipEntry = {
  name: string;
  flags: number;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

async function readExact(
  handle: FileHandle,
  length: number,
  position: number,
): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  if (bytesRead !== length) {
    unsupported();
  }
  return buffer;
}

function decodeZipName(buffer: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return unsupported();
  }
}

async function readZipDirectory(
  path: string,
): Promise<{ handle: FileHandle; entries: Map<string, ZipEntry> }> {
  const handle = await open(path, "r");
  try {
    const metadata = await handle.stat();
    const tailLength = Math.min(metadata.size, 65_557);
    const tail = await readExact(
      handle,
      tailLength,
      metadata.size - tailLength,
    );
    let endOffset = -1;
    for (let offset = tail.length - 22; offset >= 0; offset -= 1) {
      if (tail.readUInt32LE(offset) === 0x06054b50) {
        endOffset = offset;
        break;
      }
    }
    if (endOffset < 0) {
      unsupported();
    }

    const disk = tail.readUInt16LE(endOffset + 4);
    const directoryDisk = tail.readUInt16LE(endOffset + 6);
    const entriesOnDisk = tail.readUInt16LE(endOffset + 8);
    const entryCount = tail.readUInt16LE(endOffset + 10);
    const directorySize = tail.readUInt32LE(endOffset + 12);
    const directoryOffset = tail.readUInt32LE(endOffset + 16);
    const commentLength = tail.readUInt16LE(endOffset + 20);
    if (
      disk !== 0 ||
      directoryDisk !== 0 ||
      entriesOnDisk !== entryCount ||
      entryCount === 0 ||
      entryCount > ZIP_ENTRY_LIMIT ||
      directorySize > ZIP_METADATA_LIMIT_BYTES ||
      endOffset + 22 + commentLength !== tail.length ||
      directoryOffset + directorySize > metadata.size
    ) {
      unsupported();
    }

    const directory = await readExact(handle, directorySize, directoryOffset);
    const entries = new Map<string, ZipEntry>();
    let offset = 0;
    for (let index = 0; index < entryCount; index += 1) {
      if (
        offset + 46 > directory.length ||
        directory.readUInt32LE(offset) !== 0x02014b50
      ) {
        unsupported();
      }
      const flags = directory.readUInt16LE(offset + 8);
      const method = directory.readUInt16LE(offset + 10);
      const compressedSize = directory.readUInt32LE(offset + 20);
      const uncompressedSize = directory.readUInt32LE(offset + 24);
      const nameLength = directory.readUInt16LE(offset + 28);
      const extraLength = directory.readUInt16LE(offset + 30);
      const entryCommentLength = directory.readUInt16LE(offset + 32);
      const diskStart = directory.readUInt16LE(offset + 34);
      const localHeaderOffset = directory.readUInt32LE(offset + 42);
      const nextOffset =
        offset + 46 + nameLength + extraLength + entryCommentLength;
      if (
        nameLength === 0 ||
        nextOffset > directory.length ||
        diskStart !== 0 ||
        (flags & 1) !== 0
      ) {
        unsupported();
      }

      const name = decodeZipName(
        directory.subarray(offset + 46, offset + 46 + nameLength),
      );
      const pathWithoutDirectoryMarker = name.endsWith("/")
        ? name.slice(0, -1)
        : name;
      if (
        pathWithoutDirectoryMarker === "" ||
        name.startsWith("/") ||
        name.includes("\\") ||
        pathWithoutDirectoryMarker
          .split("/")
          .some((part) => part === "" || part === "." || part === "..") ||
        entries.has(name)
      ) {
        unsupported();
      }
      entries.set(name, {
        name,
        flags,
        method,
        compressedSize,
        uncompressedSize,
        localHeaderOffset,
      });
      offset = nextOffset;
    }
    if (offset !== directory.length) {
      unsupported();
    }

    return { handle, entries };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function readZipEntry(
  handle: FileHandle,
  entry: ZipEntry,
): Promise<Buffer> {
  if (
    entry.uncompressedSize > ZIP_TEXT_ENTRY_LIMIT_BYTES ||
    entry.compressedSize > ZIP_TEXT_ENTRY_LIMIT_BYTES ||
    ![0, 8].includes(entry.method)
  ) {
    unsupported();
  }

  const localHeader = await readExact(handle, 30, entry.localHeaderOffset);
  if (localHeader.readUInt32LE(0) !== 0x04034b50) {
    unsupported();
  }
  const localFlags = localHeader.readUInt16LE(6);
  const localMethod = localHeader.readUInt16LE(8);
  const nameLength = localHeader.readUInt16LE(26);
  const extraLength = localHeader.readUInt16LE(28);
  if ((localFlags & 1) !== 0 || localMethod !== entry.method) {
    unsupported();
  }

  const localName = decodeZipName(
    await readExact(handle, nameLength, entry.localHeaderOffset + 30),
  );
  if (localName !== entry.name) {
    unsupported();
  }
  const dataOffset = entry.localHeaderOffset + 30 + nameLength + extraLength;
  const compressed = await readExact(handle, entry.compressedSize, dataOffset);
  const content =
    entry.method === 0
      ? compressed
      : inflateRawSync(compressed, {
          maxOutputLength: ZIP_TEXT_ENTRY_LIMIT_BYTES,
        });
  if (content.length !== entry.uncompressedSize) {
    unsupported();
  }
  return content;
}

function decodePackageText(content: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    return unsupported();
  }
}

async function validatePackage(path: string, selected: Policy) {
  const { handle, entries } = await readZipDirectory(path);
  try {
    if (selected.validation === "ooxml") {
      if (
        !selected.packageRoot ||
        !entries.has("[Content_Types].xml") ||
        !entries.has("_rels/.rels") ||
        !entries.has(selected.packageRoot)
      ) {
        unsupported();
      }
      const contentTypes = decodePackageText(
        await readZipEntry(handle, entries.get("[Content_Types].xml")!),
      );
      if (
        !contentTypes.includes(`PartName="/${selected.packageRoot}"`) ||
        !contentTypes.includes(`ContentType="${selected.mime}.main+xml"`)
      ) {
        unsupported();
      }
      return;
    }

    if (
      !entries.has("mimetype") ||
      !entries.has("content.xml") ||
      !entries.has("META-INF/manifest.xml")
    ) {
      unsupported();
    }
    const packageMime = decodePackageText(
      await readZipEntry(handle, entries.get("mimetype")!),
    );
    if (packageMime !== selected.mime) {
      unsupported();
    }
  } finally {
    await handle.close();
  }
}

const CFB_SIGNATURE = Buffer.from("d0cf11e0a1b11ae1", "hex");
const CFB_FREE_SECTOR = 0xffffffff;
const CFB_END_OF_CHAIN = 0xfffffffe;
const CFB_MAX_REGULAR_SECTOR = 0xfffffffa;

async function validateCfbFamily(path: string, extension: string) {
  const handle = await open(path, "r");
  try {
    const metadata = await handle.stat();
    if (metadata.size < 1536) {
      unsupported();
    }
    const header = await readExact(handle, 512, 0);
    if (
      !header.subarray(0, 8).equals(CFB_SIGNATURE) ||
      header.readUInt16LE(28) !== 0xfffe
    ) {
      unsupported();
    }
    const majorVersion = header.readUInt16LE(26);
    const sectorShift = header.readUInt16LE(30);
    const sectorSize = 2 ** sectorShift;
    if (
      !(
        (majorVersion === 3 && sectorSize === 512) ||
        (majorVersion === 4 && sectorSize === 4096)
      )
    ) {
      unsupported();
    }

    const sectorCount = Math.floor(metadata.size / sectorSize) - 1;
    const readSector = async (sectorId: number) => {
      if (sectorId >= CFB_MAX_REGULAR_SECTOR || sectorId >= sectorCount) {
        unsupported();
      }
      return readExact(handle, sectorSize, (sectorId + 1) * sectorSize);
    };

    const fatSectorCount = header.readUInt32LE(44);
    if (fatSectorCount === 0 || fatSectorCount > 4096) {
      unsupported();
    }
    const fatSectors: number[] = [];
    for (
      let offset = 76;
      offset < 512 && fatSectors.length < fatSectorCount;
      offset += 4
    ) {
      const sectorId = header.readUInt32LE(offset);
      if (sectorId < CFB_MAX_REGULAR_SECTOR) {
        fatSectors.push(sectorId);
      }
    }

    let difatSector = header.readUInt32LE(68);
    const difatCount = header.readUInt32LE(72);
    for (
      let index = 0;
      index < difatCount && fatSectors.length < fatSectorCount;
      index += 1
    ) {
      const difat = await readSector(difatSector);
      for (
        let offset = 0;
        offset < sectorSize - 4 && fatSectors.length < fatSectorCount;
        offset += 4
      ) {
        const sectorId = difat.readUInt32LE(offset);
        if (sectorId < CFB_MAX_REGULAR_SECTOR) {
          fatSectors.push(sectorId);
        }
      }
      difatSector = difat.readUInt32LE(sectorSize - 4);
    }
    if (
      fatSectors.length !== fatSectorCount ||
      new Set(fatSectors).size !== fatSectors.length
    ) {
      unsupported();
    }

    const fatCache = new Map<number, Buffer>();
    const nextSector = async (sectorId: number) => {
      const entriesPerSector = sectorSize / 4;
      const fatIndex = Math.floor(sectorId / entriesPerSector);
      const fatSectorId = fatSectors[fatIndex];
      if (fatSectorId === undefined) {
        unsupported();
      }
      let fat = fatCache.get(fatSectorId);
      if (!fat) {
        fat = await readSector(fatSectorId);
        fatCache.set(fatSectorId, fat);
      }
      return fat.readUInt32LE((sectorId % entriesPerSector) * 4);
    };

    const streamNames = new Set<string>();
    const visited = new Set<number>();
    let directorySector = header.readUInt32LE(48);
    while (directorySector !== CFB_END_OF_CHAIN) {
      if (visited.has(directorySector) || visited.size >= 1024) {
        unsupported();
      }
      visited.add(directorySector);
      const directory = await readSector(directorySector);
      for (let offset = 0; offset + 128 <= directory.length; offset += 128) {
        const type = directory.readUInt8(offset + 66);
        const nameLength = directory.readUInt16LE(offset + 64);
        if (type !== 2) {
          continue;
        }
        if (nameLength < 2 || nameLength > 64 || nameLength % 2 !== 0) {
          unsupported();
        }
        const name = directory
          .subarray(offset, offset + nameLength - 2)
          .toString("utf16le");
        streamNames.add(name);
      }
      directorySector = await nextSector(directorySector);
      if (
        directorySector > CFB_MAX_REGULAR_SECTOR &&
        directorySector !== CFB_END_OF_CHAIN
      ) {
        unsupported();
      }
    }

    const detectedFamilies = new Set<string>();
    if (streamNames.has("WordDocument")) detectedFamilies.add("doc");
    if (streamNames.has("Workbook") || streamNames.has("Book"))
      detectedFamilies.add("xls");
    if (streamNames.has("PowerPoint Document")) detectedFamilies.add("ppt");
    if (detectedFamilies.size !== 1 || !detectedFamilies.has(extension)) {
      unsupported();
    }
  } finally {
    await handle.close();
  }
}

export function mediaKindFromMime(mime: string): MediaKind {
  const normalized = mime.trim().toLowerCase();
  const selected = Object.values(policies).find(
    (candidate) => candidate.mime === normalized,
  );
  return selected?.kind ?? unsupported();
}

export async function validateMediaFile(input: {
  path: string;
  originalName: string;
  claimedMime?: string | null;
}): Promise<ValidatedMedia> {
  try {
    const selected = resolvePolicy(input.originalName);
    const claimedMime = normalizeClaimedMime(input.claimedMime);
    if (claimedMime && claimedMime !== selected.mime) {
      unsupported();
    }

    const detected = await fileTypeFromFile(input.path);
    if (["svg", "rtf", "csv"].includes(selected.validation)) {
      await validateText(input.path, selected, detected);
    } else {
      if (!detectionMatches(detected, selected)) {
        unsupported();
      }
      if (selected.validation === "cfb") {
        await validateCfbFamily(input.path, selected.extension);
      } else if (
        selected.validation === "ooxml" ||
        selected.validation === "opendocument"
      ) {
        await validatePackage(input.path, selected);
      }
    }

    return {
      mime: selected.mime,
      extension: selected.extension,
      kind: selected.kind,
      disposition: selected.disposition,
    };
  } catch (error) {
    if (error instanceof UnsupportedMediaTypeError) {
      throw error;
    }
    throw new UnsupportedMediaTypeError();
  }
}
