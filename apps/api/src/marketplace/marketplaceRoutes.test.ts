import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import {
  AI_INTAKE_RAW_REQUIREMENT_MAX_LENGTH,
  AI_INTAKE_RAW_REQUIREMENT_MAX_MESSAGE,
  aiIntakeResultSchema,
  deploymentSummarySchema,
  engagementSpeedReceiptSchema,
  engagementSchema,
  needProfileSchema,
  rapidMatchBuyerWorkspaceSchema,
  rapidMatchSocketEvent,
  solutionDecisionSchema,
  solutionResearchResultSchema,
  supplierClaimSchema,
  supplierInvitationSchema,
  supplierLeadSchema,
  supplierMatchSchema,
  supplierOutreachDeliverySchema,
  supplierResponseSchema
} from "@veltact/contracts";
import { io as createSocketClient, type Socket } from "socket.io-client";
import { app } from "../app.js";
import { env } from "../env.js";
import { localDemoPaymentProvider } from "../payments/localDemoPaymentProvider.js";
import {
  resetPaymentProviderForTest,
  setPaymentProviderForTest
} from "../payments/providerRegistry.js";
import { attachRealtime } from "../realtime.js";
import {
  approveSupplierOutreachForNeed,
  claimSupplierInvitation,
  createEngagement,
  createNeed,
  getEngagement,
  getInvitation,
  getNeedReportForNeed,
  getSupplierCommitmentNotification,
  getSolutionDecisionForNeed,
  listLocalDemoPaymentEvidence,
  listMarketplaceAuditEvents,
  listPinchWebhookEvidence,
  recordLocalDemoPayment,
  resetMarketplaceStore,
  submitSupplierResponse
} from "./store.js";

let server: Server;
let baseUrl: string;
let originalPaymentProviderMode: typeof env.PAYMENT_PROVIDER;
const createdPaymentLinkInputs: Array<{
  engagementId: string;
  amount: number;
  metadata?: Record<string, string>;
}> = [];
const cancelledPaymentLinkIds: string[] = [];

beforeEach(async () => {
  resetMarketplaceStore();
  originalPaymentProviderMode = env.PAYMENT_PROVIDER;
  env.PAYMENT_PROVIDER = "pinch";
  createdPaymentLinkInputs.length = 0;
  cancelledPaymentLinkIds.length = 0;
  process.env.PINCH_WEBHOOK_SECRET = "whsec_test_secret";
  setPaymentProviderForTest({
    async createHostedPaymentLink(input) {
      assert.equal(input.amount, 1_850_000);
      assert.equal(input.buyerName, undefined);
      assert.equal(input.metadata?.commitmentType, "commercial_commitment");
      assert.match(input.metadata?.milestoneId ?? "", /-m[1-4]-/);
      assert.match(input.returnUrl, new RegExp(`/api/pinch/return/${input.engagementId}`));
      createdPaymentLinkInputs.push(input);
      const milestoneId = input.metadata?.milestoneId ?? "";
      const suffix = /-m1-/.test(milestoneId)
        ? input.engagementId
        : `${input.engagementId}_${milestoneId}`;
      return {
        provider: "pinch",
        payerId: `pyr_${suffix}`,
        paymentLinkId: `plink_${suffix}`,
        hostedCheckoutUrl: `https://sandbox.getpinch.com.au/pay/${suffix}`
      };
    },
    async getApprovedPaymentForLink(paymentLinkId) {
      return {
        provider: "pinch",
        paymentId: `pmt_${paymentLinkId}`,
        status: "approved"
      };
    },
    async cancelHostedPaymentLink(paymentLinkId) {
      cancelledPaymentLinkIds.push(paymentLinkId);
    }
  });
  server = createServer(app);
  attachRealtime(server);
  server.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  env.PAYMENT_PROVIDER = originalPaymentProviderMode;
  resetPaymentProviderForTest();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
});

