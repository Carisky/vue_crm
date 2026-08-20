import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  MEDIA_ACCEPT_ATTRIBUTE,
  UnsupportedMediaTypeError,
  mediaKindFromMime,
  validateMediaFile,
  type ValidatedMedia,
} from "../server/lib/storage/file-policy.ts";

const fixturesDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/media",
);

const canonicalMime = {
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpeg: "image/jpeg",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

async function withTemporaryFile(
  name: string,
  content: Uint8Array | string,
  run: (path: string) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), "vue-crm-media-policy-"));
  const path = join(directory, name);

  try {
    await writeFile(path, content);
    await run(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function createMinimalCfb(streamName: string): Buffer {
  const freeSector = 0xffffffff;
  const endOfChain = 0xfffffffe;
  const fatSector = 0xfffffffd;
  const file = Buffer.alloc(512 * 3);
  const header = file.subarray(0, 512);
  const directory = file.subarray(512, 1024);
  const fat = file.subarray(1024, 1536);

  Buffer.from("d0cf11e0a1b11ae1", "hex").copy(header);
  header.writeUInt16LE(0x003e, 24);
  header.writeUInt16LE(0x0003, 26);
  header.writeUInt16LE(0xfffe, 28);
  header.writeUInt16LE(9, 30);
  header.writeUInt16LE(6, 32);
  header.writeUInt32LE(1, 44);
  header.writeUInt32LE(0, 48);
  header.writeUInt32LE(4096, 56);
  header.writeUInt32LE(freeSector, 60);
  header.writeUInt32LE(freeSector, 68);
  header.writeUInt32LE(1, 76);
  for (let offset = 80; offset < 512; offset += 4) {
    header.writeUInt32LE(freeSector, offset);
  }

  function writeDirectoryEntry(offset: number, name: string, type: number) {
    const encodedName = Buffer.from(`${name}\0`, "utf16le");
    encodedName.copy(directory, offset);
    directory.writeUInt16LE(encodedName.length, offset + 64);
    directory.writeUInt8(type, offset + 66);
    directory.writeUInt8(1, offset + 67);
    directory.writeUInt32LE(freeSector, offset + 68);
    directory.writeUInt32LE(freeSector, offset + 72);
    directory.writeUInt32LE(freeSector, offset + 76);
    directory.writeUInt32LE(endOfChain, offset + 116);
  }

  writeDirectoryEntry(0, "Root Entry", 5);
  writeDirectoryEntry(128, streamName, 2);
  directory.writeUInt32LE(1, 76);

  fat.fill(0xff);
  fat.writeUInt32LE(endOfChain, 0);
  fat.writeUInt32LE(fatSector, 4);

  return file;
}

function createMp4(): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(24, 0);
  buffer.write("ftyp", 4, "ascii");
  buffer.write("isom", 8, "ascii");
  buffer.writeUInt32BE(0x200, 12);
  buffer.write("isom", 16, "ascii");
  buffer.write("mp41", 20, "ascii");
  return buffer;
}

const validBinaryCases: Array<{
  name: string;
  content: Buffer;
  claimedMime: string;
  expected: ValidatedMedia;
}> = [
  {
    name: "photo.jpg",
    content: Buffer.from("ffd8ffe000104a46494600010100000100010000", "hex"),
    claimedMime: canonicalMime.jpeg,
    expected: {
      mime: canonicalMime.jpeg,
      extension: "jpg",
      kind: "image",
      disposition: "inline",
    },
  },
  {
    name: "photo.jpeg",
    content: Buffer.from("ffd8ffdb00040000ffd9", "hex"),
    claimedMime: canonicalMime.jpeg,
    expected: {
      mime: canonicalMime.jpeg,
      extension: "jpeg",
      kind: "image",
      disposition: "inline",
    },
  },
  {
    name: "image.png",
    content: Buffer.from(
      "89504e470d0a1a0a0000000d4948445200000001000000010802000000",
      "hex",
    ),
    claimedMime: " IMAGE/PNG ",
    expected: {
      mime: "image/png",
      extension: "png",
      kind: "image",
      disposition: "inline",
    },
  },
  {
    name: "image.webp",
    content: Buffer.from(
      "524946461000000057454250565038200400000000000000",
      "hex",
    ),
    claimedMime: "image/webp",
    expected: {
      mime: "image/webp",
      extension: "webp",
      kind: "image",
      disposition: "inline",
    },
  },
  {
    name: "image.gif",
    content: Buffer.from(
      "47494638396101000100800000000000ffffff21f90401000000002c",
      "hex",
    ),
    claimedMime: "image/gif",
    expected: {
      mime: "image/gif",
      extension: "gif",
      kind: "image",
      disposition: "inline",
    },
  },
  {
    name: "clip.mp4",
    content: createMp4(),
    claimedMime: "video/mp4",
    expected: {
      mime: "video/mp4",
      extension: "mp4",
      kind: "video",
      disposition: "inline",
    },
  },
  {
    name: "clip.webm",
    content: Buffer.from("1a45dfa3874282847765626d", "hex"),
    claimedMime: "video/webm",
    expected: {
      mime: "video/webm",
      extension: "webm",
      kind: "video",
      disposition: "inline",
    },
  },
  {
    name: "manual.pdf",
    content: Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF", "ascii"),
    claimedMime: "application/pdf; charset=binary",
    expected: {
      mime: "application/pdf",
      extension: "pdf",
      kind: "pdf",
      disposition: "inline",
    },
  },
  {
    name: "legacy.doc",
    content: createMinimalCfb("WordDocument"),
    claimedMime: canonicalMime.doc,
    expected: {
      mime: canonicalMime.doc,
      extension: "doc",
      kind: "document",
      disposition: "attachment",
    },
  },
  {
    name: "legacy.xls",
    content: createMinimalCfb("Workbook"),
    claimedMime: canonicalMime.xls,
    expected: {
      mime: canonicalMime.xls,
      extension: "xls",
      kind: "document",
      disposition: "attachment",
    },
  },
  {
    name: "legacy.ppt",
    content: createMinimalCfb("PowerPoint Document"),
    claimedMime: canonicalMime.ppt,
    expected: {
      mime: canonicalMime.ppt,
      extension: "ppt",
      kind: "document",
      disposition: "attachment",
    },
  },
];

test("validates approved signature-bearing media with canonical metadata", async () => {
  for (const item of validBinaryCases) {
    await withTemporaryFile(item.name, item.content, async (path) => {
      assert.deepEqual(
        await validateMediaFile({
          path,
          originalName: item.name,
          claimedMime: item.claimedMime,
        }),
        item.expected,
        item.name,
      );
    });
  }
});

test("validates SVG, RTF, and CSV using textual content inspection", async () => {
  const cases: typeof validBinaryCases = [
    {
      name: "drawing.svg",
      content: Buffer.from(
        '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><rect /></svg>',
      ),
      claimedMime: "image/svg+xml",
      expected: {
        mime: "image/svg+xml",
        extension: "svg",
        kind: "image",
        disposition: "attachment",
      },
    },
    {
      name: "notes.rtf",
      content: Buffer.from("{\\rtf1\\ansi A small document}"),
      claimedMime: "application/rtf",
      expected: {
        mime: "application/rtf",
        extension: "rtf",
        kind: "document",
        disposition: "attachment",
      },
    },
    {
      name: "people.csv",
      content: Buffer.from("name,email\nAda,ada@example.test\n"),
      claimedMime: "text/csv",
      expected: {
        mime: "text/csv",
        extension: "csv",
        kind: "document",
        disposition: "attachment",
      },
    },
  ];

  for (const item of cases) {
    await withTemporaryFile(item.name, item.content, async (path) => {
      assert.deepEqual(
        await validateMediaFile({
          path,
          originalName: item.name,
          claimedMime: item.claimedMime,
        }),
        item.expected,
        item.name,
      );
    });
  }
});

test("validates structurally correct OOXML and OpenDocument package fixtures", async () => {
  const cases: Array<{ name: string; mime: string; extension: string }> = [
    { name: "document.docx", mime: canonicalMime.docx, extension: "docx" },
    { name: "workbook.xlsx", mime: canonicalMime.xlsx, extension: "xlsx" },
    { name: "slides.pptx", mime: canonicalMime.pptx, extension: "pptx" },
    { name: "document.odt", mime: canonicalMime.odt, extension: "odt" },
    { name: "workbook.ods", mime: canonicalMime.ods, extension: "ods" },
    { name: "slides.odp", mime: canonicalMime.odp, extension: "odp" },
  ];

  for (const item of cases) {
    assert.deepEqual(
      await validateMediaFile({
        path: join(fixturesDirectory, item.name),
        originalName: item.name,
        claimedMime: item.mime,
      }),
      {
        mime: item.mime,
        extension: item.extension,
        kind: "document",
        disposition: "attachment",
      },
      item.name,
    );
  }
});

async function assertUnsupported(input: {
  path: string;
  originalName: string;
  claimedMime?: string | null;
}) {
  await assert.rejects(validateMediaFile(input), (error: unknown) => {
    assert.ok(error instanceof UnsupportedMediaTypeError);
    assert.equal(error.message, "Unsupported media type.");
    assert.equal(error.message.includes(input.path), false);
    return true;
  });
}

test("rejects extension, claimed MIME, and detected content mismatches", async () => {
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000001000000010802000000",
    "hex",
  );

  await withTemporaryFile("renamed.jpg", png, (path) =>
    assertUnsupported({
      path,
      originalName: "renamed.jpg",
      claimedMime: canonicalMime.jpeg,
    }),
  );
  await withTemporaryFile("image.png", png, (path) =>
    assertUnsupported({
      path,
      originalName: "image.png",
      claimedMime: canonicalMime.jpeg,
    }),
  );
  await withTemporaryFile("image.png", "not a PNG", (path) =>
    assertUnsupported({
      path,
      originalName: "image.png",
      claimedMime: "image/png",
    }),
  );
});

