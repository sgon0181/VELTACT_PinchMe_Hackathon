import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AI_INTAKE_RAW_REQUIREMENT_MAX_LENGTH,
  AI_INTAKE_RAW_REQUIREMENT_MAX_MESSAGE
} from "@veltact/contracts";

test("buyer fallback keeps a planned Siemens PLC shutdown on its stated six-week timeline", async () => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    location: { origin: "http://localhost:4001" },
    setTimeout(callback) {
      queueMicrotask(callback);
      return 0;
    }
  };

  try {
    const { DemoAiIntakeService } = await import(
      `../public/assets/aiIntakeService.js?planned-plc=${Date.now()}`
    );
    const service = new DemoAiIntakeService();
    const result = await service.structureRequirement({
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

    const emergencyResult = await service.structureRequirement({
      rawRequirement:
        "The Siemens PLC is down on the packaging line and needs support."
    });
    assert.equal(emergencyResult.generatedProfile.urgency, "Required today");
    assert.equal(
      emergencyResult.generatedProfile.title,
      "Urgent Siemens PLC fault on packaging line"
    );
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
});

test("buyer fallback rejects binary-only evidence instead of reading its filename as facts", async () => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    location: { origin: "http://localhost:4001" },
    setTimeout(callback) {
      queueMicrotask(callback);
      return 0;
    }
  };

  try {
    const { DemoAiIntakeService } = await import(
      `../public/assets/aiIntakeService.js?binary-only=${Date.now()}`
    );
    const service = new DemoAiIntakeService();
    await assert.rejects(
      service.structureRequirement({
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
      (error) =>
        error instanceof Error &&
        /cannot read binary-only/i.test(error.message) &&
        !/urgent-siemens-plc-fault-18000\.jpeg/i.test(error.message)
    );
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
});

test("rejects oversized context before fetch and recovers friendly errors from non-JSON responses", async () => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.window = {
    location: { origin: "http://localhost:4001" },
    setTimeout: globalThis.setTimeout.bind(globalThis)
  };
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response("upstream payload rejection", {
      status: 413,
      headers: { "content-type": "text/plain" }
    });
  };

  try {
    const { BackendAiIntakeService } = await import(
      `../public/assets/aiIntakeService.js?limits=${Date.now()}`
    );
    const service = new BackendAiIntakeService();

    await assert.rejects(
      service.structureRequirement({
        rawRequirement: "x".repeat(
          AI_INTAKE_RAW_REQUIREMENT_MAX_LENGTH + 1
        )
      }),
      new RegExp(AI_INTAKE_RAW_REQUIREMENT_MAX_MESSAGE.replace(/[,.]/g, "\\$&"))
    );
    assert.equal(fetchCalls, 0, "oversized input must not reach any provider");

    await assert.rejects(
      service.structureRequirement({
        rawRequirement:
          "A conveyor motor fault at our industrial factory needs onsite repair tomorrow."
      }),
      /HTTP 413.*Check the factory context and try again/i
    );
    assert.equal(fetchCalls, 1);
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
    globalThis.fetch = previousFetch;
  }
});
