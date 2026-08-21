import assert from "node:assert/strict";
import test from "node:test";

import {
  parseSingleRange,
  RangeNotSatisfiableError,
} from "../server/lib/http-range.ts";

test("returns null when no Range header is supplied", () => {
  assert.equal(parseSingleRange(undefined, 100), null);
});

test("parses closed, open-ended, suffix, and clamped byte ranges", () => {
  assert.deepEqual(parseSingleRange("bytes=0-99", 100), { start: 0, end: 99 });
  assert.deepEqual(parseSingleRange("bytes=20-", 100), { start: 20, end: 99 });
  assert.deepEqual(parseSingleRange("bytes=-10", 100), { start: 90, end: 99 });
  assert.deepEqual(parseSingleRange("bytes=90-999", 100), { start: 90, end: 99 });
});

for (const value of [
  "items=0-1",
  "bytes=0-1,2-3",
  "bytes=100-100",
  "bytes=20-19",
  "bytes=-0",
  "bytes=-",
  "bytes=0-1junk",
  "bytes= -1",
]) {
  test(`rejects an invalid or unsatisfiable range: ${value}`, () => {
    assert.throws(
      () => parseSingleRange(value, 100),
      (error: unknown) =>
        error instanceof RangeNotSatisfiableError && error.size === 100,
    );
  });
}

test("rejects any range for an empty object", () => {
  assert.throws(
    () => parseSingleRange("bytes=0-0", 0),
    (error: unknown) =>
      error instanceof RangeNotSatisfiableError && error.size === 0,
  );
});
