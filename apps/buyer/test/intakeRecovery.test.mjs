import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const mainBundle = await readFile(
  new URL("../public/assets/main.js", import.meta.url),
  "utf8"
);
const helperStart = mainBundle.indexOf("class IntakeTimeoutError");
const helperEnd = mainBundle.indexOf(
  "\nasync function analyseRequirement",
  helperStart
);

assert.notEqual(helperStart, -1, "intake timeout helper should exist");
assert.notEqual(helperEnd, -1, "intake recovery helpers should be bounded");

const sandbox = {
  window: {
    setTimeout,
    clearTimeout
  }
};
vm.runInNewContext(
  `${mainBundle.slice(helperStart, helperEnd)}
this.structureIntakeWithFallback = structureIntakeWithFallback;
this.isCurrentIntakeRequest = isCurrentIntakeRequest;
this.localFallbackMessage = localFallbackMessage;`,
  sandbox
);

test("falls back locally when configured OpenAI intake is unavailable", async () => {
  let fallbackCalls = 0;
  const localResult = { generatedProfile: { title: "Local draft" } };
  const outcome = await sandbox.structureIntakeWithFallback(
    {
      async structureRequirement() {
        throw { message: "fetch failed" };
      },
      sourceMode() {
        return "live";
      }
    },
    {
      async structureRequirement() {
        fallbackCalls += 1;
        return localResult;
      },
      sourceMode() {
        return "fixture";
      }
    },
    { rawRequirement: "Siemens PLC packaging line fault" },
    100
  );

  assert.equal(fallbackCalls, 1);
  assert.equal(outcome.result, localResult);
  assert.equal(outcome.sourceMode, "fixture");
  assert.equal(outcome.fallbackReason, "unavailable");
  assert.match(
    sandbox.localFallbackMessage(outcome.fallbackReason),
    /PDF\/photo content remains unprocessed/i
  );
});

test("bounds a slow AI request and keeps the local intake path available", async () => {
  const outcome = await sandbox.structureIntakeWithFallback(
    {
      structureRequirement() {
        return new Promise(() => {});
      },
      sourceMode() {
        return "live";
      }
    },
    {
      async structureRequirement() {
        return { generatedProfile: { title: "Bounded local draft" } };
      },
      sourceMode() {
        return "fixture";
      }
    },
    { rawRequirement: "ABB robotic palletising cell integration" },
    5
  );

  assert.equal(outcome.sourceMode, "fixture");
  assert.equal(outcome.fallbackReason, "slow");
});

test("does not hide buyer-correctable intake validation errors", async () => {
  let fallbackCalls = 0;
  await assert.rejects(
    sandbox.structureIntakeWithFallback(
      {
        async structureRequirement() {
          throw new Error(
            "Add a little more context, such as the equipment, fault, location, or timing."
          );
        },
        sourceMode() {
          return "live";
        }
      },
      {
        async structureRequirement() {
          fallbackCalls += 1;
          return {};
        },
        sourceMode() {
          return "fixture";
        }
      },
      { rawRequirement: "help" },
      100
    ),
    /Add a little more context/
  );
  assert.equal(fallbackCalls, 0);
});

test("a newer edit or manual-mode switch invalidates an in-flight AI result", () => {
  assert.equal(
    sandbox.isCurrentIntakeRequest(4, 4, "ai", "ai"),
    true
  );
  assert.equal(
    sandbox.isCurrentIntakeRequest(4, 5, "ai", "ai"),
    false
  );
  assert.equal(
    sandbox.isCurrentIntakeRequest(4, 4, "ai", "manual"),
    false
  );
});
