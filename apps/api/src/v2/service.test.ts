import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { MarketplaceNeedProfile, SupplierLead } from "@veltact/contracts";
import { env } from "../env.js";
import { AtomicV2Repository } from "./repository.js";
import {
  transitionLead,
  V2ServiceError,
  VeltactV2Service
} from "./service.js";

let originalEnv: {
  BUYER_CAPABILITY_AUTH_REQUIRED: boolean;
  VELTACT_RESEARCH_PROVIDER: typeof env.VELTACT_RESEARCH_PROVIDER;
  EMAIL_PROVIDER: typeof env.EMAIL_PROVIDER;
  SMS_PROVIDER: typeof env.SMS_PROVIDER;
  PUBLIC_BASE_URL: string;
};

beforeEach(() => {
  originalEnv = {
    BUYER_CAPABILITY_AUTH_REQUIRED: env.BUYER_CAPABILITY_AUTH_REQUIRED,
    VELTACT_RESEARCH_PROVIDER: env.VELTACT_RESEARCH_PROVIDER,
    EMAIL_PROVIDER: env.EMAIL_PROVIDER,
    SMS_PROVIDER: env.SMS_PROVIDER,
    PUBLIC_BASE_URL: env.PUBLIC_BASE_URL
  };
  Object.assign(env, {
    BUYER_CAPABILITY_AUTH_REQUIRED: true,
    VELTACT_RESEARCH_PROVIDER: "fixture",
    EMAIL_PROVIDER: "local_demo",
    SMS_PROVIDER: "none",
    PUBLIC_BASE_URL: "https://demo.veltact.test"
  });
});

afterEach(() => {
  Object.assign(env, originalEnv);
});

