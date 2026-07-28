import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type {
  MarketplaceNeedProfile,
  SolutionDecision
} from "@veltact/contracts";
import { createMarketplaceFixtureResearch } from "./findFixtures.js";
import {
  createNeedReportRecord,
  readNeedReportPdf
} from "./needReport.js";

describe("persisted need report", () => {
  test("renders all pathways and visibly marks the single selected pathway", () => {
    const needProfileId = "need-report-plc";
    const profile = plcNeed();
    const researchResult = createMarketplaceFixtureResearch(
      needProfileId,
      profile,
      new Date("2026-07-28T00:00:00.000Z")
    );
    const selectedApproach = researchResult.approaches[1];
    const solutionDecision: SolutionDecision = {
      id: "decision-report-plc",
      needProfileId,
      researchResultId: researchResult.id,
      decision: "outsource",
      selectedApproachIds: [selectedApproach.id],
      buyerNote: "Use a specialist for controlled recovery.",
      approvedBy: "buyer@example.com",
      approvedAt: "2026-07-28T00:00:00.000Z"
    };

    const report = createNeedReportRecord({
      needProfileId,
      profile,
      researchResult,
      solutionDecision
    });
    const pdf = readNeedReportPdf(report);
    const pdfText = pdf.toString("latin1");

    assert.equal(pdf.subarray(0, 8).toString(), "%PDF-1.4");
    assert.equal(report.sourceMode, "fixture");
    assert.equal(report.selectedApproachId, selectedApproach.id);
    assert.equal(report.byteLength, pdf.byteLength);
    assert.equal(report.sha256.length, 64);
    assert.match(pdfText, /VELTACT NEED AND SOLUTION REPORT/);
    assert.match(pdfText, /Safe evidence capture and specialist triage/);
    assert.match(
      pdfText,
      /SELECTED - Controlled recovery from a verified baseline/
    );
    assert.match(pdfText, /Validation and recurrence prevention/);
    assert.match(pdfText, /EVIDENCE AND CITATIONS/);
    assert.match(pdfText, /SAFETY NOTICE/);
  });

  test("rejects a persisted PDF whose bytes no longer match its integrity metadata", () => {
    const needProfileId = "need-report-integrity";
    const profile = plcNeed();
    const researchResult = createMarketplaceFixtureResearch(
      needProfileId,
      profile,
      new Date("2026-07-28T00:00:00.000Z")
    );
    const solutionDecision: SolutionDecision = {
      id: "decision-report-integrity",
      needProfileId,
      researchResultId: researchResult.id,
      decision: "hybrid",
      selectedApproachIds: [researchResult.approaches[1].id],
      approvedBy: "buyer@example.com",
      approvedAt: "2026-07-28T00:00:00.000Z"
    };
    const report = createNeedReportRecord({
      needProfileId,
      profile,
      researchResult,
      solutionDecision
    });

    assert.throws(
      () =>
        readNeedReportPdf({
          ...report,
          pdfBase64: `${report.pdfBase64.slice(0, -4)}AAAA`
        }),
      /integrity check/
    );
  });
});

function plcNeed(): MarketplaceNeedProfile {
  return {
    title: "Recover a stopped Siemens PLC packaging line",
    description:
      "The line stopped after an intermittent controller communication fault.",
    problemSummary:
      "Restore the stopped Siemens packaging line safely and preserve a verified baseline.",
    category: "Industrial automation breakdown",
    industry: "Food packaging manufacturing",
    equipmentOrTechnology: ["Siemens S7 PLC", "Packaging conveyor"],
    location: "Western Sydney, NSW",
    urgencyDays: 1,
    budgetAud: 20_000,
    constraints: ["Licensed electrical work required"],
    buyerPriority: "speed",
    requiredCapabilities: [
      "Siemens PLC diagnostics",
      "Industrial networking"
    ]
  };
}
