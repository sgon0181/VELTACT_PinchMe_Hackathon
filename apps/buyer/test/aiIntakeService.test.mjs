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

test("buyer fallback preserves grain-terminal contamination and repair scope", async () => {
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
      `../public/assets/aiIntakeService.js?grain-terminal=${Date.now()}`
    );
    const service = new DemoAiIntakeService();
    const result = await service.structureRequirement({
      rawRequirement:
        "At our bulk grain export terminal in Port Lincoln SA, the main shiploader feed conveyor motor and gearbox are overheating and tripping. We need a mechanical and electrical industrial maintenance team within 24 hours to diagnose and complete an authorised repair without contaminating grain handling areas. Our callout and initial repair tolerance is $14,500, with any additional parts subject to approval."
    });

    assert.equal(
      result.generatedProfile.title,
      "Urgent grain conveyor motor and gearbox repair"
    );
    assert.equal(result.generatedProfile.buyerPriority, "speed");
    assert.ok(
      result.generatedProfile.equipmentOrTechnology.includes(
        "Industrial conveyor"
      )
    );
    assert.ok(
      result.generatedProfile.requiredCapabilities.includes(
        "Industrial mechanical maintenance"
      )
    );
    assert.ok(
      result.generatedProfile.requiredCapabilities.includes(
        "Industrial electrical maintenance"
      )
    );
    assert.ok(
      result.generatedProfile.certificationsOrConstraints.includes(
        "Grain handling contamination controls"
      )
    );
    assert.ok(
      result.generatedProfile.certificationsOrConstraints.includes(
        "Minimal downtime"
      )
    );
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
});

test("buyer fallback retains wastewater timing and continuity constraints", async () => {
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
      `../public/assets/aiIntakeService.js?wastewater=${Date.now()}`
    );
    const service = new DemoAiIntakeService();
    const result = await service.structureRequirement({
      rawRequirement:
        "At our wastewater treatment plant in Ballarat VIC, the sludge dewatering conveyor gearbox is leaking oil and running hot. We need an industrial mechanical maintenance contractor within 5 calendar days while bypass pumping keeps the process stable. Approved budget range is AUD 28,000-36,000."
    });

    assert.equal(result.generatedProfile.urgency, "Within 5 calendar days");
    assert.ok(
      result.generatedProfile.certificationsOrConstraints.includes(
        "Wastewater treatment environment"
      )
    );
    assert.ok(
      result.generatedProfile.certificationsOrConstraints.includes(
        "Maintain wastewater process continuity"
      )
    );
    assert.ok(!result.missingFields.includes("required response timing"));
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
});

test("buyer fallback classifies a compressor motor under refrigeration", async () => {
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
      `../public/assets/aiIntakeService.js?refrigeration-motor=${Date.now()}`
    );
    const service = new DemoAiIntakeService();
    const result = await service.structureRequirement({
      rawRequirement:
        "At our ammonia cold store in Launceston TAS, the refrigeration compressor drive motor has high bearing vibration and intermittent overload trips. We need a licensed industrial refrigeration contractor within 3 business days to inspect and complete an authorised repair while the cold rooms remain temperature controlled. Our budget is roughly 60k AUD including callout and approved parts."
    });

    assert.equal(
      result.generatedProfile.category,
      "Industrial refrigeration maintenance"
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
