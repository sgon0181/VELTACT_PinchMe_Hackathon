import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  applyAiIntakeToDraft,
  budgetUpperBoundAud,
  emptyV2Intake,
  optionalPositiveInteger
} from "../public/assets/v2Intake.js";

describe("V2 intake state", () => {
  test("starts real intake without urgency, budget, or industry demo facts", () => {
    const intake = emptyV2Intake();

    assert.equal(intake.urgencyDays, undefined);
    assert.equal(intake.budgetAud, undefined);
    assert.equal(intake.industry, "");
  });

  test("does not carry missing AI fields forward from a demo draft", () => {
    const demoDraft = {
      ...emptyV2Intake(),
      rawRequirement: "Demo PLC failure",
      title: "Demo PLC recovery",
      location: "Newcastle, NSW",
      urgencyDays: 1,
      budgetAud: 12000,
      category: "Industrial automation breakdown",
      industry: "Food and beverage manufacturing",
      equipment: "Siemens PLC",
      capabilities: "PLC diagnostics",
      constraints: "No safeguard bypass",
      buyerPriority: "speed",
      buyerEmail: "engineer@demo-factory.example",
      buyerName: "Alex Morgan",
      companyName: "Veltact Demonstration Factory"
    };
    const result = applyAiIntakeToDraft(demoDraft, {
      rawRequirement: "Plan an unspecified controls upgrade.",
      generatedProfile: {
        title: "Plan an unspecified controls upgrade",
        problemSummary: "Plan an unspecified controls upgrade.",
        category: "Industrial automation",
        equipmentOrTechnology: [],
        requiredCapabilities: [],
        certificationsOrConstraints: []
      },
      confidence: 0.42,
      missingFields: [
        "site location",
        "required response timing",
        "budget or callout tolerance"
      ]
    });

    assert.equal(result.location, "");
    assert.equal(result.urgencyDays, undefined);
    assert.equal(result.budgetAud, undefined);
    assert.equal(result.industry, "");
    assert.equal(result.equipment, "");
    assert.equal(result.capabilities, "");
  });

  test("uses the range upper bound and preserves explicit single-value budgets", () => {
    assert.equal(
      budgetUpperBoundAud("AUD 120,000 to AUD 180,000"),
      180000
    );
    assert.equal(budgetUpperBoundAud("Up to AUD 7,500"), 7500);
    assert.equal(budgetUpperBoundAud("Budget unknown"), undefined);
  });

  test("applies structured deadlines and validates optional numeric input", () => {
    const result = applyAiIntakeToDraft(emptyV2Intake(), {
      rawRequirement: "Plan a controls upgrade within 6 weeks.",
      generatedProfile: {
        title: "Controls upgrade",
        problemSummary: "Plan a controls upgrade within 6 weeks.",
        category: "Industrial automation",
        equipmentOrTechnology: ["PLC"],
        requiredCapabilities: ["PLC integration"],
        urgency: "Within 6 weeks",
        budgetRange: "AUD 80k to AUD 125k",
        certificationsOrConstraints: []
      },
      confidence: 0.74,
      missingFields: []
    });

    assert.equal(result.urgencyDays, 42);
    assert.equal(result.budgetAud, 125000);
    assert.equal(optionalPositiveInteger(null, "Budget (AUD)"), undefined);
    assert.equal(optionalPositiveInteger("", "Budget (AUD)"), undefined);
    assert.equal(optionalPositiveInteger("42000", "Budget (AUD)"), 42000);
    assert.throws(
      () => optionalPositiveInteger("0", "Budget (AUD)"),
      /positive whole number/
    );
    assert.throws(
      () => optionalPositiveInteger("1.5", "Urgency (days)"),
      /positive whole number/
    );
  });
});
