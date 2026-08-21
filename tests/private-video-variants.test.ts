import assert from "node:assert/strict";
import test from "node:test";
import { selectVariantHeights } from "../server/lib/video.ts";

test("selects only smaller private video variants", () => {
  assert.deepEqual(selectVariantHeights(1080), [720, 480, 360]);
  assert.deepEqual(selectVariantHeights(720), [480, 360]);
  assert.deepEqual(selectVariantHeights(null), []);
});