test("rejects renamed ZIP archives, executable content, and macro-enabled extensions", async () => {
  await assertUnsupported({
    path: join(fixturesDirectory, "generic.zip"),
    originalName: "renamed.docx",
    claimedMime: canonicalMime.docx,
  });

  await withTemporaryFile(
    "manual.pdf",
    Buffer.from("4d5a90000300000004000000ffff0000", "hex"),
    (path) =>
      assertUnsupported({
        path,
        originalName: "manual.pdf",
        claimedMime: "application/pdf",
      }),
  );

  for (const [name, fixture, claimedMime] of [
    [
      "macro.docm",
      "document.docx",
      "application/vnd.ms-word.document.macroenabled.12",
    ],
    [
      "macro.xlsm",
      "workbook.xlsx",
      "application/vnd.ms-excel.sheet.macroenabled.12",
    ],
    [
      "macro.pptm",
      "slides.pptx",
      "application/vnd.ms-powerpoint.presentation.macroenabled.12",
    ],
  ] as const) {
    await assertUnsupported({
      path: join(fixturesDirectory, fixture),
      originalName: name,
      claimedMime,
    });
  }
});

test("rejects missing names and double-extension tricks", async () => {
  const pdf = Buffer.from("%PDF-1.7\n%%EOF", "ascii");
  for (const name of [
    "",
    "   ",
    "upload",
    "invoice.exe.pdf",
    "photo.jpg.pdf",
    "report.pdf.exe",
  ]) {
    await withTemporaryFile("physical.part", pdf, (path) =>
      assertUnsupported({
        path,
        originalName: name,
        claimedMime: "application/pdf",
      }),
    );
  }
});

