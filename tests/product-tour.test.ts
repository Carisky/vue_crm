import assert from "node:assert/strict";
import test from "node:test";

import {
  PRODUCT_TOUR_VERSION,
  shouldAutoStartTour,
} from "../lib/product-tour.ts";

test("starts onboarding for a user who has not dismissed the current tour", () => {
  assert.equal(
    shouldAutoStartTour({ status: "NOT_STARTED", version: 0, updatedAt: null }),
    true,
  );
});

test("does not automatically replay a completed or skipped current tour", () => {
  for (const status of ["COMPLETED", "SKIPPED"] as const) {
    assert.equal(
      shouldAutoStartTour({
        status,
        version: PRODUCT_TOUR_VERSION,
        updatedAt: new Date().toISOString(),
      }),
      false,
    );
  }
});

test("replays onboarding when a newer tour version is released", () => {
  assert.equal(
    shouldAutoStartTour({
      status: "COMPLETED",
      version: PRODUCT_TOUR_VERSION - 1,
      updatedAt: new Date().toISOString(),
    }),
    true,
  );
});
