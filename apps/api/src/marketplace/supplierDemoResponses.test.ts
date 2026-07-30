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
