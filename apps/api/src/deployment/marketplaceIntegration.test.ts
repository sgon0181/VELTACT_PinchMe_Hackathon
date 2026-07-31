import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { inferDeploymentScenario } from "./marketplaceIntegration.js";

describe("deployment scenario inference", () => {
  test("preserves the deterministic PLC and robotics scenarios", () => {
    assert.equal(
      inferDeploymentScenario(profile("Urgent Siemens PLC fault recovery")),
      "plc_recovery"
    );
    assert.equal(
      inferDeploymentScenario(profile("ABB robot palletising integration")),
      "robotic_integration"
    );
  });

  test("does not mislabel unrelated industrial work as PLC recovery", () => {
    assert.equal(
      inferDeploymentScenario(
        profile("Urgent ammonia refrigeration compressor repair")
      ),
      "industrial_response"
    );
    assert.equal(
      inferDeploymentScenario(
        profile("Wastewater sludge conveyor gearbox replacement")
      ),
      "industrial_response"
    );
  });
});

function profile(title: string) {
  return {
    title,
    description: title,
    problemSummary: title,
    category: "Industrial maintenance",
    equipmentOrTechnology: [],
    equipmentTechnology: []
  };
}
