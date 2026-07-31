import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatSupplierAvailability } from "../dist/index.js";

describe("supplier availability date formatting", () => {
  test("formats a valid date-only value without a timezone day shift", () => {
    assert.equal(formatSupplierAvailability("2026-08-04"), "4 Aug 2026");
    assert.equal(formatSupplierAvailability("2026-01-01"), "1 Jan 2026");
  });

  test("preserves human phrases and non-date-only values exactly", () => {
    for (const value of [
      "Within four hours",
      " Next business day ",
      "2026-08-04T00:00:00.000Z",
      "2026-02-29",
      "Not supplied"
    ]) {
      assert.equal(formatSupplierAvailability(value), value);
    }
  });
});
