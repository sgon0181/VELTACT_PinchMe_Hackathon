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
