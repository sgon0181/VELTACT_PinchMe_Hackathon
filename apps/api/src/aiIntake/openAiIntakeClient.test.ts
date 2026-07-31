import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AI_INTAKE_RAW_REQUIREMENT_MAX_LENGTH,
  AI_INTAKE_RAW_REQUIREMENT_MAX_MESSAGE
} from "@veltact/contracts";
import { structureRequirementWithOpenAi } from "./openAiIntakeClient.js";

test("oversized raw intake cannot reach the paid model client", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("paid model fetch should not run");
  };

  try {
    await assert.rejects(
      structureRequirementWithOpenAi({
        rawRequirement: "x".repeat(
          AI_INTAKE_RAW_REQUIREMENT_MAX_LENGTH + 1
        )
      }),
      (error: unknown) =>
        error instanceof Error &&
        error.message === AI_INTAKE_RAW_REQUIREMENT_MAX_MESSAGE
    );
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
