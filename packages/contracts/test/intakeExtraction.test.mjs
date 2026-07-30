import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  detectIntakeBudget,
  detectIntakeCapabilities,
  detectIntakeEquipment,
  detectIntakeLocation,
  detectIntakeUrgency,
  intakeTitleFromRequirement,
  isIntakeRecoveryRequirement,
  isIntakeUrgent,
  truncateIntakeTitle
} from "../dist/index.js";

const gearboxRequirement =
  "Conveyor motor gearbox on our bottling line in Newcastle NSW is overheating and tripping thermal protection every 2-3 hours. Production down to 40% capacity. Need an industrial mechanical contractor to diagnose and repair within 48 hours. Budget around 20k AUD.";

describe("shared deterministic intake extraction", () => {
  test("extracts the gearbox acceptance case without inventing same-day urgency", () => {
    const normalised = gearboxRequirement.toLowerCase();
    const equipment = detectIntakeEquipment(normalised);
    const capabilities = detectIntakeCapabilities(
      normalised,
      equipment,
      isIntakeRecoveryRequirement(normalised)
    );
    const title = intakeTitleFromRequirement(
      gearboxRequirement,
      equipment,
      true
    );

    assert.equal(detectIntakeLocation(gearboxRequirement), "Newcastle, NSW");
    assert.equal(detectIntakeBudget(gearboxRequirement), "Up to AUD 20,000");
    assert.equal(
      detectIntakeUrgency(gearboxRequirement, isIntakeUrgent(normalised)),
      "Within 2 days"
    );
    assert.ok(equipment.includes("Industrial gearbox"));
    assert.ok(equipment.includes("Industrial motor"));
    assert.ok(capabilities.includes("Industrial gearbox diagnostics"));
    assert.ok(capabilities.includes("Industrial mechanical maintenance"));
    assert.ok(title.endsWith("…"));
    assert.ok(title.length <= 88);
    assert.doesNotMatch(title, /\stripping t…$/);
  });

  test("supports compact Australian-dollar amounts and existing forms", () => {
    for (const value of ["20k", "$20k", "20K AUD", "AUD 20k", "around 20k"]) {
      const requirement =
        value === "around 20k"
          ? `Budget ${value}`
          : `Approved budget is ${value}`;
      assert.equal(detectIntakeBudget(requirement), "Up to AUD 20,000");
    }
    assert.equal(
      detectIntakeBudget("Approved budget is $18,500"),
      "Up to AUD 18,500"
    );
    assert.equal(
      detectIntakeBudget("Budget is AUD 120,000 to AUD 180,000"),
      "AUD 120,000 to AUD 180,000"
    );
  });

  test("normalises Australian state tokens and preserves bare-city fallbacks", () => {
    assert.equal(
      detectIntakeLocation("Attend the plant in Port Kembla nSw tomorrow."),
      "Port Kembla, NSW"
    );
    assert.equal(
      detectIntakeLocation("Attend the Western Sydney plant."),
      "Western Sydney, NSW"
    );
  });

  test("truncates only at a word boundary", () => {
    const value =
      "Conveyor motor gearbox on our bottling line is overheating and tripping thermal protection every shift";
    const title = truncateIntakeTitle(value);

    assert.equal(title, "Conveyor motor gearbox on our bottling line is overheating and tripping thermal…");
  });
});