describe("marketplace core routes", () => {
  test("structures messy buyer intake into a contract-valid need profile draft", async () => {
    const structured = await postJson("/api/ai-intake/structure", {
      rawRequirement:
        "Packaging line stopped after intermittent Siemens PLC faults in Western Sydney. Need someone today. Speed matters.",
      evidence: [
        {
          kind: "written",
          name: "Operator notes",
          extractedText: "Fault repeats after restart. No budget confirmed yet."
        }
      ]
    }, { "x-veltact-ai-intake-source": "local_demo" });

    assert.equal(structured.status, 200);
    assert.equal(structured.body.source, "local_demo");
    assert.doesNotThrow(() => aiIntakeResultSchema.parse(structured.body.aiIntakeResult));
    assert.equal(structured.body.aiIntakeResult.generatedProfile.buyerPriority, "speed");
    assert.match(structured.body.aiIntakeResult.generatedProfile.location, /Western Sydney/);
    assert.ok(structured.body.aiIntakeResult.generatedProfile.requiredCapabilities.length > 0);
  });

  test("accepts and structures a plastics-extrusion heater fault", async () => {
    const structured = await postJson(
      "/api/ai-intake/structure",
      {
        rawRequirement:
          "Zone 3 heater band on the barrel is dead; the plastic isn't melting right, causing a high-torque alarm on the screw."
      },
      { "x-veltact-ai-intake-source": "local_demo" }
    );

    assert.equal(structured.status, 200);
    assert.equal(
      structured.body.aiIntakeResult.generatedProfile.category,
      "Plastics processing maintenance"
    );
    assert.ok(
      structured.body.aiIntakeResult.generatedProfile.equipmentOrTechnology.includes(
        "Plastics extrusion machine"
      )
    );
    assert.ok(
      structured.body.aiIntakeResult.generatedProfile.requiredCapabilities.includes(
        "Industrial process heating diagnostics"
      )
    );
  });

  test("structures and matches the robotic palletiser demo without diagnosing the fault", async () => {
    const structured = await postJson(
      "/api/ai-intake/structure",
      {
        rawRequirement:
          "Our ABB palletising robot stopped mid-cycle on Line 3 in Western Sydney. The Siemens S7 PLC shows an intermittent safety-circuit fault. We need a specialist tonight before the 6:00 am dispatch and can approve up to $18,000."
      },
      { "x-veltact-ai-intake-source": "local_demo" }
    );

    assert.equal(structured.status, 200);
    assert.match(structured.body.aiIntakeResult.generatedProfile.title, /robotic palletiser/i);
    assert.ok(
      structured.body.aiIntakeResult.generatedProfile.requiredCapabilities.includes(
        "ABB robot diagnostics"
      )
    );

    const created = await postJson("/api/needs", {
      buyerEmail: "elena.morris@harbourpack.example",
      profile: roboticsNeed()
    });

    assert.equal(created.status, 201);
    assert.deepEqual(
      new Set(
        created.body.need.matches.map(
          (match: { supplierId: string }) => match.supplierId
        )
      ),
      new Set([
        "supplier-automation-nsw",
        "supplier-robot-safety-nsw",
        "supplier-robotics-western-sydney"
      ])
    );
    assert.ok(
      created.body.need.matches.every((match: { explanation: string[] }) =>
        match.explanation.some((reason) => /Technical fit:|Equipment fit:/.test(reason))
      )
    );
  });

  test("preserves six-figure comma-formatted budgets during AI intake", async () => {
    const response = await postJson(
      "/api/ai-intake/structure",
      {
        rawRequirement:
          "Plan a robotic palletising cell in Western Sydney within 60 days. Approved budget is AUD 120,000."
      },
      { "x-veltact-ai-intake-source": "local_demo" }
    );

    assert.equal(response.status, 200);
    assert.equal(
      response.body.aiIntakeResult.generatedProfile.budgetRange,
      "Up to AUD 120,000"
    );
  });

  test("rejects low-signal AI intake before a paid model call", async () => {
    const rejected = await postJson("/api/ai-intake/structure", {
      rawRequirement: "asdf lol $$$$"
    });

    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.error, "low_signal_ai_intake_request");
  });

  test("rejects oversized AI intake with friendly JSON before provider selection", async () => {
    const rejected = await postJson("/api/ai-intake/structure", {
      rawRequirement: "x".repeat(
        AI_INTAKE_RAW_REQUIREMENT_MAX_LENGTH + 1
      )
    });

    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.error, "invalid_ai_intake_request");
    assert.equal(rejected.body.message, AI_INTAKE_RAW_REQUIREMENT_MAX_MESSAGE);
    assert.equal(rejected.body.source, undefined);
    assert.equal(rejected.body.aiIntakeResult, undefined);
  });

  test("does not fabricate local intake facts from a binary evidence filename", async () => {
    const structured = await postJson("/api/ai-intake/structure", {
      rawRequirement: "",
      evidence: [
        {
          kind: "photo",
          name: "siemens-plc-fault-packaging-line.jpg",
          mimeType: "image/jpeg",
          dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w=="
        }
      ]
    }, { "x-veltact-ai-intake-source": "local_demo" });

    assert.equal(structured.status, 422);
    assert.equal(structured.body.error, "binary_evidence_requires_live_ai");
    assert.match(structured.body.message, /cannot read binary-only/i);
    assert.doesNotMatch(structured.body.message, /siemens-plc-fault/i);
  });

  test("rejects context-free photo evidence before a paid model call", async () => {
    const rejected = await postJson("/api/ai-intake/structure", {
      rawRequirement: "",
      evidence: [
        {
          kind: "photo",
          name: "IMG_1234.jpg",
          mimeType: "image/jpeg",
          dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w=="
        }
      ]
    });

    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.error, "low_signal_ai_intake_request");
  });

  test("creates and retrieves a need with deterministic explainable matches and invitation tokens", async () => {
    const created = await postJson("/api/needs", {
      buyerEmail: "buyer@example.com",
      profile: automationNeed()
    });

    assert.equal(created.status, 201);
    assert.equal(created.body.need.profile.title, "Urgent PLC automation fault");
    assert.doesNotThrow(() => needProfileSchema.parse(created.body.need.needProfile));
    assert.equal(created.body.need.matches.length, 3);
    assert.deepEqual(
      created.body.need.matches.map((match: { supplierId: string }) => match.supplierId),
      ["supplier-automation-nsw", "supplier-controls-western-sydney", "supplier-electrical-sydney"]
    );
    assert.match(
      created.body.need.matches[0].explanation.join(" "),
      /Technical fit:|Equipment fit:|Location fit:|Availability fit:|Buyer priority fit:/i
    );
    assert.doesNotThrow(() => supplierMatchSchema.parse(created.body.need.supplierMatches[0]));
    assert.equal(created.body.need.invitations.length, 3);
    assert.equal(created.body.need.invitations[0].status, "invited");
    assert.equal(created.body.need.supplierInvitations[0].status, "pending");
    assert.equal(created.body.need.supplierInvitations[0].sentAt, undefined);
    assert.doesNotThrow(() => supplierInvitationSchema.parse(created.body.need.supplierInvitations[0]));
    assert.ok(created.body.need.invitations[0].token);
    assert.ok(
      listMarketplaceAuditEvents().some(
        (event) =>
          event.eventType === "need.created" &&
          event.entityId === created.body.need.id
      )
    );

    const sent = await postJson(`/api/need-profiles/${created.body.need.id}/invitations/send`, {});
    assert.equal(sent.status, 200);
    assert.equal(sent.body.supplierInvitations.length, 3);
    assert.equal(sent.body.supplierInvitations[0].status, "pending");
    assert.equal(sent.body.supplierInvitations[0].sentAt, undefined);
    assert.doesNotThrow(() => supplierInvitationSchema.parse(sent.body.supplierInvitations[0]));

    const retrieved = await getJson(`/api/needs/${created.body.need.id}`);

    assert.equal(retrieved.status, 200);
    assert.ok(
      retrieved.body.need.matches.every(
        (match: { status: string }) => match.status === "invited"
      )
    );
    assert.ok(
      retrieved.body.need.supplierInvitations.every(
        (invitation: { status: string }) => invitation.status === "pending"
      )
    );
  });

  test("uses structured AI intake fields for strong Siemens PLC packaging-line matches", async () => {
    const created = await postJson("/api/need-profiles", {
      buyerEmail: "ops.manager@westernfoods.example",
      profile: structuredSiemensNeed()
    });

    assert.equal(created.status, 201);
    const need = created.body.need;
    assert.equal(need.needProfile.description, structuredSiemensNeed().problemSummary);
    assert.deepEqual(need.needProfile.mustHaves, [
      "Siemens PLC diagnostics",
      "Conveyor fault recovery",
      "Onsite breakdown support",
      "Siemens S7 PLC",
      "Packaging conveyor"
    ]);
    assert.deepEqual(
      need.matches.map((match: { supplierId: string }) => match.supplierId),
      ["supplier-automation-nsw", "supplier-controls-western-sydney", "supplier-electrical-sydney"]
    );

    for (const match of need.matches as Array<{ score: number; explanation: string[] }>) {
      assert.ok(match.score >= 80);
      const reasons = match.explanation.join(" ");
      assert.match(reasons, /Technical fit:/);
      assert.match(reasons, /Equipment fit:/);
      assert.match(reasons, /Industry fit:/);
      assert.match(reasons, /Location fit:/);
      assert.match(reasons, /Availability fit:/);
      assert.match(reasons, /Buyer priority fit:/);
      assert.match(reasons, /Trust fit:/);
    }
  });

  test("downloads and reuses a selected-path report before later outsource discovery", async () => {
    const originalAuth = env.BUYER_CAPABILITY_AUTH_REQUIRED;
    const originalProvider = env.VELTACT_RESEARCH_PROVIDER;
    Object.assign(env, {
      BUYER_CAPABILITY_AUTH_REQUIRED: true,
      VELTACT_RESEARCH_PROVIDER: "fixture"
    });

    try {
      const created = await postJson("/api/need-profiles", {
        buyerEmail: "buyer@example.com",
        profile: structuredSiemensNeed()
      });
      const needId = created.body.need.id;
      const buyerHeaders = {
        "x-veltact-buyer-token": created.body.buyerAccessToken
      };
      const researched = await postJson(
        `/api/need-profiles/${needId}/research`,
        {},
        buyerHeaders
      );
      assert.equal(researched.status, 200);
      const selectedApproachId =
        researched.body.researchResult.approaches[1].id;
      const reportPath =
        `/api/need-profiles/${needId}/report.pdf?selectedApproachId=` +
        encodeURIComponent(selectedApproachId);

      assert.equal(getSolutionDecisionForNeed(needId), undefined);
      const discoveryBeforeDecision = await postJson(
        `/api/need-profiles/${needId}/suppliers/discover`,
        {},
        buyerHeaders
      );
      assert.equal(discoveryBeforeDecision.status, 409);
      assert.match(
        discoveryBeforeDecision.body.message,
        /solution decision/i
      );

      const firstDownload = await getBinary(reportPath, buyerHeaders);
      assert.equal(firstDownload.status, 200);
      assert.equal(
        firstDownload.headers.get("content-type"),
        "application/pdf"
      );
      assert.match(
        firstDownload.body.toString("latin1"),
        /Execution decision: Not recorded/
      );
      assert.equal(getSolutionDecisionForNeed(needId), undefined);
      const persistedReport = getNeedReportForNeed(needId);
      assert.equal(
        persistedReport?.selectedApproachId,
        selectedApproachId
      );
      assert.deepEqual(persistedReport?.selectionProvenance, {
        source: "report_request",
        selectedBy: "buyer@example.com",
        selectedAt: persistedReport?.generatedAt
      });
      assert.equal(persistedReport?.solutionDecisionId, undefined);

      const repeatDownload = await getBinary(reportPath, buyerHeaders);
      assert.equal(repeatDownload.status, 200);
      assert.equal(
        repeatDownload.headers.get("x-veltact-report-id"),
        firstDownload.headers.get("x-veltact-report-id")
      );
      assert.deepEqual(repeatDownload.body, firstDownload.body);
      assert.deepEqual(getNeedReportForNeed(needId), persistedReport);

      const decision = await postJson(
        `/api/need-profiles/${needId}/solution-decision`,
        {
          decision: "outsource",
          selectedApproachIds: [selectedApproachId]
        },
        buyerHeaders
      );
      assert.equal(decision.status, 200);
      assert.equal(
        getNeedReportForNeed(needId)?.selectionProvenance.source,
        "report_request"
      );

      const discovered = await postJson(
        `/api/need-profiles/${needId}/suppliers/discover`,
        {},
        buyerHeaders
      );
      assert.equal(discovered.status, 200);
      assert.equal(discovered.body.supplierLeads.length, 3);
    } finally {
      Object.assign(env, {
        BUYER_CAPABILITY_AUTH_REQUIRED: originalAuth,
        VELTACT_RESEARCH_PROVIDER: originalProvider
      });
    }
  });

  test("rejects report selections outside the current persisted research", async () => {
    const originalAuth = env.BUYER_CAPABILITY_AUTH_REQUIRED;
    const originalProvider = env.VELTACT_RESEARCH_PROVIDER;
    Object.assign(env, {
      BUYER_CAPABILITY_AUTH_REQUIRED: true,
      VELTACT_RESEARCH_PROVIDER: "fixture"
    });

    try {
      const created = await postJson("/api/need-profiles", {
        buyerEmail: "buyer@example.com",
        profile: structuredSiemensNeed()
      });
      const needId = created.body.need.id;
      const buyerHeaders = {
        "x-veltact-buyer-token": created.body.buyerAccessToken
      };
      const researched = await postJson(
        `/api/need-profiles/${needId}/research`,
        {},
        buyerHeaders
      );
      assert.equal(researched.status, 200);

      const invalid = await getJson(
        `/api/need-profiles/${needId}/report.pdf?selectedApproachId=not-from-current-research`,
        buyerHeaders
      );
      assert.equal(invalid.status, 400);
      assert.match(invalid.body.message, /current research result/i);
      assert.equal(getNeedReportForNeed(needId), undefined);
      assert.equal(getSolutionDecisionForNeed(needId), undefined);
    } finally {
      Object.assign(env, {
        BUYER_CAPABILITY_AUTH_REQUIRED: originalAuth,
        VELTACT_RESEARCH_PROVIDER: originalProvider
      });
    }
  });

  test("enforces the canonical Find lifecycle with scoped authorization and provenance", async () => {
    const originalAuth = env.BUYER_CAPABILITY_AUTH_REQUIRED;
    const originalProvider = env.VELTACT_RESEARCH_PROVIDER;
    Object.assign(env, {
      BUYER_CAPABILITY_AUTH_REQUIRED: true,
      VELTACT_RESEARCH_PROVIDER: "fixture"
    });

    try {
      const created = await postJson("/api/need-profiles", {
        buyerEmail: "buyer@example.com",
        profile: structuredSiemensNeed()
      });
      const needId = created.body.need.id;
      const buyerAccessToken = created.body.buyerAccessToken;
      const legacyInvitationIds =
        created.body.need.supplierInvitations.map(
          (invitation: { id: string }) => invitation.id
        );
      const buyerHeaders = {
        "x-veltact-buyer-token": buyerAccessToken
      };

      const unauthorisedResearch = await postJson(
        `/api/need-profiles/${needId}/research`,
        {}
      );
      assert.equal(unauthorisedResearch.status, 401);

      const researched = await postJson(
        `/api/need-profiles/${needId}/research`,
        {},
        buyerHeaders
      );
      assert.equal(researched.status, 200);
      assert.doesNotThrow(() =>
        solutionResearchResultSchema.parse(researched.body.researchResult)
      );
      assert.equal(researched.body.researchResult.sourceMode, "fixture");
      assert.match(researched.body.researchResult.safetyNotice, /not a machinery diagnosis/i);
      assert.ok(researched.body.researchResult.missingInformation.length >= 3);
      assert.ok(
        researched.body.researchResult.citations.every(
          (citation: { provider: string }) => citation.provider === "fixture"
        )
      );

      const unauthorisedReport = await getJson(
        `/api/need-profiles/${needId}/report.pdf`
      );
      assert.equal(unauthorisedReport.status, 401);

      const reportBeforeDecision = await getJson(
        `/api/need-profiles/${needId}/report.pdf`,
        buyerHeaders
      );
      assert.equal(reportBeforeDecision.status, 400);
      assert.match(
        reportBeforeDecision.body.message,
        /selectedApproachId is required/
      );

      const discoveryBeforeDecision = await postJson(
        `/api/need-profiles/${needId}/suppliers/discover`,
        {},
        buyerHeaders
      );
      assert.equal(discoveryBeforeDecision.status, 409);

      const invalidDecision = await postJson(
        `/api/need-profiles/${needId}/solution-decision`,
        {
          decision: "automatic",
          selectedApproachIds: [
            researched.body.researchResult.approaches[0].id
          ]
        },
        buyerHeaders
      );
      assert.equal(invalidDecision.status, 400);

      const unknownApproach = await postJson(
        `/api/need-profiles/${needId}/solution-decision`,
        {
          decision: "outsource",
          selectedApproachIds: ["not-from-current-research"]
        },
        buyerHeaders
      );
      assert.equal(unknownApproach.status, 400);

      const localDecision = await postJson(
        `/api/need-profiles/${needId}/solution-decision`,
        {
          decision: "local_trial",
          selectedApproachIds: [
            researched.body.researchResult.approaches[0].id
          ]
        },
        buyerHeaders
      );
      assert.equal(localDecision.status, 200);
      assert.doesNotThrow(() =>
        solutionDecisionSchema.parse(localDecision.body.solutionDecision)
      );

      const localDiscovery = await postJson(
        `/api/need-profiles/${needId}/suppliers/discover`,
        {},
        buyerHeaders
      );
      assert.equal(localDiscovery.status, 409);

      const multipleApproaches = await postJson(
        `/api/need-profiles/${needId}/solution-decision`,
        {
          decision: "outsource",
          selectedApproachIds:
            researched.body.researchResult.approaches.map(
              (approach: { id: string }) => approach.id
            )
        },
        buyerHeaders
      );
      assert.equal(multipleApproaches.status, 400);
      assert.match(multipleApproaches.body.message, /invalid solution decision/i);

      const outsourceDecision = await postJson(
        `/api/need-profiles/${needId}/solution-decision`,
        {
          decision: "outsource",
          selectedApproachIds: [
            researched.body.researchResult.approaches[1].id
          ],
          buyerNote: "Find a specialist for the controlled recovery."
        },
        buyerHeaders
      );
      assert.equal(outsourceDecision.status, 200);
      assert.deepEqual(
        outsourceDecision.body.solutionDecision.selectedApproachIds,
        [researched.body.researchResult.approaches[1].id]
      );

      const report = await getBinary(
        `/api/need-profiles/${needId}/report.pdf`,
        buyerHeaders
      );
      assert.equal(report.status, 200);
      assert.equal(report.headers.get("content-type"), "application/pdf");
      assert.match(
        report.headers.get("content-disposition") ?? "",
        /veltact-need-report-.*\.pdf/
      );
      assert.equal(report.body.subarray(0, 8).toString(), "%PDF-1.4");
      const reportText = report.body.toString("latin1");
      assert.match(reportText, /VELTACT NEED AND SOLUTION REPORT/);
      assert.match(
        reportText,
        /SELECTED - Controlled recovery from a verified baseline/
      );
      assert.match(reportText, /Evidence mode: FIXTURE/);
      assert.match(reportText, /SAFETY NOTICE/);

      const wrongTokenDiscovery = await postJson(
        `/api/need-profiles/${needId}/suppliers/discover`,
        {},
        { "x-veltact-buyer-token": "wrong-token" }
      );
      assert.equal(wrongTokenDiscovery.status, 401);

      const discovered = await postJson(
        `/api/need-profiles/${needId}/suppliers/discover`,
        {},
        buyerHeaders
      );
      assert.equal(discovered.status, 200);
      assert.doesNotThrow(() =>
        supplierLeadSchema.array().parse(discovered.body.supplierLeads)
      );
      assert.equal(discovered.body.supplierLeads.length, 3);
      assert.equal(
        discovered.body.supplierLeads[0].companyName,
        "EastGrid Automation (Demo)"
      );
      assert.ok(
        discovered.body.supplierLeads.every(
          (lead: { matchReasons: string[]; risks: string[] }) => {
            const reasons = lead.matchReasons.join(" ");
            const risks = lead.risks.join(" ");
            return (
              /Selected solution (fit|check):/.test(reasons) &&
              /Location fit:/.test(reasons) &&
              /Buyer priority (fit|check):/.test(reasons) &&
              /Availability check:/.test(risks) &&
              /Budget check:/.test(risks)
            );
          }
        )
      );
      assert.ok(
        discovered.body.supplierLeads.every(
          (lead: {
            lifecycleStatus: string;
            sourceMode: string;
            evidence: Array<{ provider: string; evidenceNote: string }>;
          }) =>
            lead.lifecycleStatus === "discovered" &&
            lead.sourceMode === "fixture" &&
            lead.evidence.every(
              (evidence) =>
                evidence.provider === "fixture" &&
                /not a real or verified supplier/i.test(
                  evidence.evidenceNote
                )
            )
        )
      );
      assert.deepEqual(discovered.body.workspace.invitations, []);
      assert.deepEqual(discovered.body.workspace.outreachDeliveries, []);

      const workspace = await getJson(
        `/api/need-profiles/${needId}`,
        buyerHeaders
      );
      assert.equal(workspace.status, 200);
      assert.equal(workspace.body.need.id, needId);
      assert.equal(workspace.body.needProfile.id, needId);
      assert.doesNotThrow(() =>
        rapidMatchBuyerWorkspaceSchema.parse(workspace.body.workspace)
      );
      assert.equal(workspace.body.phase, "connect");
      assert.equal(workspace.body.nextAction, "approve_outreach");
      assert.deepEqual(
        workspace.body.need.supplierInvitations.map(
          (invitation: { id: string }) => invitation.id
        ),
        legacyInvitationIds
      );
      assert.deepEqual(workspace.body.workspace.invitations, []);
      assert.deepEqual(
        workspace.body.discoveredSuppliers,
        workspace.body.workspace.discoveredSuppliers
      );

      const changedDecision = await postJson(
        `/api/need-profiles/${needId}/solution-decision`,
        {
          decision: "hybrid",
          selectedApproachIds: [
            researched.body.researchResult.approaches[0].id
          ]
        },
        buyerHeaders
      );
      assert.equal(changedDecision.status, 409);

      const selectedLeadIds = discovered.body.supplierLeads
        .slice(0, 2)
        .map((lead: { id: string }) => lead.id);
      const sent = await postJson(
        `/api/need-profiles/${needId}/invitations/send`,
        { supplierLeadIds: selectedLeadIds },
        buyerHeaders
      );
      assert.equal(sent.status, 200);
      assert.equal(sent.body.supplierInvitations.length, 2);
      assert.deepEqual(
        new Set(
          sent.body.supplierInvitations.map(
            (invitation: { supplierId: string }) => invitation.supplierId
          )
        ),
        new Set(selectedLeadIds)
      );
      assert.ok(
        sent.body.supplierInvitations.every(
          (invitation: { status: string }) => invitation.status === "pending"
        )
      );
      assert.deepEqual(
        sent.body.workspace.discoveredSuppliers.map(
          (lead: { lifecycleStatus: string }) => lead.lifecycleStatus
        ),
        ["invited", "invited", "discovered"]
      );

      const supplierToken = sent.body.supplierInvitations[0].token;
      const claimed = await postJson(
        `/api/supplier-invitations/${supplierToken}/claim`,
        {
          claimantName: "RapidMatch demo specialist",
          claimantEmail: "specialist@example.com"
        }
      );
      assert.equal(claimed.status, 200);
      assert.equal(
        claimed.body.supplierClaim.supplierLeadId,
        selectedLeadIds[0]
      );

      const submitted = await postJson(
        `/api/supplier-invitations/${supplierToken}/responses`,
        {
          decision: "can_help",
          earliestAvailability: "Same day",
          indicativePriceAud: 16500,
          relevantExperience:
            "Siemens packaging-line controls recovery and validation.",
          proposedApproach:
            "Preserve evidence, confirm the verified baseline, then execute and validate a controlled recovery.",
          assumptions: ["The buyer provides the current approved backup."],
          conditions: ["Site induction and safe access are required."]
        }
      );
      assert.equal(submitted.status, 201);
      assert.equal(
        submitted.body.supplierResponse.supplierId,
        selectedLeadIds[0]
      );

      const selected = await postJson(
        `/api/need-profiles/${needId}/engagements`,
        { supplierResponseId: submitted.body.supplierResponse.id },
        buyerHeaders
      );
      assert.equal(selected.status, 201);
      assert.equal(selected.body.engagement.supplierId, selectedLeadIds[0]);
    } finally {
      Object.assign(env, {
        BUYER_CAPABILITY_AUTH_REQUIRED: originalAuth,
        VELTACT_RESEARCH_PROVIDER: originalProvider
      });
    }
  });

  test("preserves provider fallback warnings in the buyer workspace", async () => {
    const originalProvider = env.VELTACT_RESEARCH_PROVIDER;
    const originalOpenAiKey = env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    Object.assign(env, {
      VELTACT_RESEARCH_PROVIDER: "auto",
      OPENAI_API_KEY: "test-openai-key"
    });
    globalThis.fetch = async (input, init) => {
      if (String(input).startsWith(baseUrl)) {
        return originalFetch(input, init);
      }
      throw new Error("research provider unavailable");
    };

    try {
      const created = await postJson("/api/need-profiles", {
        buyerEmail: "buyer@example.com",
        profile: structuredSiemensNeed()
      });
      const researched = await postJson(
        `/api/need-profiles/${created.body.need.id}/research`,
        {}
      );
      assert.equal(researched.status, 200);
      assert.equal(researched.body.researchResult.sourceMode, "fixture");
      assert.match(
        researched.body.providerWarning,
        /Live research was unavailable/
      );

      const workspace = await getJson(
        `/api/need-profiles/${created.body.need.id}`
      );
      assert.ok(
        workspace.body.providerWarnings.some((warning: string) =>
          /research provider unavailable/.test(warning)
        )
      );
    } finally {
      Object.assign(env, {
        VELTACT_RESEARCH_PROVIDER: originalProvider,
        OPENAI_API_KEY: originalOpenAiKey
      });
      globalThis.fetch = originalFetch;
    }
  });

  test("returns deterministic canonical demo workspaces for PLC and robotics", async () => {
    const workspaces: Record<string, Record<string, any>> = {};

    for (const scenario of ["plc", "robotics"] as const) {
      const reset = await postJson("/api/demo/reset", { scenario });
      assert.equal(reset.status, 200);
      assert.equal(reset.body.reset, true);
      assert.equal(reset.body.scenario, scenario);
      assert.equal(reset.body.sourceMode, "fixture");
      assert.doesNotThrow(() =>
        rapidMatchBuyerWorkspaceSchema.parse(reset.body.workspace)
      );
      assert.equal(reset.body.workspace.researchResult.sourceMode, "fixture");
      assert.ok(reset.body.workspace.researchResult.citations.length >= 3);
      assert.ok(
        reset.body.workspace.researchResult.activityEvents.length >= 4
      );
      assert.ok(reset.body.workspace.agentActivityEvents.length >= 8);
      assert.deepEqual(
        reset.body.workspace.agentActivityEvents.map(
          (event: { sequence: number }) => event.sequence
        ),
        reset.body.workspace.agentActivityEvents.map(
          (_: unknown, index: number) => index
        )
      );
      assert.equal(
        reset.body.workspace.solutionDecision.selectedApproachIds.length,
        1
      );
      assert.equal(reset.body.workspace.discoveredSuppliers.length, 3);
      if (scenario === "robotics") {
        assert.ok(
          reset.body.workspace.discoveredSuppliers.every(
            (lead: { logoUrl?: string }) =>
              lead.logoUrl?.startsWith(
                new URL("/logos/", env.PUBLIC_BASE_URL).toString()
              )
          )
        );
      } else {
        assert.ok(
          reset.body.workspace.discoveredSuppliers.every(
            (lead: { companyName: string; logoUrl?: string }) =>
              lead.logoUrl === undefined && lead.companyName.length > 0
          )
        );
      }
      assert.equal(reset.body.supplierPaths.length, 2);
      assert.deepEqual(
        new Set(
          reset.body.supplierPaths.map(
            (path: { tradeOff: string }) => path.tradeOff
          )
        ),
        new Set(["fastest_response", "lower_price"])
      );
      assert.ok(
        reset.body.supplierPaths.every(
          (path: {
            sourceMode: string;
            deliveryStatus: string;
            responseUrl: string;
            fixtureLabel: string;
            evidenceLabel: string;
            supplierResponseId: string;
          }) =>
            path.sourceMode === "fixture" &&
            path.deliveryStatus === "not_sent" &&
            path.evidenceLabel === "Fixture" &&
            /\(Fixture\)$/.test(path.fixtureLabel) &&
            typeof path.supplierResponseId === "string" &&
            /supplier\.html\?token=/.test(path.responseUrl)
        )
      );
      assert.deepEqual(
        reset.body.workspace.invitations.map(
          (invitation: { status: string }) => invitation.status
        ),
        ["responded", "responded", "pending"]
      );
      assert.equal(reset.body.workspace.responses.length, 2);
      assert.equal(reset.body.workspace.status, "supplier_selection");
      assert.equal(reset.body.workspace.nextAction, "compare_responses");
      assert.deepEqual(
        reset.body.workspace.discoveredSuppliers.map(
          (supplierLead: { lifecycleStatus: string }) =>
            supplierLead.lifecycleStatus
        ),
        ["claimed", "claimed", "approved_for_outreach"]
      );
      assert.ok(
        reset.body.workspace.responses.every(
          (supplierResponse: {
            proposedApproach?: string;
            assumptions?: string[];
            conditions: string[];
          }) =>
            Boolean(supplierResponse.proposedApproach) &&
            (supplierResponse.assumptions?.length ?? 0) >= 2 &&
            supplierResponse.conditions.length >= 2
        )
      );

      for (const path of reset.body.supplierPaths) {
        const supplierOpportunity = await getJson(
          `/api/supplier-invitations/${path.token}`
        );
        assert.equal(supplierOpportunity.status, 200);
        assert.equal(
          supplierOpportunity.body.supplierClaim.status,
          "claimed"
        );
        assert.equal(
          supplierOpportunity.body.supplierResponse.id,
          path.supplierResponseId
        );
      }
      const responseIds = new Set(
        reset.body.workspace.responses.map(
          (supplierResponse: { id: string }) => supplierResponse.id
        )
      );
      const invitationIds = new Set(
        reset.body.supplierPaths.map(
          (path: { invitationId: string }) => path.invitationId
        )
      );
      const auditEvents = listMarketplaceAuditEvents();
      assert.equal(
        auditEvents.filter(
          (event) =>
            event.eventType === "response.submitted" &&
            responseIds.has(event.entityId)
        ).length,
        2
      );
      assert.equal(
        auditEvents.filter(
          (event) =>
            event.eventType === "supplier_claim.claimed" &&
            invitationIds.has(event.entityId)
        ).length,
        2
      );

      const retrieved = await getJson(
        `/api/need-profiles/${reset.body.needProfileId}`,
        { "x-veltact-buyer-token": reset.body.buyerAccessToken }
      );
      assert.equal(retrieved.status, 200);
      assert.doesNotThrow(() =>
        rapidMatchBuyerWorkspaceSchema.parse(retrieved.body.workspace)
      );
      const report = await getBinary(
        `/api/need-profiles/${reset.body.needProfileId}/report.pdf`,
        { "x-veltact-buyer-token": reset.body.buyerAccessToken }
      );
      assert.equal(report.status, 200);
      assert.equal(
        report.headers.get("x-veltact-report-source"),
        "fixture"
      );
      workspaces[scenario] = reset.body.workspace;
    }

    assert.notEqual(
      workspaces.plc.researchResult.overview,
      workspaces.robotics.researchResult.overview
    );
    assert.notEqual(
      workspaces.plc.discoveredSuppliers[0].companyName,
      workspaces.robotics.discoveredSuppliers[0].companyName
    );
    assert.match(
      workspaces.plc.researchResult.approaches[0].title,
      /evidence|triage/i
    );
    assert.match(
      workspaces.robotics.researchResult.approaches[0].title,
      /feasibility|safety/i
    );
  });

  test("resets marketplace demo state deterministically", async () => {
    const created = await postJson("/api/needs", {
      buyerEmail: "buyer@example.com",
      profile: automationNeed()
    });
    const token = created.body.need.invitations[0].token;
    await approveOutreachAndClaim(created.body.need.id, token);
    const submitted = await postJson(`/api/supplier-invitations/${token}/responses`, {
      canHelp: true,
      earliestAvailability: "Same day",
      indicativePriceAud: 18500,
      relevantExperience: "Siemens PLC packaging line recovery.",
      conditions: "Site induction required."
    });
    const selected = await postJson(`/api/need-profiles/${created.body.need.id}/engagements`, {
      supplierResponseId: submitted.body.response.id
    });

    const reset = await postJson("/api/demo/reset", {});
    const needAfterReset = await getJson(`/api/needs/${created.body.need.id}`);
    const invitationAfterReset = await getJson(`/api/supplier-invitations/${token}`);
    const responsesAfterReset = await getJson(`/api/needs/${created.body.need.id}/responses`);
    const engagementAfterReset = await getJson(`/api/engagements/${selected.body.engagement.id}`);

    assert.equal(reset.status, 200);
    assert.equal(reset.body.reset, true);
    assert.equal(needAfterReset.status, 404);
    assert.equal(invitationAfterReset.status, 404);
    assert.equal(responsesAfterReset.status, 404);
    assert.equal(engagementAfterReset.status, 404);
  });

  test("enforces scoped buyer capability access when production protection is enabled", async () => {
    const originalProtection = env.BUYER_CAPABILITY_AUTH_REQUIRED;
    Object.assign(env, { BUYER_CAPABILITY_AUTH_REQUIRED: true });

    try {
      const created = await postJson("/api/needs", {
        buyerEmail: "buyer@example.com",
        profile: automationNeed()
      });
      const needId = created.body.need.id;
      const buyerAccessToken = created.body.buyerAccessToken;
      assert.equal(typeof buyerAccessToken, "string");
      assert.ok(buyerAccessToken.length >= 32);

      const rejected = await getJson(`/api/needs/${needId}`);
      assert.equal(rejected.status, 401);

      const authorised = await getJson(`/api/needs/${needId}`, {
        "x-veltact-buyer-token": buyerAccessToken
      });
      assert.equal(authorised.status, 200);

      const supplierToken = created.body.need.invitations[0].token;
      const supplierView = await getJson(
        `/api/supplier-invitations/${supplierToken}`
      );
      assert.equal(supplierView.status, 200);
      assert.equal(supplierView.body.need.invitations, undefined);
      assert.equal(supplierView.body.need.supplierInvitations, undefined);
    } finally {
      Object.assign(env, {
        BUYER_CAPABILITY_AUTH_REQUIRED: originalProtection
      });
    }
  });

  test("separates buyer authorization from supplier claim and response capabilities", async () => {
    const originalProtection = env.BUYER_CAPABILITY_AUTH_REQUIRED;
    Object.assign(env, { BUYER_CAPABILITY_AUTH_REQUIRED: true });

    try {
      const created = await postJson("/api/need-profiles", {
        buyerEmail: "buyer@example.com",
        profile: structuredSiemensNeed()
      });
      const needId = created.body.need.id;
      const buyerAccessToken = created.body.buyerAccessToken;
      const supplierToken = created.body.need.invitations[0].token;
      const buyerHeaders = {
        "x-veltact-buyer-token": buyerAccessToken
      };

      const prematureClaim = await postJson(
        `/api/supplier-invitations/${supplierToken}/claim`,
        { claimantName: "Supplier contact" }
      );
      assert.equal(prematureClaim.status, 409);

      const prematureResponse = await postJson(
        `/api/supplier-invitations/${supplierToken}/responses`,
        {
          decision: "can_help",
          earliestAvailability: "Same day",
          indicativePriceAud: 18500,
          relevantExperience: "Siemens packaging-line recovery.",
          conditions: []
        }
      );
      assert.equal(prematureResponse.status, 409);

      const unauthorisedSend = await postJson(
        `/api/need-profiles/${needId}/invitations/send`,
        {}
      );
      assert.equal(unauthorisedSend.status, 401);

      const sent = await postJson(
        `/api/need-profiles/${needId}/invitations/send`,
        {},
        buyerHeaders
      );
      assert.equal(sent.status, 200);
      assert.equal(sent.body.supplierInvitations[0].status, "pending");

      const buyerTokenAsSupplierToken = await postJson(
        `/api/supplier-invitations/${buyerAccessToken}/claim`,
        {}
      );
      assert.equal(buyerTokenAsSupplierToken.status, 404);

      const supplierTokenAsBuyerToken = await getJson(
        `/api/need-profiles/${needId}`,
        { "x-veltact-buyer-token": supplierToken }
      );
      assert.equal(supplierTokenAsBuyerToken.status, 401);

      const claimed = await postJson(
        `/api/supplier-invitations/${supplierToken}/claim`,
        {
          companyName: "Taylor Controls",
          contactName: "Taylor Controls",
          contactEmail: "taylor@supplier.example",
          confirmsCompanyAuthority: true,
          sourceDisclosureAccepted: true
        }
      );
      assert.equal(claimed.status, 200);
      assert.doesNotThrow(() =>
        supplierClaimSchema.parse(claimed.body.supplierClaim)
      );
      assert.equal(claimed.body.supplierClaim.status, "claimed");
      assert.equal(
        claimed.body.supplierClaim.claimantName,
        "Taylor Controls"
      );
      assert.equal(
        claimed.body.supplierClaim.claimantEmail,
        "taylor@supplier.example"
      );

      const claimedInvitation = await getJson(
        `/api/supplier-invitations/${supplierToken}`
      );
      assert.equal(
        claimedInvitation.body.supplierClaim.claimantEmail,
        "taylor@supplier.example"
      );
      assert.ok(claimedInvitation.body.supplierMatch.reasons.length > 0);

      const repeatedClaim = await postJson(
        `/api/supplier-invitations/${supplierToken}/claim`,
        {}
      );
      assert.equal(repeatedClaim.status, 200);
      assert.equal(
        repeatedClaim.body.supplierClaim.id,
        claimed.body.supplierClaim.id
      );

      const submitted = await postJson(
        `/api/supplier-invitations/${supplierToken}/responses`,
        {
          decision: "can_help",
          earliestAvailability: "Same day",
          indicativePriceAud: 18500,
          relevantExperience:
            "Recovered Siemens S7 packaging lines in food manufacturing.",
          proposedApproach:
            "Review preserved evidence, confirm the baseline, recover under site authorization and validate production.",
          assumptions: [
            "The buyer provides current drawings and an authorised site representative."
          ],
          conditions: [
            "Final scope depends on safe onsite diagnostics.",
            "Replacement hardware is excluded from the indicative price."
          ]
        }
      );
      assert.equal(submitted.status, 201);
      assert.doesNotThrow(() =>
        supplierResponseSchema.parse(submitted.body.supplierResponse)
      );
      assert.match(
        submitted.body.supplierResponse.proposedApproach,
        /validate production/
      );
      assert.equal(submitted.body.supplierResponse.assumptions.length, 1);
      assert.equal(submitted.body.supplierResponse.conditions.length, 2);

      const supplierView = await getJson(
        `/api/supplier-invitations/${supplierToken}`
      );
      assert.equal(supplierView.status, 200);
      assert.equal(supplierView.body.need.buyerEmail, undefined);
      assert.equal(supplierView.body.need.invitations, undefined);

      const buyerResponses = await getJson(
        `/api/need-profiles/${needId}/responses`,
        buyerHeaders
      );
      assert.equal(buyerResponses.status, 200);
      assert.equal(
        buyerResponses.body.supplierResponses[0].proposedApproach,
        submitted.body.supplierResponse.proposedApproach
      );
    } finally {
      Object.assign(env, {
        BUYER_CAPABILITY_AUTH_REQUIRED: originalProtection
      });
    }
  });

  test("expires supplier invitation tokens and their unmatched supplier state", () => {
    const created = createNeed(
      {
        buyerEmail: "buyer@example.com",
        profile: automationNeed()
      },
      new Date("2026-07-20T00:00:00.000Z")
    );
    const invitation = created.invitations[0];
    approveSupplierOutreachForNeed(
      created.id,
      new Date("2026-07-20T00:00:00.000Z")
    );

    const claim = claimSupplierInvitation(
      invitation.token,
      {},
      new Date("2026-07-24T00:00:00.000Z")
    );

    const result = submitSupplierResponse(
      invitation.token,
      {
        canHelp: true,
        earliestAvailability: "2026-07-25",
        indicativePriceAud: 18500,
        relevantExperience: "Siemens PLC packaging line recovery.",
        conditions: "Site induction required."
      },
      new Date("2026-07-24T00:00:00.000Z")
    );

    assert.equal(claim.status, "expired");
    assert.equal(result.status, "expired");
    assert.equal(getInvitation(invitation.token)?.status, "expired");
    assert.equal(
      created.matches.find((match) => match.supplier.id === invitation.supplierId)?.status,
      "expired"
    );
  });

  test("accepts supplier responses through invitation token and exposes standardised buyer responses", async () => {
    const created = await postJson("/api/needs", {
      buyerEmail: "buyer@example.com",
      profile: automationNeed()
    });
    const token = created.body.need.invitations[0].token;

    await sendOutreach(created.body.need.id);
    const invitation = await getJson(`/api/supplier-invitations/${token}`);

    assert.equal(invitation.status, 200);
    assert.equal(invitation.body.invitation.supplierId, "supplier-automation-nsw");
    assert.equal(invitation.body.invitation.status, "opened");
    assert.equal(invitation.body.supplierInvitation.status, "opened");
    assert.doesNotThrow(() => supplierInvitationSchema.parse(invitation.body.supplierInvitation));
    assert.ok(invitation.body.invitation.openedAt);
    assert.equal(invitation.body.need.id, created.body.need.id);
    await claimInvitation(token);

    const zeroPriced = await postJson(`/api/supplier-invitations/${token}/responses`, {
      canHelp: true,
      earliestAvailability: "2026-07-28",
      indicativePriceAud: 0,
      relevantExperience: "Completed urgent PLC and SCADA recovery for a packaging line.",
      conditions: ["Remote diagnostics required before site attendance."]
    });
    assert.equal(zeroPriced.status, 400);
    assert.match(
      zeroPriced.body.issues.indicativePriceAud[0],
      /greater than zero/
    );

    const submitted = await postJson(`/api/supplier-invitations/${token}/responses`, {
      canHelp: true,
      earliestAvailability: "2026-07-28",
      indicativePriceAud: 18500,
      relevantExperience: "Completed urgent PLC and SCADA recovery for a packaging line.",
      proposedApproach:
        "Review preserved diagnostics, verify the approved backup and execute a controlled recovery.",
      assumptions: [
        "An authorised site representative and current electrical drawings are available."
      ],
      conditions: ["Remote diagnostics required before site attendance."]
    });

    assert.equal(submitted.status, 201);
    assert.doesNotThrow(() => supplierResponseSchema.parse(submitted.body.supplierResponse));
    assert.equal(submitted.body.supplierResponse.decision, "can_help");
    assert.deepEqual(submitted.body.supplierResponse.indicativePrice, {
      amount: 1850000,
      currency: "AUD"
    });
    assert.match(
      submitted.body.supplierResponse.proposedApproach,
      /controlled recovery/
    );
    assert.deepEqual(submitted.body.supplierResponse.assumptions, [
      "An authorised site representative and current electrical drawings are available."
    ]);
    assert.deepEqual(submitted.body.supplierResponse.conditions, [
      "Remote diagnostics required before site attendance."
    ]);
    assert.equal(submitted.body.response.supplierId, "supplier-automation-nsw");
    assert.equal(submitted.body.response.canHelp, true);

    const duplicate = await postJson(`/api/supplier-invitations/${token}/responses`, {
      canHelp: true,
      earliestAvailability: "2026-07-29",
      indicativePriceAud: 19000,
      relevantExperience: "Accidental duplicate submission.",
      proposedApproach: "Updated controlled recovery plan.",
      assumptions: ["Site access remains available."],
      conditions: "Should not create a second response."
    });
    assert.equal(duplicate.status, 201);
    assert.equal(duplicate.body.response.id, submitted.body.response.id);
    assert.equal(duplicate.body.response.indicativePriceAud, 19000);
    assert.equal(duplicate.body.supplierResponse.id, submitted.body.supplierResponse.id);
    assert.deepEqual(duplicate.body.supplierResponse.indicativePrice, {
      amount: 1900000,
      currency: "AUD"
    });

    const responses = await getJson(`/api/needs/${created.body.need.id}/responses`);

    assert.equal(responses.status, 200);
    assert.deepEqual(responses.body.responses, [duplicate.body.response]);
    assert.deepEqual(responses.body.supplierResponses, [duplicate.body.supplierResponse]);

    const reopened = await getJson(`/api/supplier-invitations/${token}`);
    assert.equal(reopened.status, 200);
    assert.equal(reopened.body.supplierInvitation.status, "responded");
    assert.equal(reopened.body.response.id, submitted.body.response.id);
    assert.equal(reopened.body.supplierResponse.id, submitted.body.supplierResponse.id);
    assert.equal(reopened.body.supplierResponse.decision, "can_help");
  });

  test("enforces one valid supplier selection and closes later supplier response changes", async () => {
    const created = await postJson("/api/needs", {
      buyerEmail: "buyer@example.com",
      profile: structuredSiemensNeed()
    });
    const [firstInvitation, secondInvitation] = created.body.need.invitations;
    await sendOutreach(created.body.need.id);
    await claimInvitation(firstInvitation.token);
    await claimInvitation(secondInvitation.token);

    const legacyZeroQuote = submitSupplierResponse(firstInvitation.token, {
      canHelp: true,
      earliestAvailability: "Same day",
      indicativePriceAud: 0,
      relevantExperience: "Legacy response created below the HTTP validation boundary.",
      conditions: "Remote triage before dispatch."
    });
    assert.equal(legacyZeroQuote.status, "submitted");
    if (legacyZeroQuote.status !== "submitted") {
      assert.fail("Expected a direct store fixture response");
    }
    assert.equal(
      createEngagement({
        needId: created.body.need.id,
        supplierResponseId: legacyZeroQuote.supplierResponse.id
      }).status,
      "not_selectable"
    );

    const declined = await postJson(`/api/supplier-invitations/${firstInvitation.token}/responses`, {
      canHelp: false,
      earliestAvailability: "Unavailable",
      indicativePriceAud: 0,
      relevantExperience: "Relevant Siemens experience, but no crew is currently available.",
      conditions: "No availability."
    });
    const declinedSelection = await postJson(
      `/api/need-profiles/${created.body.need.id}/engagements`,
      { supplierResponseId: declined.body.response.id }
    );
    assert.equal(declinedSelection.status, 409);

    const accepted = await postJson(`/api/supplier-invitations/${firstInvitation.token}/responses`, {
      canHelp: true,
      earliestAvailability: "Same day",
      indicativePriceAud: 18500,
      relevantExperience: "Recovered Siemens S7 packaging lines under production pressure.",
      conditions: "Remote triage before dispatch."
    });
    const alternative = await postJson(
      `/api/supplier-invitations/${secondInvitation.token}/responses`,
      {
        canHelp: true,
        earliestAvailability: "Next morning",
        indicativePriceAud: 17250,
        relevantExperience: "Siemens PLC and conveyor controls support across Western Sydney.",
        conditions: "Site induction required."
      }
    );

    const selected = await postJson(`/api/need-profiles/${created.body.need.id}/engagements`, {
      supplierResponseId: accepted.body.response.id
    });
    const repeatedSelection = await postJson(
      `/api/need-profiles/${created.body.need.id}/engagements`,
      { supplierResponseId: accepted.body.response.id }
    );
    const competingSelection = await postJson(
      `/api/need-profiles/${created.body.need.id}/engagements`,
      { supplierResponseId: alternative.body.response.id }
    );
    const lateResponseChange = await postJson(
      `/api/supplier-invitations/${secondInvitation.token}/responses`,
      {
        canHelp: true,
        earliestAvailability: "Same day",
        indicativePriceAud: 16000,
        relevantExperience: "Attempted change after buyer selection.",
        conditions: "None."
      }
    );

    assert.equal(selected.status, 201);
    assert.equal(repeatedSelection.status, 201);
    assert.equal(repeatedSelection.body.engagement.id, selected.body.engagement.id);
    assert.equal(competingSelection.status, 409);
    assert.equal(lateResponseChange.status, 409);

    const retrieved = await getJson(`/api/needs/${created.body.need.id}`);
    assert.equal(retrieved.body.need.status, "selected");
    assert.equal(
      retrieved.body.need.matches.filter((match: { status: string }) => match.status === "selected").length,
      1
    );
  });

  test("emits realtime buyer updates when a supplier response is submitted", async () => {
    const created = await postJson("/api/needs", {
      buyerEmail: "buyer@example.com",
      profile: automationNeed()
    });
    const needProfileId = created.body.need.id;
    const token = created.body.need.invitations[0].token;
    await approveOutreachAndClaim(needProfileId, token);
    const client = await connectSocket();
    const updatePromise = onceSocket(client, rapidMatchSocketEvent.supplierResponseSubmitted);

    client.emit(rapidMatchSocketEvent.joinNeedProfile, { needProfileId });
    await wait(25);

    const submitted = await postJson(`/api/supplier-invitations/${token}/responses`, {
      canHelp: false,
      earliestAvailability: "2026-07-30",
      indicativePriceAud: 0,
      relevantExperience: "Team is already committed to another outage response.",
      conditions: "Can review future commissioning needs after next week."
    });
    const update = await updatePromise;

    client.close();
    assert.equal(submitted.status, 201);
    assert.equal(update.needProfileId, needProfileId);
    assert.equal(update.supplierResponse.decision, "cannot_help");
    assert.equal(update.supplierResponse.status, "submitted");
  });

  test("emits realtime buyer updates when an invitation link is opened", async () => {
    const created = await postJson("/api/needs", {
      buyerEmail: "buyer@example.com",
      profile: automationNeed()
    });
    const needProfileId = created.body.need.id;
    const token = created.body.need.invitations[0].token;
    const client = await connectSocket();
    const updatePromise = onceSocket(client, rapidMatchSocketEvent.invitationSent);

    client.emit(rapidMatchSocketEvent.joinNeedProfile, { needProfileId });
    await wait(25);

    const invitation = await getJson(`/api/supplier-invitations/${token}`);
    const update = await updatePromise;

    client.close();
    assert.equal(invitation.status, 200);
    assert.equal(invitation.body.supplierInvitation.status, "opened");
    assert.equal(update.needProfileId, needProfileId);
    assert.equal(update.supplierInvitation.status, "opened");
    assert.equal(update.supplierInvitation.supplierId, "supplier-automation-nsw");
  });

  test("honours shared deliveryChannels through the production invitation route", async () => {
    const originalFetch = globalThis.fetch;
    const originalOutreachEnv = {
      EMAIL_PROVIDER: env.EMAIL_PROVIDER,
      EMAIL_FROM: env.EMAIL_FROM,
      RESEND_API_KEY: env.RESEND_API_KEY,
      SMS_PROVIDER: env.SMS_PROVIDER,
      TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN: env.TWILIO_AUTH_TOKEN,
      TWILIO_FROM_NUMBER: env.TWILIO_FROM_NUMBER,
      SUPPLIER_OUTREACH_EMAIL_TO: env.SUPPLIER_OUTREACH_EMAIL_TO,
      SUPPLIER_OUTREACH_SMS_TO: env.SUPPLIER_OUTREACH_SMS_TO,
      SUPPLIER_OUTREACH_WHATSAPP_TO:
        env.SUPPLIER_OUTREACH_WHATSAPP_TO
    };
    Object.assign(env, {
      EMAIL_PROVIDER: "resend",
      EMAIL_FROM: "Veltact <opportunities@veltact.test>",
      RESEND_API_KEY: "re_test_key",
      SMS_PROVIDER: "twilio",
      TWILIO_ACCOUNT_SID: "AC123",
      TWILIO_AUTH_TOKEN: "twilio_test_token",
      TWILIO_FROM_NUMBER: "+61400000000",
      SUPPLIER_OUTREACH_EMAIL_TO: "supplier@example.com",
      SUPPLIER_OUTREACH_SMS_TO: "+61411111111",
      SUPPLIER_OUTREACH_WHATSAPP_TO: undefined
    });
    const providerCalls: string[] = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) {
        return originalFetch(input, init);
      }
      providerCalls.push(url);
      if (url === "https://api.resend.com/emails") {
        return new Response(JSON.stringify({ id: "email-123" }), {
          status: 200
        });
      }
      if (
        url ===
        "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json"
      ) {
        return new Response(
          JSON.stringify({ sid: "SM123", status: "queued" }),
          { status: 201 }
        );
      }
      throw new Error(`Unexpected provider URL: ${url}`);
    };

    const sendWithChannels = async (
      deliveryChannels: Array<"email" | "sms">
    ) => {
      resetMarketplaceStore();
      providerCalls.splice(0);
      const created = await postJson("/api/needs", {
        buyerEmail: "buyer@example.com",
        profile: automationNeed()
      });
      const sent = await postJson(
        `/api/need-profiles/${created.body.need.id}/invitations/send`,
        {
          deliveryChannels
        }
      );
      assert.equal(sent.status, 200);
      assert.ok(
        sent.body.supplierInvitations.every(
          (candidate: { responseUrl: string }) =>
            /supplier\.html\?token=/.test(candidate.responseUrl)
        )
      );
      return sent.body.supplierOutreachDeliveries as Array<{
        channel: "email" | "sms";
        deliveryStatus: string;
      }>;
    };

    try {
      const emailDeliveries = await sendWithChannels(["email"]);
      const sentEmailCount = emailDeliveries.filter(
        (delivery) =>
          delivery.channel === "email" &&
          delivery.deliveryStatus === "sent"
      ).length;
      assert.ok(sentEmailCount > 0);
      assert.equal(providerCalls.length, sentEmailCount);
      assert.deepEqual(
        [...new Set(providerCalls)],
        ["https://api.resend.com/emails"]
      );
      assert.equal(
        emailDeliveries.some(
          (delivery) =>
            delivery.channel === "sms" &&
            delivery.deliveryStatus === "sent"
        ),
        false
      );

      const smsDeliveries = await sendWithChannels(["sms"]);
      const sentSmsCount = smsDeliveries.filter(
        (delivery) =>
          delivery.channel === "sms" &&
          delivery.deliveryStatus === "sent"
      ).length;
      assert.ok(sentSmsCount > 0);
      assert.equal(providerCalls.length, sentSmsCount);
      assert.deepEqual(
        [...new Set(providerCalls)],
        [
          "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json"
        ]
      );
      assert.equal(
        smsDeliveries.some(
          (delivery) =>
            delivery.channel === "email" &&
            delivery.deliveryStatus === "sent"
        ),
        false
      );
      const linkDeliveries = await sendWithChannels([]);
      assert.deepEqual(providerCalls, []);
      assert.ok(
        linkDeliveries.every(
          (delivery) => delivery.deliveryStatus === "not_sent"
        )
      );
    } finally {
      Object.assign(env, originalOutreachEnv);
      globalThis.fetch = originalFetch;
    }
  });

  test("keeps local demo and unavailable outreach unsent without reporting failures", async () => {
    const created = await postJson("/api/needs", {
      buyerEmail: "buyer@example.com",
      profile: automationNeed()
    });
    const needProfileId = created.body.need.id;
    const client = await connectSocket();
    const updates: Record<string, any>[] = [];

    client.on(rapidMatchSocketEvent.outreachDeliveryUpdated, (payload) => {
      updates.push(payload);
    });
    client.emit(rapidMatchSocketEvent.joinNeedProfile, { needProfileId });
    await wait(25);

    const sent = await postJson(`/api/need-profiles/${needProfileId}/invitations/send`, {});
    await wait(25);

    client.close();
    assert.equal(sent.status, 200);
    assert.equal(sent.body.supplierOutreachDeliveries.length, 6);
    const emailDeliveries = (sent.body.supplierOutreachDeliveries as Record<string, any>[]).filter(
      (delivery) => delivery.channel === "email"
    );
    const smsDeliveries = (sent.body.supplierOutreachDeliveries as Record<string, any>[]).filter(
      (delivery) => delivery.channel === "sms"
    );
    assert.equal(emailDeliveries.length, 3);
    assert.equal(smsDeliveries.length, 3);
    for (const delivery of emailDeliveries) {
      assert.doesNotThrow(() => supplierOutreachDeliverySchema.parse(delivery));
      assert.equal(delivery.deliveryStatus, "not_sent");
      assert.equal(delivery.sentAt, undefined);
      assert.match(delivery.errorMessage, /Local demo only/);
    }
    for (const delivery of smsDeliveries) {
      assert.doesNotThrow(() => supplierOutreachDeliverySchema.parse(delivery));
      assert.equal(delivery.deliveryStatus, "not_sent");
      assert.equal(delivery.sentAt, undefined);
      assert.match(delivery.errorMessage, /SMS provider is not configured/);
    }
    assert.equal(
      listMarketplaceAuditEvents().filter(
        (event) =>
          event.eventType === "outreach.not_configured" &&
          event.metadata.outcome === "not_configured" &&
          event.metadata.attempted === false
      ).length,
      3
    );
    assert.ok(
      updates.some(
        (update) =>
          update.needProfileId === needProfileId &&
          update.outreachDelivery.channel === "email" &&
          update.outreachDelivery.deliveryStatus === "not_sent" &&
          /Local demo only/.test(update.outreachDelivery.errorMessage)
      )
    );
    assert.equal(
      updates.some(
        (update) => update.outreachDelivery.deliveryStatus === "failed"
      ),
      false
    );
  });

  test("marks attempted provider failures while leaving unconfigured channels unsent", async () => {
    const originalEmailProvider = env.EMAIL_PROVIDER;
    const originalEmailFrom = env.EMAIL_FROM;
    const originalResendApiKey = env.RESEND_API_KEY;
    const originalFetch = globalThis.fetch;
    Object.assign(env, {
      EMAIL_PROVIDER: "resend",
      EMAIL_FROM: "Veltact <opportunities@veltact.test>",
      RESEND_API_KEY: "re_test_key"
    });
    globalThis.fetch = async (input, init) => {
      if (String(input).startsWith(baseUrl)) {
        return originalFetch(input, init);
      }
      throw new Error("provider connection unavailable");
    };

    try {
      const created = await postJson("/api/needs", {
        buyerEmail: "buyer@example.com",
        profile: automationNeed()
      });
      const needProfileId = created.body.need.id;
      const client = await connectSocket();
      const updates: Record<string, any>[] = [];
      client.on(rapidMatchSocketEvent.outreachDeliveryUpdated, (payload) => {
        updates.push(payload);
      });
      client.emit(rapidMatchSocketEvent.joinNeedProfile, { needProfileId });
      await wait(25);

      const result = await postJson(`/api/need-profiles/${needProfileId}/invitations/send`, {});
      await wait(25);
      client.close();

      assert.equal(result.status, 200);
      assert.equal(result.body.supplierOutreachDeliveries.length, 6);
      const emailDeliveries = result.body.supplierOutreachDeliveries.filter(
        (delivery: { channel: string }) => delivery.channel === "email"
      );
      const smsDeliveries = result.body.supplierOutreachDeliveries.filter(
        (delivery: { channel: string }) => delivery.channel === "sms"
      );
      assert.equal(emailDeliveries.length, 3);
      assert.equal(smsDeliveries.length, 3);
      assert.ok(
        emailDeliveries.every(
          (delivery: { deliveryStatus: string }) =>
            delivery.deliveryStatus === "failed"
        )
      );
      assert.ok(
        emailDeliveries.every((delivery: { errorMessage: string }) =>
          /Resend delivery request failed: provider connection unavailable/.test(
            delivery.errorMessage
          )
        )
      );
      assert.ok(
        smsDeliveries.every(
          (delivery: { deliveryStatus: string; errorMessage: string }) =>
            delivery.deliveryStatus === "not_sent" &&
            /SMS provider is not configured/.test(delivery.errorMessage)
        )
      );
      assert.ok(
        updates.some(
          (update) =>
            update.outreachDelivery.channel === "email" &&
            update.outreachDelivery.deliveryStatus === "queued"
        )
      );
      assert.ok(
        updates.some(
          (update) =>
            update.outreachDelivery.channel === "email" &&
            update.outreachDelivery.deliveryStatus === "failed"
        )
      );
    } finally {
      Object.assign(env, {
        EMAIL_PROVIDER: originalEmailProvider,
        EMAIL_FROM: originalEmailFrom,
        RESEND_API_KEY: originalResendApiKey
      });
      globalThis.fetch = originalFetch;
    }
  });

  test("rejects malformed needs and unknown supplier invitation tokens", async () => {
    const invalidNeed = await postJson("/api/needs", {
      buyerEmail: "not-an-email",
      profile: {}
    });
    const missingInvitation = await getJson("/api/supplier-invitations/not-real");

    assert.equal(invalidNeed.status, 400);
    assert.equal(invalidNeed.body.status, "error");
    assert.equal(missingInvitation.status, 404);
  });

  test("acknowledges a signed payment event that cannot be matched", async () => {
    const evidenceCount = listPinchWebhookEvidence().length;
    const eventId = "evt_signed_unmatched_engagement";
    const unknownEngagementId = "engagement-does-not-exist";
    const webhook = await postSignedWebhook({
      Id: eventId,
      Type: "realtime-payment",
      EventDate: new Date().toISOString(),
      Data: {
        Payment: {
          Id: "pmt_unmatched",
          Amount: 1_850_000,
          Currency: "AUD",
          Status: "approved",
          Payer: {
            Id: "pyr_unmatched"
          },
          Metadata: JSON.stringify({
            engagementId: unknownEngagementId,
            needId: "need-does-not-exist",
            supplierId: "supplier-does-not-exist",
            milestoneId: "milestone-does-not-exist",
            commitmentType: "commercial_commitment",
            commitmentAmountMinor: "1850000",
            commitmentCurrency: "AUD"
          })
        }
      }
    });

    assert.equal(webhook.status, 200);
    assert.equal(webhook.body.received, true);
    assert.equal(webhook.body.processed, false);
    assert.equal(webhook.body.reason, "no_matching_engagement");
    assert.equal(getEngagement(unknownEngagementId), undefined);
    assert.equal(listPinchWebhookEvidence().length, evidenceCount);

    const events = await getJson("/api/pinch/webhooks/events");
    const storedEvent = events.body.events.find(
      (event: { id?: string }) => event.id === eventId
    );
    assert.equal(storedEvent?.processed, false);
    assert.equal(storedEvent?.reason, "no_matching_engagement");
  });

  test("preserves cents and secures and notifies only after verified Pinch event", async () => {
    const created = await postJson("/api/needs", {
      buyerEmail: "buyer@example.com",
      profile: automationNeed()
    });
    const token = created.body.need.invitations[0].token;
    await approveOutreachAndClaim(created.body.need.id, token);
    const submitted = await postJson(`/api/supplier-invitations/${token}/responses`, {
      canHelp: true,
      earliestAvailability: "2026-07-28",
      indicativePriceAud: 18500,
      relevantExperience: "Completed urgent PLC and SCADA recovery for a packaging line.",
      conditions: "Remote diagnostics required before site attendance."
    });

    const selected = await postJson(`/api/need-profiles/${created.body.need.id}/engagements`, {
      supplierResponseId: submitted.body.response.id
    });
    assert.equal(selected.status, 201);
    assert.doesNotThrow(() => engagementSchema.parse(selected.body.engagement));
    assert.equal(selected.body.engagement.paymentStatus, "not_started");

    const paymentLink = await postJson(
      `/api/engagements/${selected.body.engagement.id}/payment-link`,
      {}
    );
    assert.equal(paymentLink.status, 201);
    assert.doesNotThrow(() => engagementSchema.parse(paymentLink.body.engagement));
    assert.equal(paymentLink.body.engagement.status, "payment_pending");
    assert.equal(paymentLink.body.engagement.paymentStatus, "awaiting_payment");
    assert.match(paymentLink.body.hostedCheckoutUrl, /^https:\/\/sandbox\.getpinch\.com\.au/);
    assert.equal(paymentLink.body.commitmentMilestone.title, "Diagnosis");
    assert.equal(
      paymentLink.body.commitmentMilestone.amount.amount,
      1_850_000
    );
    assert.equal(
      paymentLink.body.commitmentMilestone.status,
      "awaiting_payment"
    );

    const reusedPaymentLink = await postJson(
      `/api/engagements/${selected.body.engagement.id}/payment-link`,
      {}
    );
    assert.equal(reusedPaymentLink.status, 200);
    assert.equal(reusedPaymentLink.body.reused, true);

    const pendingDeployment = await getJson(
      `/api/engagements/${selected.body.engagement.id}/deployment`
    );
    assert.equal(pendingDeployment.status, 200);
    assert.doesNotThrow(() =>
      deploymentSummarySchema.parse(pendingDeployment.body.deployment)
    );
    assert.equal(
      pendingDeployment.body.deployment.milestones[0].status,
      "awaiting_payment"
    );
    assert.equal(
      getSupplierCommitmentNotification(selected.body.engagement.id),
      undefined
    );

    const returned = await fetch(`${baseUrl}/api/pinch/return/${selected.body.engagement.id}`);
    const returnText = await returned.text();
    assert.equal(returned.status, 200);
    assert.match(returnText, /does not confirm payment success/);
    assert.match(
      returnText,
      new RegExp(
        `href="/index\\.html\\?needId=${encodeURIComponent(created.body.need.id)}"`
      )
    );
    assert.match(returnText, />Return to Veltact<\/a>/);

    const eventPayload = {
      Id: "evt_payment_approved",
      Type: "realtime-payment",
      EventDate: new Date().toISOString(),
      Data: {
        Payment: {
          Id: "pmt_approved",
          Amount: 1_850_000,
          Currency: "AUD",
          Status: "approved",
          Payer: {
            Id: `pyr_${selected.body.engagement.id}`
          },
          Metadata: JSON.stringify({
            engagementId: selected.body.engagement.id,
            needId: created.body.need.id,
            supplierId: selected.body.engagement.supplierId,
            milestoneId: `${selected.body.engagement.id}-m1-diagnosis`,
            commitmentType: "commercial_commitment",
            commitmentAmountMinor: "1850000",
            commitmentCurrency: "AUD"
          })
        }
      }
    };

    const webhook = await postSignedWebhook(eventPayload);
    assert.equal(webhook.status, 200);

    const secured = await getJson(`/api/engagements/${selected.body.engagement.id}`);
    assert.doesNotThrow(() => engagementSchema.parse(secured.body.engagement));
    assert.equal(secured.body.engagement.status, "supplier_secured");
    assert.equal(secured.body.engagement.paymentStatus, "paid");
    assert.equal(secured.body.engagement.pinchPaymentId, "pmt_approved");
    assert.equal(secured.body.engagement.localDemoPaymentId, undefined);
    assert.equal(secured.body.engagement.paymentEvidenceProvider, "pinch");
    assert.equal(secured.body.engagement.paymentEvidenceSource, "pinch_webhook");
    assert.equal(secured.body.engagement.paymentEvidenceAuthoritative, true);
    assert.equal(
      getSupplierCommitmentNotification(selected.body.engagement.id)
        ?.notificationType,
      "commitment_confirmed"
    );

    const securedWorkspace = await getJson(
      `/api/need-profiles/${created.body.need.id}`
    );
    assert.equal(
      securedWorkspace.body.workspace.deployment.milestones[0].status,
      "funded"
    );

    const fundedDeployment = await getJson(
      `/api/engagements/${selected.body.engagement.id}/deployment`
    );
    assert.equal(fundedDeployment.body.deployment.status, "active");
    assert.equal(fundedDeployment.body.deployment.progressPercentage, 0);
    assert.equal(
      fundedDeployment.body.deployment.milestones[0].status,
      "funded"
    );

    const firstMilestone = fundedDeployment.body.deployment.milestones[0];
    const started = await patchJson(
      `/api/engagements/${selected.body.engagement.id}/deployment/milestones/${firstMilestone.id}`,
      {
        status: "in_progress",
        latestUpdate: "Controlled diagnosis is underway."
      }
    );
    assert.equal(started.status, 200);
    assert.equal(started.body.deployment.progressPercentage, 13);

    const completedMilestone = await patchJson(
      `/api/engagements/${selected.body.engagement.id}/deployment/milestones/${firstMilestone.id}`,
      {
        status: "completed",
        latestUpdate: "Diagnosis evidence accepted by the buyer."
      }
    );
    assert.equal(completedMilestone.status, 200);
    assert.equal(completedMilestone.body.deployment.progressPercentage, 25);

    const workspace = await getJson(
      `/api/need-profiles/${created.body.need.id}`
    );
    assert.equal(workspace.body.workspace.deployment.progressPercentage, 25);

    const duplicate = await postSignedWebhook(eventPayload);
    assert.equal(duplicate.status, 200);
    const samePaymentNewEvent = await postSignedWebhook({
      ...eventPayload,
      Id: "evt_payment_approved_replayed"
    });
    assert.equal(samePaymentNewEvent.status, 200);
    assert.equal(listPinchWebhookEvidence().length, 1);

    const stillSecured = await getJson(`/api/engagements/${selected.body.engagement.id}`);
    assert.equal(stillSecured.body.engagement.securedAt, secured.body.engagement.securedAt);
  });

  test("funds only the next milestone with disclosed fee and per-milestone evidence", async () => {
    const created = await postJson("/api/needs", {
      buyerEmail: "buyer@example.com",
      profile: automationNeed()
    });
    const token = created.body.need.invitations[0].token;
    await approveOutreachAndClaim(created.body.need.id, token);
    const submitted = await postJson(
      `/api/supplier-invitations/${token}/responses`,
      {
        canHelp: true,
        earliestAvailability: "2026-07-28",
        indicativePriceAud: 18500,
        relevantExperience:
          "Completed staged PLC recovery and validation for a packaging line.",
        conditions: "Milestone scope requires buyer acceptance."
      }
    );
    const selected = await postJson(
      `/api/need-profiles/${created.body.need.id}/engagements`,
      { supplierResponseId: submitted.body.response.id }
    );
    const engagementId = selected.body.engagement.id;
    const commitmentLink = await postJson(
      `/api/engagements/${engagementId}/payment-link`,
      {}
    );
    const commitment = commitmentLink.body.commitmentMilestone;
    assert.equal(commitmentLink.body.serviceFeeMinor, 92_500);
    assert.equal(commitmentLink.body.serviceFeeDisclosed, true);

    await postSignedWebhook({
      Id: "evt_milestone_commitment",
      Type: "realtime-payment",
      Data: {
        Payment: {
          Id: "pmt_milestone_commitment",
          Amount: 1_850_000,
          Currency: "AUD",
          Status: "approved",
          Payer: { Id: commitment.pinchPayerId },
          Metadata: JSON.stringify({
            engagementId,
            needId: created.body.need.id,
            supplierId: selected.body.engagement.supplierId,
            milestoneId: commitment.id,
            commitmentType: "commercial_commitment",
            commitmentAmountMinor: "1850000",
            commitmentCurrency: "AUD",
            serviceFeeMinor: "92500",
            serviceFeeDisclosed: "true"
          })
        }
      }
    });
    await patchJson(
      `/api/engagements/${engagementId}/deployment/milestones/${commitment.id}`,
      {
        status: "in_progress",
        latestUpdate: "Diagnosis is underway."
      }
    );
    const completed = await patchJson(
      `/api/engagements/${engagementId}/deployment/milestones/${commitment.id}`,
      {
        status: "completed",
        latestUpdate: "Diagnosis evidence accepted."
      }
    );
    const second = completed.body.deployment.milestones[1];
    const third = completed.body.deployment.milestones[2];

    const skipped = await postJson(
      `/api/engagements/${engagementId}/milestones/${third.id}/payment-link`,
      {}
    );
    assert.equal(skipped.status, 409);
    assert.match(skipped.body.message, /next incomplete milestone/i);

    const secondLink = await postJson(
      `/api/engagements/${engagementId}/milestones/${second.id}/payment-link`,
      {}
    );
    assert.equal(secondLink.status, 201);
    assert.equal(secondLink.body.milestone.status, "awaiting_payment");
    assert.equal(secondLink.body.milestone.serviceFeeMinor, 92_500);
    assert.equal(secondLink.body.serviceFeeDisclosed, true);
    const secondInput = createdPaymentLinkInputs.at(-1);
    assert.equal(secondInput?.metadata?.milestoneId, second.id);
    assert.equal(secondInput?.metadata?.serviceFeeMinor, "92500");
    assert.equal(secondInput?.metadata?.serviceFeeDisclosed, "true");

    const cancelled = await postJson(
      `/api/engagements/${engagementId}/milestones/${second.id}/payment-link/cancel`,
      {}
    );
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.milestone.status, "not_started");
    assert.equal(cancelled.body.milestone.paymentStatus, "cancelled");
    assert.equal(cancelledPaymentLinkIds.length, 1);

    const recreated = await postJson(
      `/api/engagements/${engagementId}/milestones/${second.id}/payment-link`,
      {}
    );
    assert.equal(recreated.status, 201);
    const pendingSecond = recreated.body.milestone;
    const mismatched = await postSignedWebhook({
      Id: "evt_milestone_wrong_amount",
      Type: "realtime-payment",
      Data: {
        Payment: {
          Id: "pmt_milestone_wrong_amount",
          Amount: 1_850_001,
          Currency: "AUD",
          Status: "approved",
          Payer: { Id: pendingSecond.pinchPayerId },
          Metadata: JSON.stringify({
            engagementId,
            needId: created.body.need.id,
            supplierId: selected.body.engagement.supplierId,
            milestoneId: second.id,
            commitmentType: "commercial_commitment",
            commitmentAmountMinor: "1850001",
            commitmentCurrency: "AUD"
          })
        }
      }
    });
    assert.equal(mismatched.body.processed, false);
    assert.equal(mismatched.body.reason, "commitment_mismatch");
    const stillPending = await getJson(
      `/api/engagements/${engagementId}/deployment`
    );
    assert.equal(
      stillPending.body.deployment.milestones[1].status,
      "awaiting_payment"
    );

    const funded = await postSignedWebhook({
      Id: "evt_milestone_recovery_funded",
      Type: "realtime-payment",
      Data: {
        Payment: {
          Id: "pmt_milestone_recovery_funded",
          Amount: 1_850_000,
          Currency: "AUD",
          Status: "approved",
          Payer: { Id: pendingSecond.pinchPayerId },
          Metadata: JSON.stringify({
            engagementId,
            needId: created.body.need.id,
            supplierId: selected.body.engagement.supplierId,
            milestoneId: second.id,
            commitmentType: "commercial_commitment",
            commitmentAmountMinor: "1850000",
            commitmentCurrency: "AUD",
            serviceFeeMinor: "92500",
            serviceFeeDisclosed: "true"
          })
        }
      }
    });
    assert.equal(funded.body.processed, true);
    const deployment = await getJson(
      `/api/engagements/${engagementId}/deployment`
    );
    const fundedSecond = deployment.body.deployment.milestones[1];
    assert.equal(fundedSecond.status, "funded");
    assert.equal(fundedSecond.paymentStatus, "paid");
    assert.equal(fundedSecond.paymentEvidenceProvider, "pinch");
    assert.equal(fundedSecond.paymentEvidenceSource, "pinch_webhook");
    assert.equal(fundedSecond.paymentEvidenceAuthoritative, true);
    assert.equal(fundedSecond.paymentEvidenceEventId, funded.body.event.id);
    assert.equal(deployment.body.deployment.milestones[2].status, "not_started");
  });

  test("deduplicates one Pinch payment across reconciliation and webhook evidence", async () => {
    const created = await postJson("/api/needs", {
      buyerEmail: "buyer@example.com",
      profile: automationNeed()
    });
    const token = created.body.need.invitations[0].token;
    await approveOutreachAndClaim(created.body.need.id, token);
    const submitted = await postJson(`/api/supplier-invitations/${token}/responses`, {
      canHelp: true,
      earliestAvailability: "2026-07-28",
      indicativePriceAud: 18500,
      relevantExperience: "Completed urgent PLC recovery for a packaging line.",
      conditions: "Remote diagnostics required before site attendance."
    });
    const selected = await postJson(
      `/api/need-profiles/${created.body.need.id}/engagements`,
      {
        supplierResponseId: submitted.body.response.id
      }
    );
    const paymentLink = await postJson(
      `/api/engagements/${selected.body.engagement.id}/payment-link`,
      {}
    );
    const pendingEngagement = paymentLink.body.engagement;
    const paymentId = `pmt_${pendingEngagement.paymentLinkId}`;

    const reconciled = await getJson(
      `/api/engagements/${pendingEngagement.id}`
    );
    assert.equal(reconciled.status, 200);
    assert.equal(reconciled.body.engagement.status, "supplier_secured");
    assert.equal(
      reconciled.body.engagement.paymentEvidenceSource,
      "pinch_reconciliation"
    );
    assert.equal(listPinchWebhookEvidence().length, 1);
    const firstEvidence = listPinchWebhookEvidence()[0];
    const firstSecuredAt = reconciled.body.engagement.securedAt;

    const webhook = await postSignedWebhook({
      Id: "evt_reconciled_payment_webhook",
      Type: "realtime-payment",
      EventDate: new Date().toISOString(),
      Data: {
        Payment: {
          Id: paymentId,
          Amount: 1_850_000,
          Currency: "AUD",
          Status: "approved",
          Payer: {
            Id: pendingEngagement.pinchPayerId
          },
          Metadata: JSON.stringify({
            engagementId: pendingEngagement.id,
            needId: created.body.need.id,
            supplierId: pendingEngagement.supplierId,
            milestoneId: `${pendingEngagement.id}-m1-diagnosis`,
            commitmentType: "commercial_commitment",
            commitmentAmountMinor: "1850000",
            commitmentCurrency: "AUD"
          })
        }
      }
    });

    assert.equal(webhook.status, 200);
    assert.equal(webhook.body.processed, true);
    assert.equal(webhook.body.reason, "duplicate");
    assert.equal(listPinchWebhookEvidence().length, 1);
    assert.equal(listPinchWebhookEvidence()[0]?.eventId, firstEvidence?.eventId);

    const stillSecured = await getJson(
      `/api/engagements/${pendingEngagement.id}`
    );
    assert.equal(stillSecured.body.engagement.securedAt, firstSecuredAt);
    assert.equal(
      stillSecured.body.engagement.paymentEvidenceSource,
      "pinch_reconciliation"
    );
    assert.equal(
      listMarketplaceAuditEvents().filter(
        (event) => event.eventType === "payment.secured"
      ).length,
      1
    );
  });

  test("completes the local demo through the secured state without an external payment", async () => {
    env.PAYMENT_PROVIDER = "local_demo";
    setPaymentProviderForTest(localDemoPaymentProvider);
    const created = await postJson("/api/needs", {
      buyerEmail: "buyer@example.com",
      profile: automationNeed()
    });
    const token = created.body.need.invitations[0].token;
    await approveOutreachAndClaim(created.body.need.id, token);
    const submitted = await postJson(`/api/supplier-invitations/${token}/responses`, {
      canHelp: true,
      earliestAvailability: "2026-07-28",
      indicativePriceAud: 18500,
      relevantExperience: "Completed urgent PLC and SCADA recovery for a packaging line.",
      conditions: "Remote diagnostics required before site attendance."
    });
    const selected = await postJson(`/api/need-profiles/${created.body.need.id}/engagements`, {
      supplierResponseId: submitted.body.response.id
    });
    const paymentLink = await postJson(
      `/api/engagements/${selected.body.engagement.id}/payment-link`,
      {}
    );

    assert.equal(paymentLink.status, 201);
    const completed = await postJson(
      `/api/engagements/${selected.body.engagement.id}/demo-payment`,
      {}
    );

    assert.equal(completed.status, 200);
    assert.doesNotThrow(() => engagementSchema.parse(completed.body.engagement));
    assert.equal(completed.body.engagement.status, "supplier_secured");
    assert.equal(completed.body.engagement.paymentStatus, "paid");
    assert.equal(completed.body.engagement.pinchPaymentId, undefined);
    assert.match(completed.body.engagement.localDemoPaymentId, /^demo_/);
    assert.equal(
      completed.body.engagement.paymentEvidenceProvider,
      "local_demo"
    );
    assert.equal(completed.body.engagement.paymentEvidenceSource, "local_demo");
    assert.equal(
      completed.body.engagement.paymentEvidenceAuthoritative,
      false
    );
    assert.equal(completed.body.paymentEvidence.authoritative, false);
    assert.equal(completed.body.paymentEvidence.provider, "local_demo");
    assert.equal(completed.body.paymentEvidence.source, "local_demo");
    assert.match(completed.body.paymentEvidence.label, /Local demo only/);
    assert.match(completed.body.paymentEvidence.eventId, /^demo-payment:/);
    assert.match(completed.body.paymentEvidence.paymentId, /^demo_/);

    const persistedDemoEvidence = listLocalDemoPaymentEvidence();
    assert.equal(persistedDemoEvidence.length, 1);
    assert.equal(persistedDemoEvidence[0]?.provider, "local_demo");
    assert.equal(persistedDemoEvidence[0]?.source, "local_demo");
    assert.equal(persistedDemoEvidence[0]?.authoritative, false);
    assert.equal(listPinchWebhookEvidence().length, 0);
    assert.ok(
      listMarketplaceAuditEvents().some(
        (event) =>
          event.eventType === "payment.local_demo_secured" &&
          event.actorType === "system" &&
          event.actorId === "local_demo" &&
          event.metadata.provider === "local_demo" &&
          event.metadata.authoritative === false
      )
    );

    const securedAt = completed.body.engagement.securedAt;
    const repeatedStoreRecord = recordLocalDemoPayment({
      eventId: completed.body.paymentEvidence.eventId,
      eventType: "local-demo-payment",
      engagementId: selected.body.engagement.id,
      paymentId: completed.body.paymentEvidence.paymentId,
      payload: {
        source: "local_demo"
      }
    });
    assert.equal(repeatedStoreRecord.duplicate, true);
    assert.equal(repeatedStoreRecord.engagement?.securedAt, securedAt);
    assert.equal(listLocalDemoPaymentEvidence().length, 1);

    const duplicate = await postJson(
      `/api/engagements/${selected.body.engagement.id}/demo-payment`,
      {}
    );
    assert.equal(duplicate.status, 409);
    assert.equal(listLocalDemoPaymentEvidence().length, 1);
  });

  test("funds the next delivery milestone with labelled local demo evidence", async () => {
    env.PAYMENT_PROVIDER = "local_demo";
    setPaymentProviderForTest(localDemoPaymentProvider);
    const created = await postJson("/api/needs", {
      buyerEmail: "buyer@example.com",
      profile: automationNeed()
    });
    const token = created.body.need.invitations[0].token;
    await approveOutreachAndClaim(created.body.need.id, token);
    const submitted = await postJson(
      `/api/supplier-invitations/${token}/responses`,
      {
        canHelp: true,
        earliestAvailability: "2026-07-28",
        indicativePriceAud: 18500,
        relevantExperience:
          "Completed staged PLC recovery and validation for a packaging line.",
        conditions: "Each release requires buyer acceptance."
      }
    );
    const selected = await postJson(
      `/api/need-profiles/${created.body.need.id}/engagements`,
      { supplierResponseId: submitted.body.response.id }
    );
    const engagementId = selected.body.engagement.id;
    await postJson(`/api/engagements/${engagementId}/payment-link`, {});
    const commitment = await postJson(
      `/api/engagements/${engagementId}/demo-payment`,
      {}
    );
    const first = commitment.body.deployment.milestones[0];
    await patchJson(
      `/api/engagements/${engagementId}/deployment/milestones/${first.id}`,
      {
        status: "in_progress",
        latestUpdate: "Diagnosis is underway."
      }
    );
    const completed = await patchJson(
      `/api/engagements/${engagementId}/deployment/milestones/${first.id}`,
      {
        status: "completed",
        latestUpdate: "Diagnosis evidence accepted."
      }
    );
    const second = completed.body.deployment.milestones[1];

    const paymentLink = await postJson(
      `/api/engagements/${engagementId}/milestones/${second.id}/payment-link`,
      {}
    );
    assert.equal(paymentLink.status, 201);
    assert.equal(paymentLink.body.milestone.status, "awaiting_payment");
    assert.match(
      paymentLink.body.milestone.paymentLinkId,
      /^local_demo_link_/
    );
    assert.equal(paymentLink.body.serviceFeeMinor, 92_500);
    assert.equal(paymentLink.body.serviceFeeDisclosed, true);

    const funded = await postJson(
      `/api/engagements/${engagementId}/milestones/${second.id}/demo-payment`,
      {}
    );
    assert.equal(funded.status, 200);
    assert.equal(funded.body.milestone.status, "funded");
    assert.equal(funded.body.milestone.paymentStatus, "paid");
    assert.equal(funded.body.milestone.paymentEvidenceProvider, "local_demo");
    assert.equal(funded.body.milestone.paymentEvidenceSource, "local_demo");
    assert.equal(
      funded.body.milestone.paymentEvidenceAuthoritative,
      false
    );
    assert.match(funded.body.milestone.paymentEvidenceEventId, /^demo-payment:/);
    assert.equal(funded.body.paymentEvidence.authoritative, false);
    assert.equal(funded.body.paymentEvidence.milestoneId, second.id);
    assert.equal(listLocalDemoPaymentEvidence().length, 2);
    assert.equal(
      listMarketplaceAuditEvents().filter(
        (event) => event.eventType === "payment.local_demo_secured"
      ).length,
      1
    );
  });

  test("assembles an ordered and truthful engagement speed receipt", async (context) => {
    const originalResearchProvider = env.VELTACT_RESEARCH_PROVIDER;
    const originalBuyerProtection = env.BUYER_CAPABILITY_AUTH_REQUIRED;
    env.VELTACT_RESEARCH_PROVIDER = "fixture";
    context.after(() => {
      env.VELTACT_RESEARCH_PROVIDER = originalResearchProvider;
      env.BUYER_CAPABILITY_AUTH_REQUIRED = originalBuyerProtection;
    });
    env.PAYMENT_PROVIDER = "local_demo";
    setPaymentProviderForTest(localDemoPaymentProvider);
    const created = await postJson("/api/needs", {
      buyerEmail: "buyer@example.com",
      profile: automationNeed()
    });
    await postJson(
      `/api/need-profiles/${created.body.need.id}/research`,
      {}
    );
    const firstToken = created.body.need.invitations[0].token;
    const secondToken = created.body.need.invitations[1].token;
    await approveOutreachAndClaim(created.body.need.id, firstToken);
    await claimInvitation(secondToken);
    const firstResponse = await postJson(
      `/api/supplier-invitations/${firstToken}/responses`,
      {
        canHelp: true,
        earliestAvailability: "2026-08-01",
        indicativePriceAud: 18500,
        relevantExperience:
          "Completed staged PLC recovery and validation for a packaging line.",
        proposedApproach: "Assess, isolate, recover and validate.",
        assumptions: ["Controlled site access is available."],
        conditions: ["Final scope follows diagnosis."]
      }
    );
    await postJson(
      `/api/supplier-invitations/${secondToken}/responses`,
      {
        canHelp: true,
        earliestAvailability: "2026-08-03",
        indicativePriceAud: 21400,
        relevantExperience:
          "Delivered controls recovery and documented commissioning.",
        proposedApproach: "Review evidence, attend site and prove the restart.",
        assumptions: ["Current drawings can be supplied."],
        conditions: ["Travel is charged at cost."]
      }
    );
    const selected = await postJson(
      `/api/need-profiles/${created.body.need.id}/engagements`,
      { supplierResponseId: firstResponse.body.response.id }
    );
    const engagementId = selected.body.engagement.id;

    const pending = await getJson(
      `/api/engagements/${engagementId}/receipt`
    );
    assert.equal(pending.status, 200);
    const pendingReceipt = engagementSpeedReceiptSchema.parse(
      pending.body.receipt
    );
    assert.equal(pendingReceipt.status, "in_progress");
    assert.equal(pendingReceipt.elapsedMilliseconds, undefined);
    assert.equal(
      pendingReceipt.events.filter(
        (event) => event.stage === "supplier_response_received"
      ).length,
      2
    );
    assert.equal(
      pendingReceipt.events.find(
        (event) => event.stage === "payment_verified"
      )?.status,
      "pending"
    );
    assert.ok(
      pendingReceipt.events.some(
        (event) =>
          event.stage === "outreach_delivery" &&
          event.label.includes("invitation prepared") &&
          event.detail?.includes("no external delivery")
      )
    );

    await postJson(`/api/engagements/${engagementId}/payment-link`, {});
    await postJson(`/api/engagements/${engagementId}/demo-payment`, {});
    const secured = await getJson(
      `/api/engagements/${engagementId}/receipt`
    );
    const receipt = engagementSpeedReceiptSchema.parse(secured.body.receipt);
    assert.equal(receipt.status, "secured");
    assert.equal(
      receipt.elapsedMilliseconds,
      Date.parse(receipt.securedAt as string) - Date.parse(receipt.startedAt)
    );
    assert.deepEqual(
      receipt.events.map((event) => event.sequence),
      receipt.events.map((_, index) => index + 1)
    );
    const stageOrder = [
      "requirement_created",
      "analysis_completed",
      "outreach_delivery",
      "supplier_response_received",
      "supplier_selected",
      "payment_link_created",
      "payment_verified",
      "milestone_funded"
    ];
    assert.deepEqual(
      receipt.events
        .map((event) => stageOrder.indexOf(event.stage))
        .sort((left, right) => left - right),
      receipt.events.map((event) => stageOrder.indexOf(event.stage))
    );
    const paymentRecorded = receipt.events.find(
      (event) => event.stage === "payment_verified"
    );
    assert.equal(paymentRecorded?.label, "Local demo commitment recorded");
    assert.equal(paymentRecorded?.evidenceSource, "local_demo");
    assert.equal(paymentRecorded?.authoritative, false);
    assert.ok(
      receipt.events.some(
        (event) =>
          event.stage === "milestone_funded" &&
          event.status === "complete"
      )
    );
    assert.ok(
      receipt.events.some(
        (event) =>
          event.stage === "milestone_funded" &&
          event.status === "pending"
      )
    );
    assert.equal(receipt.baseline.label, "Industry norm: days to weeks");
    assert.equal(receipt.baseline.kind, "general_claim");

    env.BUYER_CAPABILITY_AUTH_REQUIRED = true;
    const unscoped = await getJson(
      `/api/engagements/${engagementId}/receipt`
    );
    assert.equal(unscoped.status, 401);
    const scoped = await getJson(
      `/api/engagements/${engagementId}/receipt`,
      { "x-veltact-buyer-token": created.body.buyerAccessToken }
    );
    assert.equal(scoped.status, 200);
    assert.doesNotThrow(() =>
      engagementSpeedReceiptSchema.parse(scoped.body.receipt)
    );
  });

  test("rejects demo evidence for a Pinch configuration and for a non-local link", async () => {
    const created = await postJson("/api/needs", {
      buyerEmail: "buyer@example.com",
      profile: automationNeed()
    });
    const token = created.body.need.invitations[0].token;
    await approveOutreachAndClaim(created.body.need.id, token);
    const submitted = await postJson(
      `/api/supplier-invitations/${token}/responses`,
      {
        canHelp: true,
        earliestAvailability: "2026-07-28",
        indicativePriceAud: 18500,
        relevantExperience:
          "Completed urgent PLC and SCADA recovery for a packaging line.",
        conditions: "Remote diagnostics required before site attendance."
      }
    );
    const selected = await postJson(
      `/api/need-profiles/${created.body.need.id}/engagements`,
      {
        supplierResponseId: submitted.body.response.id
      }
    );
    const paymentLink = await postJson(
      `/api/engagements/${selected.body.engagement.id}/payment-link`,
      {}
    );
    assert.equal(paymentLink.status, 201);
    assert.match(paymentLink.body.hostedCheckoutUrl, /getpinch\.com\.au/);

    const providerRejected = await postJson(
      `/api/engagements/${selected.body.engagement.id}/demo-payment`,
      {}
    );
    assert.equal(providerRejected.status, 404);

    env.PAYMENT_PROVIDER = "local_demo";
    const provenanceRejected = await postJson(
      `/api/engagements/${selected.body.engagement.id}/demo-payment`,
      {}
    );
    assert.equal(provenanceRejected.status, 409);
    assert.match(provenanceRejected.body.message, /local demo payment link/i);

    const engagement = getEngagement(selected.body.engagement.id);
    assert.equal(engagement?.paymentStatus, "awaiting_payment");
    assert.equal(engagement?.localDemoPaymentId, undefined);
    assert.equal(listLocalDemoPaymentEvidence().length, 0);
  });
});

