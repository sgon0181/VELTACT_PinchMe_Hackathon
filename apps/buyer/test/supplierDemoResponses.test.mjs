import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  demoPresetIndexForInvitationToken,
  demoResponsesForRequirement
} from "../public/supplierDemoResponses.js";

describe("supplier response fixture form compatibility", () => {
  test("uses valid $100 price increments in both demo scenarios", () => {
    for (const requirement of [
      "Recover a Siemens PLC packaging line",
      "Plan a robotic palletising cell"
    ]) {
      for (const response of demoResponsesForRequirement(requirement)) {
        assert.equal(response.indicativePriceAud % 100, 0);
      }
    }
  });

  test("provides complete fixture identity without accepting confirmation", () => {
    for (const requirement of [
      "Recover a Siemens PLC packaging line",
      "Plan a robotic palletising cell",
      "Diagnose an overheating conveyor gearbox"
    ]) {
      for (const response of demoResponsesForRequirement(requirement)) {
        assert.ok(response.company.companyName);
        assert.ok(response.company.contactName);
        assert.match(response.company.contactEmail, /@fixture\.veltact\.test$/);
        assert.match(response.company.contactPhone, /^\+61/);
        assert.equal(response.sourceDisclosureAccepted, undefined);
      }
    }
  });

  test("uses generic requirement capabilities without leaking PLC fixture copy", () => {
    const responses = demoResponsesForRequirement(
      "Conveyor gearbox needs industrial gearbox diagnostics and mechanical maintenance"
    );
    const rendered = JSON.stringify(responses);

    assert.equal(responses.length, 2);
    assert.match(rendered, /gearbox diagnostics/i);
    assert.doesNotMatch(rendered, /Siemens|\bPLC\b|controller|backup/i);
    assert.notEqual(
      responses[0].indicativePriceAud,
      responses[1].indicativePriceAud
    );
  });

  test("keeps the deterministic robotics offers visibly distinct", () => {
    const responses = demoResponsesForRequirement(
      "Plan an ABB mixed-carton robotic palletising cell"
    );
    const axisForge = responses.find(
      (response) => response.indicativePriceAud === 18500
    );
    const harbourMotion = responses.find(
      (response) => response.indicativePriceAud === 12800
    );

    assert.ok(axisForge);
    assert.ok(harbourMotion);
    assert.equal(axisForge.earliestAvailability, "2026-08-01");
    assert.equal(harbourMotion.earliestAvailability, "2026-07-31");
    assert.match(axisForge.relevantExperience, /AxisForge/i);
    assert.match(harbourMotion.relevantExperience, /Harbour Motion/i);
    assert.match(axisForge.proposedApproach, /proof of process/i);
    assert.match(harbourMotion.proposedApproach, /offline cycle simulation/i);
    assert.match(axisForge.conditions.join(" "), /tooling and vision proof plan/i);
    assert.match(harbourMotion.conditions.join(" "), /controls-interface review/i);
    assert.ok(
      harbourMotion.indicativePriceAud < axisForge.indicativePriceAud
    );
    assert.match(harbourMotion.label, /earlier value/i);
    assert.doesNotMatch(axisForge.label, /lower|earliest|fastest/i);
    assert.notEqual(axisForge.proposedApproach, harbourMotion.proposedApproach);
  });

  test("spreads deterministic invitation tokens across available presets", () => {
    const indices = new Set(
      [
        "supplier-invitation-a",
        "supplier-invitation-b",
        "supplier-invitation-c",
        "supplier-invitation-d"
      ].map((token) => demoPresetIndexForInvitationToken(token, 2))
    );

    assert.deepEqual(indices, new Set([0, 1]));
    assert.equal(demoPresetIndexForInvitationToken("", 2), 0);
  });
});
