import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildContentDisposition,
  sanitizeDownloadName,
} from "../server/lib/storage/content-disposition.ts";

test("sanitizes download names without preserving header injection or path separators", () => {
  assert.equal(
    sanitizeDownloadName("x\r\nSet-Cookie: bad"),
    "xSet-Cookie: bad",
  );
  assert.equal(
    sanitizeDownloadName("folder/subfolder\\report.pdf"),
    "folder_subfolder_report.pdf",
  );
  assert.equal(sanitizeDownloadName("\0\r\n"), "download");
});

test("builds an ASCII fallback and RFC 5987 UTF-8 filename", () => {
  assert.equal(
    buildContentDisposition("attachment", "raport ąć.xlsx"),
    "attachment; filename=\"raport __.xlsx\"; filename*=UTF-8''raport%20%C4%85%C4%87.xlsx",
  );
  assert.equal(
    buildContentDisposition("attachment", "résumé (final)'*.pdf"),
    "attachment; filename=\"r_sum_ (final)'*.pdf\"; filename*=UTF-8''r%C3%A9sum%C3%A9%20%28final%29%27%2A.pdf",
  );
});

test("escapes quotes in the ASCII filename fallback", () => {
  assert.equal(
    buildContentDisposition("attachment", 'quarter "final".csv'),
    'attachment; filename="quarter \\"final\\".csv"; filename*=UTF-8\'\'quarter%20%22final%22.csv',
  );
});

test("strips CR and LF before constructing either disposition", () => {
  const value = buildContentDisposition("attachment", "x\r\nSet-Cookie: bad");
  assert.doesNotMatch(value, /\r|\n/u);
  assert.equal(
    value,
    "attachment; filename=\"xSet-Cookie: bad\"; filename*=UTF-8''xSet-Cookie%3A%20bad",
  );
});

test("selects inline or attachment without changing filename encoding", () => {
  assert.equal(
    buildContentDisposition("inline", "manual.pdf"),
    "inline; filename=\"manual.pdf\"; filename*=UTF-8''manual.pdf",
  );
  assert.equal(
    buildContentDisposition("attachment", "manual.pdf"),
    "attachment; filename=\"manual.pdf\"; filename*=UTF-8''manual.pdf",
  );
});
