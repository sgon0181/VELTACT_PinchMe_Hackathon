import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { demoResponsesForRequirement } from "../public/supplierDemoResponses.js";

const [buyerStyles, supplierStyles] = await Promise.all([
  readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../public/supplier.css", import.meta.url), "utf8")
]);

test("wraps user-generated buyer report headings on narrow viewports", () => {
  assert.match(
    buyerStyles,
    /span,\s*h1,\s*h2,\s*h3\s*\{[\s\S]*?overflow-wrap:\s*anywhere;/
  );
});

test("keeps the supplier fixture disclosure touch-sized", () => {
  assert.match(
    supplierStyles,
    /\.demo-tools summary\s*\{[\s\S]*?min-height:\s*44px;[\s\S]*?padding:\s*12px 0;/
  );
});

test("uses fixture preset labels that fit a narrow native select", () => {
  for (const requirement of [
    "Recover a Siemens PLC packaging line",
    "Plan a robotic palletising cell",
    "Diagnose an overheating conveyor gearbox"
  ]) {
    for (const response of demoResponsesForRequirement(requirement)) {
      assert.ok(
        response.label.length <= 29,
        `expected compact fixture label, received "${response.label}"`
      );
      assert.match(response.label, /Fixture$/);
    }
  }
});
