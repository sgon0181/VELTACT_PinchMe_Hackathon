import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import {
  solutionDecisionSchema,
  solutionResearchResultSchema,
  supplierLeadSchema
} from "@veltact/contracts";
import { env } from "../env.js";
import {
  claimSupplierInvitation,
  createNeed,
  createSolutionDecision,
  discoverNeedSuppliers,
  getInvitation,
  getNeed,
  getNeedReportForNeed,
  getOrCreateNeedReport,
  getResearchResultForNeed,
  getSolutionDecisionForNeed,
  listSupplierLeadsForNeed,
  prepareSupplierLeadInvitationsForNeed,
  reloadMarketplaceStore,
  researchNeed,
  resetMarketplaceStore,
  sendSupplierOutreachForNeed
} from "./store.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  Object.assign(env, { MARKETPLACE_DATA_FILE: undefined });
  resetMarketplaceStore();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("canonical Marketplace Find persistence", { concurrency: false }, () => {
  test("persists and reloads research, decision, discovery provenance and claims", async () => {
    resetMarketplaceStore();
    const directory = mkdtempSync(
      path.join(os.tmpdir(), "veltact-marketplace-find-")
    );
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "marketplace.json");
    const originalProvider = env.VELTACT_RESEARCH_PROVIDER;
    const originalDataFile = env.MARKETPLACE_DATA_FILE;
    Object.assign(env, {
      MARKETPLACE_DATA_FILE: filePath,
      VELTACT_RESEARCH_PROVIDER: "fixture"
    });

    try {
      const need = createNeed({
        buyerEmail: "buyer@example.com",
        profile: plcNeed()
      });
      const researched = await researchNeed(need.id);
      assert.ok(researched);
      const decision = createSolutionDecision(need.id, {
        decision: "hybrid",
        selectedApproachIds: [
          researched.researchResult.approaches[1].id
        ]
      });
      assert.equal(decision.status, "created");
      const discovered = await discoverNeedSuppliers(need.id);
      assert.equal(discovered.status, "discovered");
      const prepared = prepareSupplierLeadInvitationsForNeed(need.id);
      assert.equal(prepared.status, "prepared");
      if (prepared.status !== "prepared") return;
      await sendSupplierOutreachForNeed(
        need.id,
        undefined,
        new Set(prepared.supplierLeadIds)
      );
      const invitation = prepared.invitations[0];
      const claimed = claimSupplierInvitation(invitation.token, {
        claimantName: "Fixture supplier"
      });
      assert.equal(claimed.status, "claimed");

      const persisted = JSON.parse(readFileSync(filePath, "utf8")) as {
        version: number;
        researchResults: unknown[];
        solutionDecisions: unknown[];
        needReports: Array<{
          selectedApproachId: string;
          solutionDecisionId?: string;
          selectionProvenance: {
            source: string;
            selectedBy: string;
            selectedAt: string;
          };
          pdfBase64: string;
          sha256: string;
        }>;
        supplierLeads: unknown[];
        supplierClaims: unknown[];
      };
      assert.equal(persisted.version, 3);
      assert.equal(persisted.researchResults.length, 1);
      assert.equal(persisted.solutionDecisions.length, 1);
      assert.equal(persisted.needReports.length, 1);
      assert.equal(
        persisted.needReports[0].selectedApproachId,
        researched.researchResult.approaches[1].id
      );
      assert.equal(
        persisted.needReports[0].selectionProvenance.source,
        "solution_decision"
      );
      assert.equal(
        persisted.needReports[0].solutionDecisionId,
        getSolutionDecisionForNeed(need.id)?.id
      );
      assert.ok(persisted.needReports[0].pdfBase64.length > 100);
      assert.equal(persisted.needReports[0].sha256.length, 64);
      assert.equal(persisted.supplierLeads.length, 3);
      assert.equal(persisted.supplierClaims.length, 6);

      Object.assign(env, { MARKETPLACE_DATA_FILE: undefined });
      resetMarketplaceStore();
      assert.equal(getNeed(need.id), undefined);

      assert.equal(reloadMarketplaceStore(filePath), true);
      const reloadedNeed = getNeed(need.id);
      assert.ok(reloadedNeed);
      assert.doesNotThrow(() =>
        solutionResearchResultSchema.parse(
          getResearchResultForNeed(need.id)
        )
      );
      assert.doesNotThrow(() =>
        solutionDecisionSchema.parse(getSolutionDecisionForNeed(need.id))
      );
      assert.deepEqual(
        getNeedReportForNeed(need.id),
        persisted.needReports[0]
      );
      const report = getOrCreateNeedReport(need.id);
      assert.equal(report.status, "ready");
      if (report.status === "ready") {
        assert.equal(report.pdf.subarray(0, 8).toString(), "%PDF-1.4");
        assert.equal(
          report.report.selectedApproachId,
          researched.researchResult.approaches[1].id
        );
      }
      assert.doesNotThrow(() =>
        supplierLeadSchema.array().parse(
          listSupplierLeadsForNeed(need.id)
        )
      );
      assert.ok(
        listSupplierLeadsForNeed(need.id).every(
          (lead) =>
            lead.sourceMode === "fixture" &&
            lead.evidence.every(
              (evidence) => evidence.provider === "fixture"
            )
        )
      );
      assert.deepEqual(
        listSupplierLeadsForNeed(need.id).map(
          (lead) => lead.lifecycleStatus
        ),
        ["claimed", "invited", "invited"]
      );
      const reloadedInvitation = getInvitation(invitation.token);
      assert.equal(reloadedInvitation?.status, "opened");
      assert.equal(
        reloadedNeed?.invitations.find(
          (candidate) => candidate.id === invitation.id
        ),
        reloadedInvitation
      );
    } finally {
      Object.assign(env, {
        MARKETPLACE_DATA_FILE: undefined,
        VELTACT_RESEARCH_PROVIDER: originalProvider
      });
      resetMarketplaceStore();
      Object.assign(env, { MARKETPLACE_DATA_FILE: originalDataFile });
    }
  });

  test("persists report selection provenance without an execution decision", async () => {
    resetMarketplaceStore();
    const directory = mkdtempSync(
      path.join(os.tmpdir(), "veltact-marketplace-report-selection-")
    );
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "marketplace.json");
    const originalProvider = env.VELTACT_RESEARCH_PROVIDER;
    const originalDataFile = env.MARKETPLACE_DATA_FILE;
    Object.assign(env, {
      MARKETPLACE_DATA_FILE: filePath,
      VELTACT_RESEARCH_PROVIDER: "fixture"
    });

    try {
      const need = createNeed({
        buyerEmail: "buyer@example.com",
        profile: plcNeed()
      });
      const researched = await researchNeed(need.id);
      assert.ok(researched);
      const selectedApproachId =
        researched.researchResult.approaches[1].id;
      const selectedAt = new Date("2026-07-28T02:00:00.000Z");
      const generated = getOrCreateNeedReport(
        need.id,
        selectedApproachId,
        selectedAt
      );
      assert.equal(generated.status, "ready");
      if (generated.status !== "ready") return;
      assert.equal(getSolutionDecisionForNeed(need.id), undefined);
      assert.deepEqual(generated.report.selectionProvenance, {
        source: "report_request",
        selectedBy: "buyer@example.com",
        selectedAt: selectedAt.toISOString()
      });
      assert.equal(generated.report.solutionDecisionId, undefined);

      const persisted = JSON.parse(readFileSync(filePath, "utf8")) as {
        solutionDecisions: unknown[];
        needReports: Array<{
          selectedApproachId: string;
          solutionDecisionId?: string;
          selectionProvenance: {
            source: string;
            selectedBy: string;
            selectedAt: string;
          };
        }>;
      };
      assert.deepEqual(persisted.solutionDecisions, []);
      assert.equal(persisted.needReports.length, 1);
      assert.equal(
        persisted.needReports[0].selectedApproachId,
        selectedApproachId
      );
      assert.deepEqual(
        persisted.needReports[0].selectionProvenance,
        generated.report.selectionProvenance
      );
      assert.equal(
        persisted.needReports[0].solutionDecisionId,
        undefined
      );

      Object.assign(env, { MARKETPLACE_DATA_FILE: undefined });
      resetMarketplaceStore();
      assert.equal(reloadMarketplaceStore(filePath), true);
      const repeated = getOrCreateNeedReport(
        need.id,
        selectedApproachId,
        new Date("2026-07-28T03:00:00.000Z")
      );
      assert.equal(repeated.status, "ready");
      if (repeated.status === "ready") {
        assert.deepEqual(repeated.pdf, generated.pdf);
        assert.deepEqual(
          repeated.report.selectionProvenance,
          generated.report.selectionProvenance
        );
      }
    } finally {
      Object.assign(env, {
        MARKETPLACE_DATA_FILE: undefined,
        VELTACT_RESEARCH_PROVIDER: originalProvider
      });
      resetMarketplaceStore();
      Object.assign(env, { MARKETPLACE_DATA_FILE: originalDataFile });
    }
  });

  test("allows a claim from a version 1 invitation with recorded delivery", () => {
    resetMarketplaceStore();
    const directory = mkdtempSync(
      path.join(os.tmpdir(), "veltact-marketplace-v1-find-")
    );
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "marketplace.json");
    const originalDataFile = env.MARKETPLACE_DATA_FILE;
    Object.assign(env, { MARKETPLACE_DATA_FILE: filePath });

    try {
      const need = createNeed({
        buyerEmail: "buyer@example.com",
        profile: plcNeed()
      });
      const token = need.invitations[0].token;
      const sentAt = "2026-07-20T01:00:00.000Z";
      const snapshot = JSON.parse(readFileSync(filePath, "utf8")) as Record<
        string,
        any
      >;
      snapshot.version = 1;
      delete snapshot.researchResults;
      delete snapshot.solutionDecisions;
      delete snapshot.needReports;
      delete snapshot.supplierLeads;
      delete snapshot.supplierClaims;
      delete snapshot.needs[0].outreachApprovedAt;
      snapshot.needs[0].invitations[0].status = "sent";
      snapshot.needs[0].invitations[0].sentAt = sentAt;
      snapshot.invitations[0].status = "sent";
      snapshot.invitations[0].sentAt = sentAt;
      writeFileSync(filePath, JSON.stringify(snapshot), "utf8");

      Object.assign(env, { MARKETPLACE_DATA_FILE: undefined });
      resetMarketplaceStore();
      assert.equal(reloadMarketplaceStore(filePath), true);

      const claimed = claimSupplierInvitation(token, {
        claimantName: "Legacy supplier"
      });
      assert.equal(claimed.status, "claimed");
      assert.equal(getNeed(need.id)?.outreachApprovedAt, sentAt);
    } finally {
      Object.assign(env, { MARKETPLACE_DATA_FILE: undefined });
      resetMarketplaceStore();
      Object.assign(env, { MARKETPLACE_DATA_FILE: originalDataFile });
    }
  });
});

function plcNeed() {
  return {
    title: "Recover a stopped Siemens PLC packaging line",
    description:
      "The line stopped after an intermittent controller communication fault.",
    category: "Industrial automation breakdown",
    industry: "Food manufacturing",
    equipmentOrTechnology: ["Siemens S7 PLC", "Packaging conveyor"],
    location: "Western Sydney, NSW",
    urgencyDays: 1,
    budgetAud: 20000,
    buyerPriority: "speed" as const,
    requiredCapabilities: [
      "Siemens PLC diagnostics",
      "Industrial networking"
    ]
  };
}
