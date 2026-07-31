import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  detectIntakeBudget,
  detectIntakeCapabilities,
  detectIntakeEquipment,
  detectIntakeLocation,
  detectIntakeUrgency,
  intakeCategoryFromEquipment,
  intakeTitleFromRequirement,
  isIntakeRecoveryRequirement,
  isIntakeUrgent,
  parseIntakeBudgetAmount,
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

  test("extracts an urgent ammonia cold-store requirement without buyer re-entry", () => {
    const requirement =
      "An ammonia refrigeration compressor at our seafood cold store in Darwin NT has severe vibration and low oil-pressure alarms. We need a licensed industrial refrigeration contractor tonight, within 12 hours, for an emergency repair. Budget is AUD 28,000.";
    const normalised = requirement.toLowerCase();
    const equipment = detectIntakeEquipment(normalised);
    const capabilities = detectIntakeCapabilities(
      normalised,
      equipment,
      isIntakeRecoveryRequirement(normalised)
    );

    assert.ok(equipment.includes("Ammonia refrigeration system"));
    assert.ok(equipment.includes("Industrial refrigeration compressor"));
    assert.ok(capabilities.includes("Industrial refrigeration diagnostics"));
    assert.ok(capabilities.includes("Ammonia refrigeration service"));
    assert.ok(capabilities.includes("Refrigeration compressor maintenance"));
    assert.ok(capabilities.includes("Licensed refrigeration contractor"));
    assert.ok(capabilities.includes("Same-day onsite support"));
    assert.equal(
      intakeCategoryFromEquipment([
        ...equipment,
        "Industrial motor"
      ]),
      "Industrial refrigeration maintenance"
    );
    assert.equal(isIntakeUrgent(normalised), true);
  });

  test("retains grain-terminal repair and electrical scope in a concise title", () => {
    const requirement =
      "At our bulk grain export terminal in Port Lincoln SA, the main shiploader feed conveyor motor and gearbox are overheating and tripping. We need a mechanical and electrical industrial maintenance team within 24 hours to diagnose and complete an authorised repair without contaminating grain handling areas. Our callout and initial repair tolerance is $14,500, with any additional parts subject to approval.";
    const normalised = requirement.toLowerCase();
    const equipment = detectIntakeEquipment(normalised);
    const capabilities = detectIntakeCapabilities(
      normalised,
      equipment,
      isIntakeRecoveryRequirement(normalised)
    );

    assert.equal(
      intakeTitleFromRequirement(requirement, equipment, true),
      "Urgent grain conveyor motor and gearbox repair"
    );
    assert.equal(isIntakeUrgent(normalised), true);
    assert.ok(equipment.includes("Industrial conveyor"));
    assert.ok(!equipment.includes("Packaging conveyor"));
    assert.ok(capabilities.includes("Industrial gearbox repair"));
    assert.ok(capabilities.includes("Industrial motor repair"));
    assert.ok(capabilities.includes("Industrial mechanical maintenance"));
    assert.ok(capabilities.includes("Industrial electrical maintenance"));
    assert.equal(
      intakeCategoryFromEquipment(equipment),
      "Industrial mechanical maintenance"
    );
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

  test("parses compact and range budget values for API submission", () => {
    assert.equal(parseIntakeBudgetAmount("Around 20k AUD"), 20_000);
    assert.equal(parseIntakeBudgetAmount("Up to AUD 20,000"), 20_000);
    assert.equal(
      parseIntakeBudgetAmount("AUD 120,000 to AUD 180,000"),
      180_000
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