describe("VeltactV2Service", { concurrency: false }, () => {
  test("enforces the complete supplier lifecycle and creates a funded project", async () => {
    const repository = new AtomicV2Repository(undefined);
    const service = new VeltactV2Service(repository);
    const created = await service.createNeed({
      buyerEmail: "engineer@example.com",
      buyerName: "Alex Morgan",
      companyName: "Example Factory",
      profile: plcProfile()
    });

    await assert.rejects(
      () => service.researchNeed(created.need.id, "wrong-token"),
      (error: unknown) =>
        error instanceof V2ServiceError && error.statusCode === 401
    );

    const research = await service.researchNeed(
      created.need.id,
      created.buyerAccessToken
    );
    const decision = await service.decideSolution(
      created.need.id,
      created.buyerAccessToken,
      {
        decision: "hybrid",
        selectedApproachIds: research.researchResult.approaches.map(
          (approach) => approach.id
        )
      }
    );
    assert.equal(decision.decision, "hybrid");

    const discovery = await service.discoverNeedSuppliers(
      created.need.id,
      created.buyerAccessToken
    );
    const lead = discovery.supplierLeads[0];
    await service.approveSupplierLeads(
      created.need.id,
      created.buyerAccessToken,
      [lead.id]
    );
    await service.inviteApprovedSuppliers(
      created.need.id,
      created.buyerAccessToken,
      [lead.id]
    );

    const invitation = repository
      .snapshot()
      .supplierInvitations.find((candidate) => candidate.supplierId === lead.id);
    assert.ok(invitation);
    assert.equal(
      repository
        .snapshot()
        .supplierLeads.find((candidate) => candidate.id === lead.id)
        ?.lifecycleStatus,
      "invited"
    );

    await service.openSupplierClaim(invitation.token);
    await assert.rejects(
      () =>
        service.submitSupplierResponse(invitation.token, {
          decision: "can_help",
          availability: "Within four hours",
          indicativePrice: { amount: 650_000, currency: "AUD" },
          proposedApproach: "Evidence review followed by controlled recovery.",
          relevantExperience: "Comparable packaging line recovery work.",
          assumptions: [],
          conditions: []
        }),
      (error: unknown) =>
        error instanceof V2ServiceError && error.statusCode === 409
    );
    await service.submitSupplierProfile(invitation.token, {
      companyName: lead.companyName,
      website: lead.website,
      contactName: "Sam Integrator",
      contactEmail: "sam@example.com",
      contactPhone: "+61400000999",
      location: lead.location,
      categories: ["Industrial automation"],
      industries: ["Manufacturing"],
      serviceRegions: ["NSW"],
      capabilities: lead.capabilities,
      certifications: ["Supplier-declared electrical licence"],
      profileSummary:
        "Supplier-approved demonstration profile for urgent industrial controls recovery."
    });
    const response = await service.submitSupplierResponse(invitation.token, {
      decision: "can_help",
      availability: "Within four hours",
      indicativePrice: { amount: 650_000, currency: "AUD" },
      proposedApproach:
        "Review preserved evidence, verify the baseline and execute the approved recovery plan.",
      relevantExperience:
        "Recovered comparable packaging controls and handed over validated backups.",
      assumptions: ["Authorised site representative is available"],
      conditions: ["Electrical work subject to site isolation procedure"]
    });
    const project = await service.selectSupplierResponse(
      created.need.id,
      created.buyerAccessToken,
      response.id
    );
    assert.equal(project.templateType, "urgent_plc_recovery");
    assert.equal(project.milestones[0].status, "awaiting_payment");
    assert.equal(
      repository
        .snapshot()
        .supplierLeads.find((candidate) => candidate.id === lead.id)
        ?.lifecycleStatus,
      "active_supplier"
    );
    assert.ok(
      repository
        .snapshot()
        .supplierProfiles.find(
          (candidate) => candidate.supplierLeadId === lead.id
        )?.buyerApprovedAt
    );

    const repeatedApproval = await service.approveSupplierLeads(
      created.need.id,
      created.buyerAccessToken,
      [lead.id]
    );
    assert.equal(repeatedApproval[0]?.lifecycleStatus, "active_supplier");

    const payment = await service.recordDemoMilestonePayment(
      project.id,
      created.buyerAccessToken,
      project.milestones[0].id
    );
    assert.equal(payment.milestone.paymentStatus, "paid");
    assert.equal(payment.evidence.provider, "local_demo");

    const accepted = await service.acceptMilestone(
      project.id,
      created.buyerAccessToken,
      project.milestones[0].id
    );
    assert.equal(accepted.milestones[0].status, "accepted");
    assert.equal(accepted.milestones[1].status, "awaiting_payment");
  });

  test("rejects lifecycle jumps", () => {
    const lead = {
      id: "lead-1",
      needProfileId: "need-1",
      companyName: "Lifecycle Test",
      website: "https://supplier.example",
      location: "Sydney, NSW",
      serviceRegions: ["NSW"],
      capabilities: ["automation"],
      matchScore: 80,
      matchReasons: ["Relevant capability"],
      risks: [],
      evidence: [
        {
          id: "citation-1",
          title: "Supplier website",
          url: "https://supplier.example",
          sourceType: "supplier_website",
          provider: "fixture",
          evidenceNote: "Fixture",
          accessedAt: "2026-07-26T00:00:00.000Z"
        }
      ],
      sourceMode: "fixture",
      lifecycleStatus: "discovered",
      createdAt: "2026-07-26T00:00:00.000Z",
      updatedAt: "2026-07-26T00:00:00.000Z"
    } satisfies SupplierLead;

    assert.throws(
      () => transitionLead(lead, "active_supplier"),
      /Invalid supplier transition/
    );
  });
});

function plcProfile(): MarketplaceNeedProfile {
  return {
    title: "Recover a stopped packaging line PLC",
    description:
      "The line stopped after a controller communications fault and needs controlled recovery.",
    category: "Industrial automation breakdown",
    industry: "Food manufacturing",
    equipmentOrTechnology: ["Siemens PLC"],
    location: "Newcastle, NSW",
    urgencyDays: 1,
    budgetAud: 12000,
    buyerPriority: "speed",
    requiredCapabilities: ["PLC diagnostics", "industrial networking"]
  };
}
