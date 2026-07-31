import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  AI_INTAKE_RAW_REQUIREMENT_MAX_LENGTH,
  AI_INTAKE_RAW_REQUIREMENT_MAX_MESSAGE,
  aiIntakeResultSchema,
  aiIntakeStructureRequestSchema
} from "../dist/index.js";

describe("AI intake request boundaries", () => {
  test("shares one inclusive raw-requirement maximum across request and result schemas", () => {
    const accepted = "x".repeat(AI_INTAKE_RAW_REQUIREMENT_MAX_LENGTH);
    const rejected = `${accepted}x`;

    assert.equal(
      aiIntakeStructureRequestSchema.parse({
        rawRequirement: accepted
      }).rawRequirement.length,
      AI_INTAKE_RAW_REQUIREMENT_MAX_LENGTH
    );
    const requestFailure = aiIntakeStructureRequestSchema.safeParse({
      rawRequirement: rejected
    });
    assert.equal(requestFailure.success, false);
    assert.equal(
      requestFailure.error.issues[0]?.message,
      AI_INTAKE_RAW_REQUIREMENT_MAX_MESSAGE
    );

    const resultFailure = aiIntakeResultSchema.safeParse({
      rawRequirement: rejected,
      generatedProfile: {
        title: "Industrial requirement",
        problemSummary: rejected,
        category: "Industrial services"
      }
    });
    assert.equal(resultFailure.success, false);
    assert.equal(
      resultFailure.error.issues[0]?.message,
      AI_INTAKE_RAW_REQUIREMENT_MAX_MESSAGE
    );
  });
});