async function getJson(path: string, headers: Record<string, string> = {}) {
  const response = await fetch(`${baseUrl}${path}`, { headers });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, any>
  };
}

async function getBinary(
  path: string,
  headers: Record<string, string> = {}
) {
  const response = await fetch(`${baseUrl}${path}`, { headers });
  return {
    status: response.status,
    headers: response.headers,
    body: Buffer.from(await response.arrayBuffer())
  };
}

async function postJson(path: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, any>
  };
}

async function patchJson(
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, any>
  };
}

async function sendOutreach(needProfileId: string) {
  const sent = await postJson(
    `/api/need-profiles/${needProfileId}/invitations/send`,
    {}
  );
  assert.equal(sent.status, 200);
  return sent;
}

async function claimInvitation(token: string) {
  const claimed = await postJson(
    `/api/supplier-invitations/${token}/claim`,
    {
      claimantName: "Demo supplier contact",
      claimantEmail: "supplier@example.com"
    }
  );
  assert.equal(claimed.status, 200);
  assert.equal(claimed.body.supplierClaim.status, "claimed");
  return claimed;
}

async function approveOutreachAndClaim(
  needProfileId: string,
  token: string
) {
  await sendOutreach(needProfileId);
  return claimInvitation(token);
}

async function postSignedWebhook(body: unknown) {
  const rawBody = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto
    .createHmac("sha256", process.env.PINCH_WEBHOOK_SECRET ?? "")
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const response = await fetch(`${baseUrl}/api/pinch/webhooks`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "pinch-signature": `t=${timestamp},v2=${signature}`
    },
    body: rawBody
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, any>
  };
}

