import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { structureRequirementLocally } from "./localAiIntakeAdapter.js";

describe("structureRequirementLocally", () => {
  test("does not treat binary evidence filenames as requirement text or budget evidence", () => {
    const rawRequirement =
      "We need an ABB robotic palletising cell integrated with the existing Siemens PLC and packaging conveyor in Western Sydney. Commission within 8 weeks with machinery safety validation.";
    const result = structureRequirementLocally({
      rawRequirement,
      evidence: [
        {
          kind: "photo",
          name: "61b3b316-e971-4a3e-990f-8f7f93635d46.jpeg",
          mimeType: "image/jpeg",
          dataUrl: "data:image/jpeg;base64,AA=="
        }
      ]
    });

    assert.equal(result.rawRequirement, rawRequirement);
    assert.equal(
      result.generatedProfile.title,
      "Robotic palletiser integration for dispatch line"
    );
    assert.equal(result.generatedProfile.budgetRange, undefined);
    assert.equal(result.generatedProfile.urgency, "Within 8 weeks");
    assert.ok(
      result.generatedProfile.requiredCapabilities.includes(
        "Robotic systems integration"
      )
    );
    assert.ok(
      !result.generatedProfile.requiredCapabilities.some((item) =>
        /fault|recovery|diagnostics/i.test(item)
      )
    );
  });

  test("rejects binary-only evidence instead of fabricating requirement text from its filename", () => {
    assert.throws(
      () =>
        structureRequirementLocally({
          rawRequirement: "",
          evidence: [
            {
              kind: "photo",
              name: "urgent-siemens-plc-fault-18000.jpeg",
              mimeType: "image/jpeg",
              dataUrl: "data:image/jpeg;base64,AA=="
            }
          ]
        }),
      (error: unknown) =>
        error instanceof Error &&
        /cannot read binary-only/i.test(error.message) &&
        !/urgent-siemens-plc-fault-18000\.jpeg/i.test(error.message)
    );
  });

  test("extracts explicit Australian-dollar ranges without matching unrelated numbers", () => {
    const result = structureRequirementLocally({
      rawRequirement:
        "Plan a robotic palletising cell in Western Sydney with a budget of AUD 120,000 to AUD 180,000 and commissioning within 8 weeks."
    });

    assert.equal(
      result.generatedProfile.budgetRange,
      "AUD 120,000 to AUD 180,000"
    );
  });

  test("uses extracted written evidence but not its filename", () => {
    const result = structureRequirementLocally({
      rawRequirement:
        "A packaging line PLC fault stopped production in Sydney and needs urgent authorised support.",
      evidence: [
        {
          kind: "written",
          name: "handover-2026-316.txt",
          extractedText: "Approved callout tolerance is AUD 7,500."
        }
      ]
    });

    assert.match(result.rawRequirement, /Approved callout tolerance/);
    assert.doesNotMatch(result.rawRequirement, /handover-2026-316/);
    assert.equal(result.generatedProfile.budgetRange, "Up to AUD 7,500");
  });

  test("keeps a planned Siemens PLC shutdown on its stated six-week timeline", () => {
    const result = structureRequirementLocally({
      rawRequirement:
        "Plan a Siemens PLC upgrade for the packaging line during a scheduled shutdown, minimise downtime, and complete the work within 6 weeks."
    });

    assert.equal(
      result.generatedProfile.title,
      "Siemens PLC integration for packaging line"
    );
    assert.equal(result.generatedProfile.urgency, "Within 6 weeks");
    assert.equal(result.generatedProfile.buyerPriority, undefined);
    assert.ok(
      result.generatedProfile.requiredCapabilities.includes(
        "Siemens controls integration"
      )
    );
    assert.ok(
      result.generatedProfile.requiredCapabilities.includes("PLC integration")
    );
    assert.ok(
      !result.generatedProfile.requiredCapabilities.some((item) =>
        /same-day|fault|diagnostic|recovery/i.test(item)
      )
    );

    const emergencyResult = structureRequirementLocally({
      rawRequirement:
        "The Siemens PLC is down on the packaging line and needs support."
    });
    assert.equal(emergencyResult.generatedProfile.urgency, "Required today");
    assert.equal(
      emergencyResult.generatedProfile.title,
      "Urgent Siemens PLC fault on packaging line"
    );
  });

  test("retains the supplied robotics safety, vision, training, and staging scope", () => {
    const result = structureRequirementLocally({
      rawRequirement:
        "We want to automate mixed-carton pallet loading on our packaging line in Western Sydney. We need a robotic arm cell with vision, safe guarding, operator training and a staged installation that avoids disrupting adjacent production. Target commissioning is within 60 days and the approved budget is AUD 120,000."
    });

    assert.equal(
      result.generatedProfile.title,
      "Robotic palletising cell integration"
    );
    assert.equal(result.generatedProfile.category, "Robotics integration");
    assert.deepEqual(
      new Set(result.generatedProfile.requiredCapabilities),
      new Set([
        "Robotic systems integration",
        "Palletising cell integration",
        "Machine vision integration",
        "Machinery safety",
        "Operator training",
        "Site commissioning"
      ])
    );
    assert.ok(
      result.generatedProfile.certificationsOrConstraints.includes(
        "Maintain adjacent production access"
      )
    );
    assert.ok(
      result.generatedProfile.certificationsOrConstraints.includes(
        "Operator training required"
      )
    );
    assert.equal(result.generatedProfile.budgetRange, "Up to AUD 120,000");
    assert.equal(result.generatedProfile.urgency, "Within 60 days");
    assert.ok(!result.missingFields.includes("required response timing"));
  });
});
