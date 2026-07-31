import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";
import { formatSupplierAvailability } from "../public/assets/vendor/contracts/dateFormatting.js";

describe("supplier availability presentation", () => {
  test("uses the shared UTC-safe formatter on buyer and supplier surfaces", async () => {
    const [buyerBundle, supplierScript] = await Promise.all([
      readFile(new URL("../public/assets/main.js", import.meta.url), "utf8"),
      readFile(new URL("../public/supplier.js", import.meta.url), "utf8")
    ]);

    assert.match(
      buyerBundle,
      /comparisonFact\(\s*"Availability",\s*formatSupplierAvailability\(/
    );
    assert.match(
      buyerBundle,
      /fact\(\s*"Availability",\s*formatSupplierAvailability\(/
    );
    assert.match(
      supplierScript,
      /formatSupplierAvailability\(availability\)/
    );
  });

  test("renders date-only availability and leaves human phrases unchanged", () => {
    assert.equal(formatSupplierAvailability("2026-08-04"), "4 Aug 2026");
    assert.equal(
      formatSupplierAvailability("Site review within four hours"),
      "Site review within four hours"
    );
  });
});
