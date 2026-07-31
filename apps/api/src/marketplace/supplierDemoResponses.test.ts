import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  getSupplierDemoResponses,
  supplierDemoScenarioFromRequirement
} from "./supplierDemoResponses.js";

describe("deterministic supplier response fixtures", () => {
  test("provides two labelled and contrasting PLC responses", () => {
    const responses = getSupplierDemoResponses("plc");

    assert.equal(responses.length, 2);
    assert.deepEqual(
      responses.map((entry) => entry.evidenceLabel),
      ["Fixture", "Fixture"]
    );
    assert.deepEqual(
      new Set(responses.map((entry) => entry.tradeOff)),
      new Set(["fastest_response", "lower_price"])
    );
    const fastest = responses.find(
      (entry) => entry.tradeOff === "fastest_response"
    );
    const lowerPrice = responses.find(
      (entry) => entry.tradeOff === "lower_price"
    );
    assert.ok(fastest);
    assert.ok(lowerPrice);
    assert.ok(
      lowerPrice.response.indicativePriceAud <
        fastest.response.indicativePriceAud
    );
    assert.notEqual(
      lowerPrice.response.earliestAvailability,
      fastest.response.earliestAvailability
    );
  });

  test("provides two complete and isolated robotics responses", () => {
    const firstRead = getSupplierDemoResponses("robotics");
    const secondRead = getSupplierDemoResponses("robotics");

    assert.equal(firstRead.length, 2);
    for (const entry of firstRead) {
      assert.equal(entry.scenario, "robotics");
      assert.match(entry.label, /\(Fixture\)$/);
      assert.ok(entry.response.relevantExperience.length > 40);
      assert.ok(entry.response.proposedApproach.length > 40);
      assert.ok(entry.response.assumptions.length >= 2);
      assert.ok(entry.response.conditions.length >= 2);
    }

    const axisForge = firstRead.find(
      (entry) => entry.response.indicativePriceAud === 18500
    );
    const harbourMotion = firstRead.find(
      (entry) => entry.response.indicativePriceAud === 12800
    );
    assert.ok(axisForge);
    assert.ok(harbourMotion);
    assert.equal(axisForge.response.earliestAvailability, "2026-08-01");
    assert.equal(harbourMotion.response.earliestAvailability, "2026-07-31");
    assert.match(axisForge.response.relevantExperience, /AxisForge/i);
    assert.match(harbourMotion.response.relevantExperience, /Harbour Motion/i);
    assert.match(axisForge.response.proposedApproach, /proof of process/i);
    assert.match(harbourMotion.response.proposedApproach, /offline cycle simulation/i);
    assert.match(axisForge.response.conditions.join(" "), /tooling and vision proof plan/i);
    assert.match(harbourMotion.response.conditions.join(" "), /controls-interface review/i);
    assert.ok(
      harbourMotion.response.indicativePriceAud <
        axisForge.response.indicativePriceAud
    );
    assert.match(harbourMotion.label, /earlier, lower offer/i);
    assert.doesNotMatch(axisForge.label, /lower.price|earliest|fastest/i);
    assert.equal(harbourMotion.tradeOff, "fastest_response");
    assert.equal(axisForge.tradeOff, "proof_first_scope");
    assert.notEqual(
      axisForge.response.proposedApproach,
      harbourMotion.response.proposedApproach
    );

    firstRead[0].response.assumptions.push("Mutation from one caller");
    assert.equal(secondRead[0].response.assumptions.length, 2);
  });

  test("selects the guided scenario deterministically from requirement text", () => {
    assert.equal(
      supplierDemoScenarioFromRequirement(
        "Plan an ABB mixed-carton robotic palletising cell"
      ),
      "robotics"
    );
    assert.equal(
      supplierDemoScenarioFromRequirement(
        "Recover a Siemens PLC-controlled packaging conveyor"
      ),
      "plc"
    );
    assert.equal(
      supplierDemoScenarioFromRequirement(
        "Diagnose an overheating conveyor motor gearbox"
      ),
      "general"
    );
  });

  test("keeps every fixture price valid for the supplier form", () => {
    for (const scenario of ["plc", "robotics", "general"] as const) {
      for (const entry of getSupplierDemoResponses(scenario)) {
        assert.equal(entry.response.indicativePriceAud % 100, 0);
      }
    }
  });

  test("templates complete generic responses from requirement capability", () => {
    const responses = getSupplierDemoResponses(
      "general",
      "Conveyor gearbox requires industrial mechanical maintenance"
    );
    const rendered = JSON.stringify(responses);

    assert.equal(responses.length, 2);
    assert.match(rendered, /gearbox diagnostics/i);
    assert.doesNotMatch(rendered, /Siemens|\bPLC\b|controller|backup/i);
    assert.notEqual(
      responses[0].response.indicativePriceAud,
      responses[1].response.indicativePriceAud
    );
    assert.ok(
      responses.every(
        (entry) =>
          entry.company.companyName &&
          entry.company.contactName &&
          entry.company.contactEmail &&
          entry.company.contactPhone
      )
    );
  });
});
