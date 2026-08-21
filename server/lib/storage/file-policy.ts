import {
  open,
  readFile,
  stat as fileStat,
  type FileHandle,
} from "node:fs/promises";
import { extname } from "node:path";
import { inflateRawSync } from "node:zlib";

import CFB, { type CFB$Container, type CFB$Entry } from "cfb";
import { fileTypeFromFile, type FileTypeResult } from "file-type";
import { XMLParser, XMLValidator } from "fast-xml-parser";

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

type XmlAttribute = {
  localName: string;
  namespaceUri?: string;
  value: string;
};

type XmlElement = {
  localName: string;
  namespaceUri?: string;
  attributes: XmlAttribute[];
  children: XmlElement[];
};

const xmlParser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  parseAttributeValue: false,
  parseTagValue: false,
  processEntities: false,
  commentPropName: "#comment",
});

function splitQualifiedName(name: string): {
  prefix?: string;
  localName: string;
} {
  const separator = name.indexOf(":");
  if (separator < 0) {
    return { localName: name };
  }
  if (
    separator === 0 ||
    separator === name.length - 1 ||
    name.indexOf(":", separator + 1) >= 0
  ) {
    unsupported();
  }
  return {
    prefix: name.slice(0, separator),
    localName: name.slice(separator + 1),
  };
}

