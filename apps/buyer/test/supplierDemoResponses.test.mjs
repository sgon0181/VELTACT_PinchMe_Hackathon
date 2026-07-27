import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { demoResponsesForRequirement } from "../public/supplierDemoResponses.js";

describe("supplier response fixture form compatibility", () => {
  test("uses valid $100 price increments in both demo scenarios", () => {
    for (const requirement of [
      "Recover a Siemens PLC packaging line",
      "Plan a robotic palletising cell"
    ]) {
      for (const response of demoResponsesForRequirement(requirement)) {
        assert.equal(response.indicativePriceAud % 100, 0);
      }
    }
  });
});
