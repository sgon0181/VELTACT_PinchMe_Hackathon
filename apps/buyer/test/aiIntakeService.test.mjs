import assert from "node:assert/strict";
import { test } from "node:test";

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