function normalizeXmlAttributeValue(value: string): string {
  const reference = /&(?:#(\d+)|#x([\dA-Fa-f]+)|(amp|lt|gt|quot|apos));/gu;
  if (value.replace(reference, "").includes("&")) {
    unsupported();
  }
  return value.replace(
    reference,
    (_match, decimal: string, hexadecimal: string, named: string) => {
      if (named) {
        return (
          {
            amp: "&",
            apos: "'",
            gt: ">",
            lt: "<",
            quot: '"',
          } as const
        )[named as "amp" | "apos" | "gt" | "lt" | "quot"];
      }
      const codePoint = Number.parseInt(
        decimal || hexadecimal,
        decimal ? 10 : 16,
      );
      if (
        codePoint !== 0x09 &&
        codePoint !== 0x0a &&
        codePoint !== 0x0d &&
        (codePoint < 0x20 ||
          (codePoint > 0xd7ff && codePoint < 0xe000) ||
          (codePoint > 0xfffd && codePoint < 0x10000) ||
          codePoint > 0x10ffff)
      ) {
        unsupported();
      }
      return String.fromCodePoint(codePoint);
    },
  );
}

function parseXmlElements(
  nodes: unknown,
  inheritedNamespaces: ReadonlyMap<string, string>,
): XmlElement[] {
  if (!Array.isArray(nodes)) {
    unsupported();
  }

  const elements: XmlElement[] = [];
  for (const node of nodes) {
    if (typeof node !== "object" || node === null || Array.isArray(node)) {
      unsupported();
    }
    const record = node as Record<string, unknown>;
    const contentKeys = Object.keys(record).filter((key) => key !== ":@");
    if (contentKeys.length !== 1) {
      unsupported();
    }
    const qualifiedName = contentKeys[0]!;
    if (qualifiedName === "#comment" || qualifiedName === "?xml") {
      continue;
    }
    if (qualifiedName === "#text" || qualifiedName === "#cdata") {
      continue;
    }
    if (
      qualifiedName.startsWith("#") ||
      qualifiedName.startsWith("!") ||
      qualifiedName.startsWith("?")
    ) {
      unsupported();
    }

    const rawAttributes = record[":@"];
    if (
      rawAttributes !== undefined &&
      (typeof rawAttributes !== "object" ||
        rawAttributes === null ||
        Array.isArray(rawAttributes))
    ) {
      unsupported();
    }
    const attributeRecord = (rawAttributes ?? {}) as Record<string, unknown>;
    const namespaces = new Map(inheritedNamespaces);
    for (const [rawName, rawValue] of Object.entries(attributeRecord)) {
      if (!rawName.startsWith("@_") || typeof rawValue !== "string") {
        unsupported();
      }
      const attributeName = rawName.slice(2);
      if (attributeName === "xmlns") {
        namespaces.set("", rawValue);
      } else if (attributeName.startsWith("xmlns:")) {
        const prefix = attributeName.slice("xmlns:".length);
        if (!prefix || prefix.includes(":")) {
          unsupported();
        }
        namespaces.set(prefix, rawValue);
      }
    }

    const elementName = splitQualifiedName(qualifiedName);
    const namespaceUri = namespaces.get(elementName.prefix ?? "");
    if (elementName.prefix && !namespaceUri) {
      unsupported();
    }

    const attributes: XmlAttribute[] = [];
    for (const [rawName, rawValue] of Object.entries(attributeRecord)) {
      const attributeName = rawName.slice(2);
      if (attributeName === "xmlns" || attributeName.startsWith("xmlns:")) {
        continue;
      }
      const parsedName = splitQualifiedName(attributeName);
      const attributeNamespace = parsedName.prefix
        ? namespaces.get(parsedName.prefix)
        : undefined;
      if (parsedName.prefix && !attributeNamespace) {
        unsupported();
      }
      attributes.push({
        localName: parsedName.localName,
        namespaceUri: attributeNamespace,
        value: normalizeXmlAttributeValue(rawValue as string),
      });
    }

    elements.push({
      localName: elementName.localName,
      namespaceUri,
      attributes,
      children: parseXmlElements(record[qualifiedName], namespaces),
    });
  }
  return elements;
}

function parseXmlDocument(content: Buffer): XmlElement {
  const text = decodePackageText(content);
  if (text.trim() === "" || /<!DOCTYPE|<!ENTITY/iu.test(text)) {
    unsupported();
  }
  if (XMLValidator.validate(text, { allowBooleanAttributes: false }) !== true) {
    unsupported();
  }

  const roots = parseXmlElements(xmlParser.parse(text) as unknown, new Map());
  if (roots.length !== 1) {
    unsupported();
  }
  return roots[0]!;
}

function hasName(
  element: XmlElement,
  namespaceUri: string,
  localName: string,
): boolean {
  return (
    element.namespaceUri === namespaceUri && element.localName === localName
  );
}

function childrenNamed(
  element: XmlElement,
  namespaceUri: string,
  localName: string,
): XmlElement[] {
  return element.children.filter((child) =>
    hasName(child, namespaceUri, localName),
  );
}

function attributeValue(
  element: XmlElement,
  localName: string,
  namespaceUri?: string,
): string | undefined {
  const matches = element.attributes.filter(
    (attribute) =>
      attribute.localName === localName &&
      attribute.namespaceUri === namespaceUri,
  );
  if (matches.length > 1) {
    unsupported();
  }
  return matches[0]?.value;
}

const CONTENT_TYPES_NAMESPACE =
  "http://schemas.openxmlformats.org/package/2006/content-types";
const PACKAGE_RELATIONSHIPS_NAMESPACE =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE_DOCUMENT_RELATIONSHIPS = new Set([
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
  "http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument",
]);
const ODF_MANIFEST_NAMESPACE =
  "urn:oasis:names:tc:opendocument:xmlns:manifest:1.0";
const ODF_OFFICE_NAMESPACE = "urn:oasis:names:tc:opendocument:xmlns:office:1.0";
const ODF_BODY_ROOTS: Readonly<Record<string, string>> = {
  odt: "text",
  ods: "spreadsheet",
  odp: "presentation",
};
const OOXML_MAIN_ROOTS: Readonly<
  Record<string, { namespaceUri: string; localName: string }>
> = {
  docx: {
    namespaceUri:
      "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    localName: "document",
  },
  xlsx: {
    namespaceUri: "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    localName: "workbook",
  },
  pptx: {
    namespaceUri: "http://schemas.openxmlformats.org/presentationml/2006/main",
    localName: "presentation",
  },
};

function hasMacroArtifact(entries: ReadonlyMap<string, ZipEntry>): boolean {
  return [...entries.keys()].some((name) => {
    const normalized = name.toLowerCase();
    return (
      normalized.endsWith("/vbaproject.bin") ||
      normalized.endsWith("/vbadata.xml") ||
      normalized.startsWith("basic/") ||
      normalized.startsWith("scripts/")
    );
  });
}

async function validateOoxmlPackage(
  handle: FileHandle,
  entries: ReadonlyMap<string, ZipEntry>,
  selected: Policy,
) {
  if (
    !selected.packageRoot ||
    !entries.has("[Content_Types].xml") ||
    !entries.has("_rels/.rels") ||
    !entries.has(selected.packageRoot) ||
    hasMacroArtifact(entries)
  ) {
    unsupported();
  }

  const contentTypes = parseXmlDocument(
    await readZipEntry(handle, entries.get("[Content_Types].xml")!),
  );
  if (!hasName(contentTypes, CONTENT_TYPES_NAMESPACE, "Types")) {
    unsupported();
  }
  const declaredTypes = [
    ...childrenNamed(contentTypes, CONTENT_TYPES_NAMESPACE, "Default"),
    ...childrenNamed(contentTypes, CONTENT_TYPES_NAMESPACE, "Override"),
  ];
  if (
    declaredTypes.some((element) => {
      const contentType =
        attributeValue(element, "ContentType")?.toLowerCase() ?? "";
      return (
        contentType.includes("macroenabled") ||
        contentType.includes("vbaproject")
      );
    })
  ) {
    unsupported();
  }
  const expectedOverrides = childrenNamed(
    contentTypes,
    CONTENT_TYPES_NAMESPACE,
    "Override",
  ).filter(
    (element) =>
      attributeValue(element, "PartName") === `/${selected.packageRoot}` &&
      attributeValue(element, "ContentType") === `${selected.mime}.main+xml`,
  );
  if (expectedOverrides.length !== 1) {
    unsupported();
  }

  const relationships = parseXmlDocument(
    await readZipEntry(handle, entries.get("_rels/.rels")!),
  );
  if (
    !hasName(relationships, PACKAGE_RELATIONSHIPS_NAMESPACE, "Relationships")
  ) {
    unsupported();
  }
  const officeRelationships = childrenNamed(
    relationships,
    PACKAGE_RELATIONSHIPS_NAMESPACE,
    "Relationship",
  ).filter((element) => {
    const type = attributeValue(element, "Type");
    return type !== undefined && OFFICE_DOCUMENT_RELATIONSHIPS.has(type);
  });
  if (officeRelationships.length !== 1) {
    unsupported();
  }
  const relationship = officeRelationships[0]!;
  const target = attributeValue(relationship, "Target")?.replace(/^\//u, "");
  if (
    target !== selected.packageRoot ||
    attributeValue(relationship, "TargetMode") === "External" ||
    !attributeValue(relationship, "Id")
  ) {
    unsupported();
  }

  const mainRoot = parseXmlDocument(
    await readZipEntry(handle, entries.get(selected.packageRoot)!),
  );
  const expectedRoot = OOXML_MAIN_ROOTS[selected.extension];
  if (
    !expectedRoot ||
    !hasName(mainRoot, expectedRoot.namespaceUri, expectedRoot.localName)
  ) {
    unsupported();
  }
}

async function validateOpenDocumentPackage(
  handle: FileHandle,
  entries: ReadonlyMap<string, ZipEntry>,
  selected: Policy,
) {
  if (
    !entries.has("mimetype") ||
    !entries.has("content.xml") ||
    !entries.has("META-INF/manifest.xml") ||
    hasMacroArtifact(entries)
  ) {
    unsupported();
  }
  const packageMime = decodePackageText(
    await readZipEntry(handle, entries.get("mimetype")!),
  );
  if (packageMime !== selected.mime) {
    unsupported();
  }

  const manifest = parseXmlDocument(
    await readZipEntry(handle, entries.get("META-INF/manifest.xml")!),
  );
  if (!hasName(manifest, ODF_MANIFEST_NAMESPACE, "manifest")) {
    unsupported();
  }
  const manifestEntries = childrenNamed(
    manifest,
    ODF_MANIFEST_NAMESPACE,
    "file-entry",
  );
  const rootIdentities = manifestEntries.filter(
    (element) =>
      attributeValue(element, "full-path", ODF_MANIFEST_NAMESPACE) === "/" &&
      attributeValue(element, "media-type", ODF_MANIFEST_NAMESPACE) ===
        selected.mime,
  );
  const contentIdentities = manifestEntries.filter(
    (element) =>
      attributeValue(element, "full-path", ODF_MANIFEST_NAMESPACE) ===
        "content.xml" &&
      attributeValue(element, "media-type", ODF_MANIFEST_NAMESPACE) ===
        "text/xml",
  );
  if (rootIdentities.length !== 1 || contentIdentities.length !== 1) {
    unsupported();
  }

  const content = parseXmlDocument(
    await readZipEntry(handle, entries.get("content.xml")!),
  );
  if (!hasName(content, ODF_OFFICE_NAMESPACE, "document-content")) {
    unsupported();
  }
  const bodies = childrenNamed(content, ODF_OFFICE_NAMESPACE, "body");
  const expectedBodyRoot = ODF_BODY_ROOTS[selected.extension];
  if (
    bodies.length !== 1 ||
    !expectedBodyRoot ||
    bodies[0]!.children.length !== 1 ||
    childrenNamed(bodies[0]!, ODF_OFFICE_NAMESPACE, expectedBodyRoot).length !==
      1
  ) {
    unsupported();
  }
}

async function validatePackage(path: string, selected: Policy) {
  const { handle, entries } = await readZipDirectory(path);
  try {
    if (selected.validation === "ooxml") {
      await validateOoxmlPackage(handle, entries, selected);
      return;
    }
    await validateOpenDocumentPackage(handle, entries, selected);
  } finally {
    await handle.close();
  }
}

function liveCfbStream(
  container: CFB$Container,
  acceptedNames: readonly string[],
): Buffer | undefined {
  const names = new Set(acceptedNames.map((name) => name.toLowerCase()));
  const reachableIndexes = reachableCfbEntryIndexes(container);
  const matches = container.FileIndex.flatMap((entry, index) => {
    if (
      entry.type !== 2 ||
      !names.has(entry.name.toLowerCase()) ||
      !reachableIndexes.has(index)
    ) {
      return [];
    }
    return [entry as CFB$Entry];
  });
  if (matches.length > 1) {
    unsupported();
  }
  const entry = matches[0];
  if (!entry || entry.size <= 0 || entry.content.length < entry.size) {
    return undefined;
  }
  return Buffer.from(entry.content).subarray(0, entry.size);
}

type CfbTreeEntry = CFB$Entry & { L: number; R: number; C: number };

function reachableCfbEntryIndexes(container: CFB$Container): Set<number> {
  const root = container.FileIndex[0] as CfbTreeEntry | undefined;
  if (!root || root.type !== 5) {
    unsupported();
  }

  const reachable = new Set<number>();
  const pending = [0];
  while (pending.length > 0) {
    const index = pending.pop()!;
    if (reachable.has(index)) {
      unsupported();
    }
    const entry = container.FileIndex[index] as CfbTreeEntry | undefined;
    if (!entry || ![1, 2, 5].includes(entry.type)) {
      unsupported();
    }
    reachable.add(index);

    const pointers = [entry.L, entry.R];
    if (entry.type === 1 || entry.type === 5) {
      pointers.push(entry.C);
    } else if (entry.C !== -1) {
      unsupported();
    }
    for (const pointer of pointers) {
      if (pointer === -1) {
        continue;
      }
      if (
        !Number.isInteger(pointer) ||
        pointer < 0 ||
        pointer >= container.FileIndex.length
      ) {
        unsupported();
      }
      pending.push(pointer);
    }
  }
  return reachable;
}

function hasCfbMacroArtifact(container: CFB$Container): boolean {
  return container.FullPaths.some((path) => {
    const segments = path
      .toLowerCase()
      .split("/")
      .filter((segment) => segment !== "");
    return segments.includes("vba") || segments.includes("_vba_project");
  });
}

const SUPPORTED_WORD_FIB_VERSIONS = new Set([
  0x0065, 0x0067, 0x00c1, 0x00d9, 0x0101, 0x010c, 0x0112,
]);

function validateWordPieceTable(
  wordDocument: Buffer,
  table: Buffer,
  fibVariableOffset: number,
) {
  const fibLongWordCountOffset = fibVariableOffset + 2 + 28;
  if (fibLongWordCountOffset + 2 > wordDocument.length) {
    unsupported();
  }
  const fibLongWordCount = wordDocument.readUInt16LE(fibLongWordCountOffset);
  const fibPairCountOffset = fibLongWordCountOffset + 2 + fibLongWordCount * 4;
  if (fibLongWordCount < 4 || fibPairCountOffset + 2 > wordDocument.length) {
    unsupported();
  }
  const fibPairCount = wordDocument.readUInt16LE(fibPairCountOffset);
  const clxPairIndex = 33;
  const clxPairOffset = fibPairCountOffset + 2 + clxPairIndex * 8;
  if (fibPairCount <= clxPairIndex || clxPairOffset + 8 > wordDocument.length) {
    unsupported();
  }

  const mainCharacterCount = wordDocument.readUInt32LE(
    fibLongWordCountOffset + 2 + 3 * 4,
  );
  const clxOffset = wordDocument.readUInt32LE(clxPairOffset);
  const clxLength = wordDocument.readUInt32LE(clxPairOffset + 4);
  if (
    mainCharacterCount === 0 ||
    clxLength < 21 ||
    clxOffset + clxLength > table.length
  ) {
    unsupported();
  }

  let offset = clxOffset;
  const endOffset = clxOffset + clxLength;
  while (offset < endOffset && table[offset] === 0x01) {
    if (offset + 3 > endOffset) {
      unsupported();
    }
    const propertyLength = table.readUInt16LE(offset + 1);
    offset += 3 + propertyLength;
  }
  if (offset + 5 > endOffset || table[offset] !== 0x02) {
    unsupported();
  }
  const pieceTableLength = table.readUInt32LE(offset + 1);
  if (
    pieceTableLength < 16 ||
    (pieceTableLength - 4) % 12 !== 0 ||
    offset + 5 + pieceTableLength !== endOffset
  ) {
    unsupported();
  }
  const pieceCount = (pieceTableLength - 4) / 12;
  const characterPositionsOffset = offset + 5;
  let previousCharacterPosition = table.readUInt32LE(characterPositionsOffset);
  if (previousCharacterPosition !== 0) {
    unsupported();
  }
  for (let index = 1; index <= pieceCount; index += 1) {
    const characterPosition = table.readUInt32LE(
      characterPositionsOffset + index * 4,
    );
    if (characterPosition <= previousCharacterPosition) {
      unsupported();
    }
    previousCharacterPosition = characterPosition;
  }
  if (previousCharacterPosition < mainCharacterCount) {
    unsupported();
  }
}

function validateWordCfb(container: CFB$Container) {
  const wordDocument = liveCfbStream(container, ["WordDocument"]);
  if (
    !wordDocument ||
    wordDocument.length < 32 ||
    wordDocument.readUInt16LE(0) !== 0xa5ec ||
    !SUPPORTED_WORD_FIB_VERSIONS.has(wordDocument.readUInt16LE(2))
  ) {
    unsupported();
  }
  const firstVariableFieldOffset = 32;
  const fibWordCount = wordDocument.readUInt16LE(firstVariableFieldOffset);
  if (fibWordCount !== 14) {
    unsupported();
  }
  const flags = wordDocument.readUInt16LE(10);
  const tableName = (flags & 0x0200) === 0 ? "0Table" : "1Table";
  const table = liveCfbStream(container, [tableName]);
  if (
    !table ||
    table.length < 16 ||
    table.subarray(0, 16).every((byte) => byte === 0)
  ) {
    unsupported();
  }
  const firstCharacterOffset = wordDocument.readUInt32LE(24);
  const lastCharacterOffset = wordDocument.readUInt32LE(28);
  if (
    firstCharacterOffset >= lastCharacterOffset ||
    lastCharacterOffset > wordDocument.length
  ) {
    unsupported();
  }
  validateWordPieceTable(wordDocument, table, firstVariableFieldOffset);
}

function validateExcelCfb(container: CFB$Container) {
  const workbook = liveCfbStream(container, ["Workbook", "Book"]);
  if (!workbook || workbook.length < 12) {
    unsupported();
  }

  const validBofRecords = new Set([0x0009, 0x0209, 0x0409, 0x0809]);
  const validBiffVersions = new Set([0x0200, 0x0300, 0x0400, 0x0500, 0x0600]);
  let offset = 0;
  let recordCount = 0;
  let foundWorkbookEof = false;
  while (offset + 4 <= workbook.length && recordCount < 100_000) {
    const recordType = workbook.readUInt16LE(offset);
    const recordLength = workbook.readUInt16LE(offset + 2);
    const nextOffset = offset + 4 + recordLength;
    if (nextOffset > workbook.length) {
      unsupported();
    }
    if (recordCount === 0) {
      if (
        !validBofRecords.has(recordType) ||
        recordLength < 4 ||
        !validBiffVersions.has(workbook.readUInt16LE(offset + 4)) ||
        workbook.readUInt16LE(offset + 6) !== 0x0005
      ) {
        unsupported();
      }
    }
    recordCount += 1;
    offset = nextOffset;
    if (recordType === 0x000a) {
      foundWorkbookEof = true;
      break;
    }
  }
  if (!foundWorkbookEof) {
    unsupported();
  }
}

function validatePowerPointRecord(
  content: Buffer,
  offset: number,
  expectedType: number,
  expectedVersion?: number,
): number {
  if (offset < 0 || offset + 8 > content.length) {
    unsupported();
  }
  const version = content.readUInt16LE(offset) & 0x000f;
  const recordType = content.readUInt16LE(offset + 2);
  const recordLength = content.readUInt32LE(offset + 4);
  if (
    recordType !== expectedType ||
    (expectedVersion !== undefined && version !== expectedVersion) ||
    recordLength === 0 ||
    offset + 8 + recordLength > content.length
  ) {
    unsupported();
  }
  return recordLength;
}

function validatePowerPointCfb(container: CFB$Container) {
  const presentation = liveCfbStream(container, ["PowerPoint Document"]);
  const currentUser = liveCfbStream(container, ["Current User"]);
  if (!presentation || !currentUser || currentUser.length < 20) {
    unsupported();
  }
  validatePowerPointRecord(presentation, 0, 0x03e8, 0x000f);
  validatePowerPointRecord(currentUser, 0, 0x0ff6, 0x0000);
  const currentEditOffset = currentUser.readUInt32LE(16);
  validatePowerPointRecord(presentation, currentEditOffset, 0x0ff5, 0x0000);
}

async function validateCfbFamily(path: string, extension: string) {
  const container = CFB.read(path, { type: "file", WTF: true });
  if (hasCfbMacroArtifact(container)) {
    unsupported();
  }
  if (extension === "doc") {
    validateWordCfb(container);
  } else if (extension === "xls") {
    validateExcelCfb(container);
  } else if (extension === "ppt") {
    validatePowerPointCfb(container);
  } else {
    unsupported();
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
