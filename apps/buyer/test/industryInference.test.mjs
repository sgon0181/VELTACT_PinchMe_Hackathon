import assert from "node:assert/strict";
import { describe, test } from "node:test";

globalThis.window = {
  API_BASE_URL: "http://localhost:4000/api",
  FRONTEND_BASE_URL: "http://localhost:4000",
  location: { origin: "http://localhost:4000" }
};

const { inferBuyerIndustry } = await import(
  `../public/assets/rapidMatchService.js?industry=${Date.now()}`
);

describe("buyer requirement industry inference", () => {
  test("does not label utilities, cold logistics or grain terminals as manufacturing", () => {
    assert.equal(
      inferBuyerIndustry("Wastewater treatment sludge conveyor repair"),
      "Water and wastewater utilities"
    );
    assert.equal(
      inferBuyerIndustry("Ammonia compressor at a cold-storage logistics site"),
      "Cold storage and logistics"
    );
    assert.equal(
      inferBuyerIndustry("Shiploader gearbox at a grain terminal"),
      "Bulk materials and grain handling"
    );
  });

  test("keeps the established manufacturing fallback", () => {
    assert.equal(
      inferBuyerIndustry("Siemens PLC packaging line recovery"),
      "Manufacturing"
    );
  });
});
