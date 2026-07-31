import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  PRE_NEED_INTAKE_DRAFT_KEY,
  intakeRawRequirementGuidance,
  parsePreNeedIntakeDraft,
  serializePreNeedIntakeDraft,
  validateIntakeRawRequirement
} from "../public/assets/intakeDraftPersistence.js";

const reviewedRequirement = {
  companyName: "Top End Cold Storage",
  contactName: "Amelia Tran",
  contactEmail: "amelia@example.com",
  title: "Urgent ammonia refrigeration compressor repair",
  description:
    "Ammonia refrigeration compressor vibration at a Darwin cold store needs a licensed contractor within 12 hours.",
  category: "Industrial refrigeration maintenance",
  equipmentOrTechnology: [
    "Ammonia refrigeration system",
    "Industrial refrigeration compressor"
  ],
  requiredCapabilities: [
    "Ammonia refrigeration service",
    "Licensed refrigeration contractor"
  ],
  location: "Darwin, NT",
  requiredBy: "Within 12 hours",
  budgetRange: "Up to AUD 28,000",
  budgetAmount: 28_000,
  constraints: [
    "Temperature-critical cold storage",
    "Minimal downtime"
  ]
};

describe("pre-Need intake draft persistence", () => {
  test("restores reviewed structured fields and attachment summaries without binary bytes", () => {
    const serialized = serializePreNeedIntakeDraft({
      requirementInput: reviewedRequirement,
      priority: "speed",
      intakeSourceMode: "fixture",
      intakeResult: {
        rawRequirement: reviewedRequirement.description,
        generatedProfile: {
          title: reviewedRequirement.title,
          problemSummary: reviewedRequirement.description,
          category: reviewedRequirement.category,
          equipmentOrTechnology:
            reviewedRequirement.equipmentOrTechnology,
          requiredCapabilities: reviewedRequirement.requiredCapabilities,
          location: reviewedRequirement.location,
          urgency: reviewedRequirement.requiredBy,
          budgetRange: reviewedRequirement.budgetRange,
          certificationsOrConstraints: reviewedRequirement.constraints,
          buyerPriority: "speed"
        },
        confidence: 0.92,
        missingFields: []
      },
      evidence: [
        {
          kind: "photo",
          name: "compressor-nameplate.jpg",
          mimeType: "image/jpeg",
          dataUrl: "data:image/jpeg;base64,SECRET-BINARY"
        },
        {
          kind: "written",
          name: "Operator notes",
          mimeType: "text/plain",
          extractedText: "Repeated low oil-pressure alarms."
        }
      ]
    });

    assert.equal(
      PRE_NEED_INTAKE_DRAFT_KEY,
      "veltact:rapidmatch:pre-need-intake-draft"
    );
    assert.doesNotMatch(serialized, /SECRET-BINARY/);

    const restored = parsePreNeedIntakeDraft(serialized);
    assert.deepEqual(
      restored?.requirementInput,
      reviewedRequirement
    );
    assert.equal(restored?.intakeResult?.confidence, 0.92);
    assert.equal(restored?.evidence[0]?.name, "compressor-nameplate.jpg");
    assert.equal(restored?.evidence[0]?.dataUrl, undefined);
    assert.equal(
      restored?.evidence[1]?.extractedText,
      "Repeated low oil-pressure alarms."
    );
  });

  test("recovers safely from malformed or obsolete session JSON", () => {
    assert.equal(parsePreNeedIntakeDraft("{broken"), undefined);
    assert.equal(
      parsePreNeedIntakeDraft(
        JSON.stringify({
          version: 2,
          requirementInput: reviewedRequirement
        })
      ),
      undefined
    );
  });

  test("uses the shared minimum and maximum for guidance and validation", () => {
    assert.match(validateIntakeRawRequirement(""), /at least 24/i);
    assert.match(
      intakeRawRequirementGuidance("short"),
      /19 more characters/i
    );
    assert.equal(
      validateIntakeRawRequirement("x".repeat(8_000)),
      ""
    );
    assert.match(
      validateIntakeRawRequirement("x".repeat(8_001)),
      /8,000 characters or fewer/i
    );
  });
});