async function connectSocket(): Promise<Socket> {
  const client = createSocketClient(baseUrl.replace("/api", ""), {
    transports: ["websocket"],
    reconnection: false
  });
  await new Promise<void>((resolve, reject) => {
    client.once("connect", resolve);
    client.once("connect_error", reject);
  });
  return client;
}

async function onceSocket(client: Socket, eventName: string): Promise<Record<string, any>> {
  return await new Promise((resolve) => client.once(eventName, resolve));
}

async function wait(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function automationNeed() {
  return {
    title: "Urgent PLC automation fault",
    description: "Urgent Siemens PLC fault on a packaging conveyor in Western Sydney. Support required today.",
    category: "automation",
    industry: "manufacturing",
    location: "Western Sydney NSW",
    urgencyDays: 1,
    budgetAud: 20000,
    requiredCapabilities: ["siemens", "plc", "conveyor"]
  };
}

function structuredSiemensNeed() {
  return {
    title: "Packaging conveyor Siemens PLC line stop",
    description: "Production has stopped and the buyer needs a supplier response.",
    problemSummary:
      "Packaging line stopped after intermittent Siemens PLC faults. Buyer needs safe production restored today.",
    category: "industrial automation",
    industry: "food packaging manufacturing",
    equipmentOrTechnology: ["Siemens S7 PLC", "Packaging conveyor"],
    location: "Western Sydney NSW",
    urgencyDays: 1,
    budgetAud: 20000,
    constraints: ["Food manufacturing site access", "Licensed electrical work required"],
    buyerPriority: "speed",
    requiredCapability: [
      "Siemens PLC diagnostics",
      "Conveyor fault recovery",
      "Onsite breakdown support"
    ]
  };
}

function roboticsNeed() {
  return {
    title: "Robotic palletiser stopped before morning dispatch",
    description:
      "ABB palletising robot stopped mid-cycle and the packaging line cannot restart safely.",
    problemSummary:
      "Cartons are backing up before a 6:00 am dispatch. A robotics specialist must diagnose the cell and restore safe production.",
    category: "industrial robotics and automation",
    industry: "food packaging manufacturing",
    equipmentOrTechnology: [
      "ABB palletising robot",
      "Siemens S7 PLC",
      "Robot cell safety circuit",
      "Packaging conveyor"
    ],
    location: "Western Sydney NSW",
    urgencyDays: 1,
    budgetAud: 18000,
    constraints: [
      "Supermarket dispatch at 6:00 am",
      "Safe restart and handover required"
    ],
    buyerPriority: "speed",
    requiredCapabilities: [
      "Robotic cell fault recovery",
      "ABB robot diagnostics",
      "Safety circuit diagnostics",
      "Same-shift onsite support"
    ]
  };
}