test("rejects malformed OOXML and OpenDocument packages", async () => {
  await assertUnsupported({
    path: join(fixturesDirectory, "malformed.docx"),
    originalName: "malformed.docx",
    claimedMime: canonicalMime.docx,
  });
  await assertUnsupported({
    path: join(fixturesDirectory, "malformed.odt"),
    originalName: "malformed.odt",
    claimedMime: canonicalMime.odt,
  });
});

test("rejects a legacy OLE document whose family does not match its extension", async () => {
  await withTemporaryFile("renamed.doc", createMinimalCfb("Workbook"), (path) =>
    assertUnsupported({
      path,
      originalName: "renamed.doc",
      claimedMime: canonicalMime.doc,
    }),
  );
});

test("rejects binary data disguised as CSV and oversized bounded text inputs", async () => {
  await withTemporaryFile(
    "binary.csv",
    Buffer.from([0, 1, 2, 3, 44, 255, 254]),
    (path) =>
      assertUnsupported({
        path,
        originalName: "binary.csv",
        claimedMime: "text/csv",
      }),
  );

  const oversized = Buffer.concat([
    Buffer.from("column,value\n"),
    Buffer.alloc(1024 * 1024, 0x61),
    Buffer.from(",last\n"),
  ]);
  await withTemporaryFile("large.csv", oversized, (path) =>
    assertUnsupported({
      path,
      originalName: "large.csv",
      claimedMime: "text/csv",
    }),
  );
});

test("maps canonical MIME types to media kinds and exposes the upload accept contract", () => {
  assert.equal(mediaKindFromMime("image/png"), "image");
  assert.equal(mediaKindFromMime("image/svg+xml"), "image");
  assert.equal(mediaKindFromMime("video/webm"), "video");
  assert.equal(mediaKindFromMime("application/pdf"), "pdf");
  assert.equal(mediaKindFromMime(canonicalMime.docx), "document");
  assert.throws(
    () => mediaKindFromMime("application/octet-stream"),
    UnsupportedMediaTypeError,
  );
  assert.equal(
    MEDIA_ACCEPT_ATTRIBUTE,
    ".jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.pdf,.svg,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf,.csv",
  );
});
