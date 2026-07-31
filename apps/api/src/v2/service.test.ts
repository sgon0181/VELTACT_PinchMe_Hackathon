import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { MarketplaceNeedProfile, SupplierLead } from "@veltact/contracts";
import { env } from "../env.js";
import { localDemoPaymentProvider } from "../payments/localDemoPaymentProvider.js";
import type { CreateHostedPaymentLinkInput } from "../payments/paymentProvider.js";
import {
  resetPaymentProviderForTest,
  setPaymentProviderForTest
} from "../payments/providerRegistry.js";
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
  PAYMENT_PROVIDER: typeof env.PAYMENT_PROVIDER;
  PUBLIC_BASE_URL: string;
};

beforeEach(() => {
  originalEnv = {
    BUYER_CAPABILITY_AUTH_REQUIRED: env.BUYER_CAPABILITY_AUTH_REQUIRED,
    VELTACT_RESEARCH_PROVIDER: env.VELTACT_RESEARCH_PROVIDER,
    EMAIL_PROVIDER: env.EMAIL_PROVIDER,
    SMS_PROVIDER: env.SMS_PROVIDER,
    PAYMENT_PROVIDER: env.PAYMENT_PROVIDER,
    PUBLIC_BASE_URL: env.PUBLIC_BASE_URL
  };
  Object.assign(env, {
    BUYER_CAPABILITY_AUTH_REQUIRED: true,
    VELTACT_RESEARCH_PROVIDER: "fixture",
    EMAIL_PROVIDER: "local_demo",
    SMS_PROVIDER: "none",
    PAYMENT_PROVIDER: "local_demo",
    PUBLIC_BASE_URL: "https://demo.veltact.test"
  });
  setPaymentProviderForTest(localDemoPaymentProvider);
});

afterEach(() => {
  Object.assign(env, originalEnv);
  resetPaymentProviderForTest();
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

    const localLink = await service.createMilestonePaymentLink(
      project.id,
      created.buyerAccessToken,
      project.milestones[0].id
    );
    assert.match(localLink.paymentLinkId ?? "", /^local_demo_link_/);
    assert.ok(localLink.hostedCheckoutUrl);
    const localHostedCheckoutUrl = localLink.hostedCheckoutUrl;

    env.PAYMENT_PROVIDER = "pinch";
    await assert.rejects(
      service.recordDemoMilestonePayment(
        project.id,
        created.buyerAccessToken,
        project.milestones[0].id
      ),
      (error: unknown) =>
        error instanceof V2ServiceError &&
        error.statusCode === 404 &&
        /payment provider/i.test(error.message)
    );

    env.PAYMENT_PROVIDER = "local_demo";
    await repository.mutate((draft) => {
      const storedProject = draft.projects.find(
        (candidate) => candidate.id === project.id
      );
      const storedMilestone = storedProject?.milestones.find(
        (candidate) => candidate.id === project.milestones[0].id
      );
      if (!storedMilestone?.hostedCheckoutUrl) {
        throw new Error("Expected a local demo hosted URL");
      }
      storedMilestone.hostedCheckoutUrl = storedMilestone.hostedCheckoutUrl.replace(
        "payment_provider=local_demo",
        "payment_provider=pinch"
      );
    });
    await assert.rejects(
      service.recordDemoMilestonePayment(
        project.id,
        created.buyerAccessToken,
        project.milestones[0].id
      ),
      (error: unknown) =>
        error instanceof V2ServiceError &&
        error.statusCode === 409 &&
        /local demo payment link/i.test(error.message)
    );
    await repository.mutate((draft) => {
      const storedProject = draft.projects.find(
        (candidate) => candidate.id === project.id
      );
      const storedMilestone = storedProject?.milestones.find(
        (candidate) => candidate.id === project.milestones[0].id
      );
      if (!storedMilestone) {
        throw new Error("Expected a stored milestone");
      }
      storedMilestone.hostedCheckoutUrl = localHostedCheckoutUrl;
    });

    const payment = await service.recordDemoMilestonePayment(
      project.id,
      created.buyerAccessToken,
      project.milestones[0].id
    );
    assert.equal(payment.milestone.paymentStatus, "paid");
    assert.equal(payment.evidence.provider, "local_demo");
    assert.equal(payment.evidence.authoritative, false);

    const accepted = await service.acceptMilestone(
      project.id,
      created.buyerAccessToken,
      project.milestones[0].id
    );
    assert.equal(accepted.milestones[0].status, "accepted");
    assert.equal(accepted.milestones[1].status, "awaiting_payment");

    let createdPinchLinkInput: CreateHostedPaymentLinkInput | undefined;
    setPaymentProviderForTest({
      async createHostedPaymentLink(input) {
        createdPinchLinkInput = input;
        return {
          provider: "pinch",
          payerId: "pinch-payer-1",
          paymentLinkId: `pinch-link-${input.engagementId}`,
          hostedCheckoutUrl: "https://sandbox.getpinch.com.au/pay/link-1"
        };
      },
      async getApprovedPaymentForLink() {
        return {
          provider: "pinch",
          paymentId: "pinch-payment-1",
          status: "approved"
        };
      }
    });
    env.PAYMENT_PROVIDER = "pinch";
    await service.createMilestonePaymentLink(
      project.id,
      created.buyerAccessToken,
      accepted.milestones[1].id
    );
    assert.equal(
      createdPinchLinkInput?.metadata?.commitmentType,
      "commercial_commitment"
    );
    assert.equal(
      createdPinchLinkInput?.metadata?.commitmentAmountMinor,
      String(accepted.milestones[1].amount.amount)
    );
    assert.equal(
      createdPinchLinkInput?.metadata?.commitmentCurrency,
      accepted.milestones[1].amount.currency
    );
    assert.equal(
      createdPinchLinkInput?.currency,
      accepted.milestones[1].amount.currency
    );
    const reconciled = await service.reconcileMilestonePayment(
      project.id,
      created.buyerAccessToken,
      accepted.milestones[1].id
    );
    assert.equal(reconciled.paymentStatus, "paid");
    const authoritativeEvidence = repository
      .snapshot()
      .paymentEvidence.find(
        (evidence) => evidence.milestoneId === accepted.milestones[1].id
      );
    assert.equal(authoritativeEvidence?.provider, "pinch");
    assert.equal(authoritativeEvidence?.authoritative, true);
  });

  test("requires a claim before accepting a profile-free decline", async () => {
    const repository = new AtomicV2Repository(undefined);
    const service = new VeltactV2Service(repository);
    const created = await service.createNeed({
      buyerEmail: "engineer@example.com",
      buyerName: "Alex Morgan",
      companyName: "Example Factory",
      profile: plcProfile()
    });
    const research = await service.researchNeed(
      created.need.id,
      created.buyerAccessToken
    );
    await service.decideSolution(
      created.need.id,
      created.buyerAccessToken,
      {
        decision: "hybrid",
        selectedApproachIds: research.researchResult.approaches.map(
          (approach) => approach.id
        )
      }
    );
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
    await service.openSupplierClaim(invitation.token);

    await assert.rejects(
      () =>
        service.submitSupplierResponse(invitation.token, {
          decision: "cannot_help",
          declineReason: "Outside our current service window.",
          assumptions: [],
          conditions: []
        }),
      (error: unknown) =>
        error instanceof V2ServiceError &&
        error.statusCode === 409 &&
        /Claim the supplier invitation/.test(error.message)
    );

    await service.claimSupplierInvitation(invitation.token, {
      claimantName: "Sam Integrator",
      claimantEmail: "sam@example.com"
    });
    const response = await service.submitSupplierResponse(invitation.token, {
      decision: "cannot_help",
      declineReason: "Outside our current service window.",
      assumptions: [],
      conditions: []
    });

    assert.equal(response.decision, "cannot_help");
    assert.equal(response.supplierProfileId, undefined);
    assert.equal(response.declineReason, "Outside our current service window.");
    const snapshot = repository.snapshot();
    assert.equal(snapshot.supplierProfiles.length, 0);
    assert.equal(
      snapshot.supplierLeads.find((candidate) => candidate.id === lead.id)
        ?.lifecycleStatus,
      "declined"
    );
    assert.equal(
      snapshot.supplierInvitations.find(
        (candidate) => candidate.id === invitation.id
      )?.status,
      "responded"
    );
  });

  test("keeps failed outreach retryable until a real or local-demo delivery path is available", async () => {
    const repository = new AtomicV2Repository(undefined);
    const service = new VeltactV2Service(repository);
    const { created, lead } = await createApprovedLead(service);
    const originalFetch = globalThis.fetch;
    const originalEmailProvider = env.EMAIL_PROVIDER;
    const originalEmailFrom = env.EMAIL_FROM;
    const originalResendApiKey = env.RESEND_API_KEY;
    let providerCalls = 0;

    try {
      Object.assign(env, {
        EMAIL_PROVIDER: "resend",
        EMAIL_FROM: "Veltact <outreach@veltact.test>",
        RESEND_API_KEY: "resend-test-secret",
        SMS_PROVIDER: "none"
      });
      globalThis.fetch = async () => {
        providerCalls += 1;
        return new Response("provider unavailable", { status: 503 });
      };

      const failedAttempt = await service.inviteApprovedSuppliers(
        created.need.id,
        created.buyerAccessToken,
        [lead.id]
      );
      const failedSnapshot = repository.snapshot();
      const failedInvitation = failedSnapshot.supplierInvitations.find(
        (candidate) => candidate.supplierId === lead.id
      );
      assert.ok(failedInvitation);
      assert.equal(
        failedSnapshot.supplierLeads.find(
          (candidate) => candidate.id === lead.id
        )?.lifecycleStatus,
        "approved_for_outreach"
      );
      assert.equal(
        failedSnapshot.supplierLeads.find(
          (candidate) => candidate.id === lead.id
        )?.invitedAt,
        undefined
      );
      assert.equal(failedInvitation.status, "pending");
      assert.equal(
        failedSnapshot.outreachDeliveries.find(
          (delivery) =>
            delivery.invitationId === failedInvitation.id &&
            delivery.channel === "email"
        )?.deliveryStatus,
        "failed"
      );
      assert.equal(
        "token" in (failedAttempt.supplierInvitations[0] ?? {}),
        false
      );

      env.EMAIL_PROVIDER = "local_demo";
      const recoveredAttempt = await service.inviteApprovedSuppliers(
        created.need.id,
        created.buyerAccessToken,
        [lead.id]
      );
      const recoveredSnapshot = repository.snapshot();
      const recoveredInvitation = recoveredSnapshot.supplierInvitations.find(
        (candidate) => candidate.supplierId === lead.id
      );
      assert.ok(recoveredInvitation);
      assert.equal(providerCalls, 1);
      assert.equal(recoveredInvitation.id, failedInvitation.id);
      assert.equal(recoveredInvitation.token, failedInvitation.token);
      assert.equal(recoveredSnapshot.supplierInvitations.length, 1);
      assert.equal(
        recoveredSnapshot.supplierLeads.find(
          (candidate) => candidate.id === lead.id
        )?.lifecycleStatus,
        "invited"
      );
      assert.match(
        recoveredSnapshot.outreachDeliveries.find(
          (delivery) =>
            delivery.invitationId === recoveredInvitation.id &&
            delivery.channel === "email"
        )?.errorMessage ?? "",
        /Local demo only/
      );
      assert.equal(
        "token" in (recoveredAttempt.supplierInvitations[0] ?? {}),
        false
      );
    } finally {
      globalThis.fetch = originalFetch;
      Object.assign(env, {
        EMAIL_PROVIDER: originalEmailProvider,
        EMAIL_FROM: originalEmailFrom,
        RESEND_API_KEY: originalResendApiKey
      });
    }
  });

  test("expires stale claim state and persists a fresh private invitation", async (context) => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "veltact-v2-recovery-"));
    context.after(() => rmSync(directory, { recursive: true, force: true }));
    const filePath = path.join(directory, "state.json");
    const repository = new AtomicV2Repository(filePath);
    const service = new VeltactV2Service(repository);
    const { created, lead } = await createApprovedLead(service);

    await service.inviteApprovedSuppliers(
      created.need.id,
      created.buyerAccessToken,
      [lead.id]
    );
    const firstInvitation = repository
      .snapshot()
      .supplierInvitations.find((candidate) => candidate.supplierId === lead.id);
    assert.ok(firstInvitation);

    const expiredAt = new Date(Date.now() - 1_000).toISOString();
    await repository.mutate((draft) => {
      const invitation = draft.supplierInvitations.find(
        (candidate) => candidate.id === firstInvitation.id
      );
      const claim = draft.supplierClaims.find(
        (candidate) => candidate.invitationId === firstInvitation.id
      );
      if (!invitation || !claim) {
        throw new Error("Expected the first invitation and claim");
      }
      invitation.expiresAt = expiredAt;
      claim.expiresAt = expiredAt;
    });

    await assert.rejects(
      () => service.getWorkspace(created.need.id, "wrong-token"),
      (error: unknown) =>
        error instanceof V2ServiceError &&
        error.statusCode === 401
    );
    assert.equal(
      repository
        .snapshot()
        .supplierClaims.find(
          (candidate) => candidate.invitationId === firstInvitation.id
        )?.status,
      "pending"
    );
    await service.getWorkspace(created.need.id, created.buyerAccessToken);
    const expiredSnapshot = repository.snapshot();
    assert.equal(
      expiredSnapshot.supplierInvitations.find(
        (candidate) => candidate.id === firstInvitation.id
      )?.status,
      "expired"
    );
    assert.equal(
      expiredSnapshot.supplierClaims.find(
        (candidate) => candidate.invitationId === firstInvitation.id
      )?.status,
      "expired"
    );
    assert.equal(
      expiredSnapshot.supplierLeads.find(
        (candidate) => candidate.id === lead.id
      )?.lifecycleStatus,
      "approved_for_outreach"
    );

    const renewed = await service.inviteApprovedSuppliers(
      created.need.id,
      created.buyerAccessToken,
      [lead.id]
    );
    const renewedSnapshot = repository.snapshot();
    const renewedInvitation = renewedSnapshot.supplierInvitations
      .filter((candidate) => candidate.supplierId === lead.id)
      .find((candidate) => candidate.id !== firstInvitation.id);
    assert.ok(renewedInvitation);
    assert.notEqual(renewedInvitation.token, firstInvitation.token);
    assert.notEqual(renewedInvitation.responseUrl, firstInvitation.responseUrl);
    assert.equal(renewedSnapshot.supplierInvitations.length, 2);
    assert.equal(
      renewedSnapshot.supplierClaims.find(
        (candidate) => candidate.invitationId === renewedInvitation.id
      )?.status,
      "pending"
    );
    assert.equal(
      renewedSnapshot.supplierLeads.find(
        (candidate) => candidate.id === lead.id
      )?.lifecycleStatus,
      "invited"
    );
    assert.equal(renewed.supplierInvitations.length, 1);
    assert.equal(renewed.supplierInvitations[0]?.id, renewedInvitation.id);
    assert.ok(
      renewed.outreachDeliveries.every(
        (delivery) => delivery.invitationId === renewedInvitation.id
      )
    );
    assert.equal(
      "token" in (renewed.supplierInvitations[0] ?? {}),
      false
    );

    await assert.rejects(
      () => service.openSupplierClaim(firstInvitation.token),
      (error: unknown) =>
        error instanceof V2ServiceError &&
        error.statusCode === 409 &&
        /expired/.test(error.message)
    );
    const opened = await service.openSupplierClaim(renewedInvitation.token);
    assert.equal(opened.claim.status, "pending");

    await repository.flush();
    const reloaded = new AtomicV2Repository(filePath).snapshot();
    assert.equal(
      reloaded.supplierInvitations.find(
        (candidate) => candidate.id === firstInvitation.id
      )?.status,
      "expired"
    );
    assert.equal(
      reloaded.supplierInvitations.find(
        (candidate) => candidate.id === renewedInvitation.id
      )?.status,
      "opened"
    );
    assert.equal(
      reloaded.supplierClaims.find(
        (candidate) => candidate.invitationId === firstInvitation.id
      )?.status,
      "expired"
    );
    assert.equal(
      reloaded.supplierClaims.find(
        (candidate) => candidate.invitationId === renewedInvitation.id
      )?.status,
      "pending"
    );
  });

  test("renews an expired claimed profile without reusing its private token", async () => {
    const repository = new AtomicV2Repository(undefined);
    const service = new VeltactV2Service(repository);
    const { created, lead } = await createApprovedLead(service);

    await service.inviteApprovedSuppliers(
      created.need.id,
      created.buyerAccessToken,
      [lead.id]
    );
    const originalInvitation = repository
      .snapshot()
      .supplierInvitations.find((candidate) => candidate.supplierId === lead.id);
    assert.ok(originalInvitation);
    await service.openSupplierClaim(originalInvitation.token);
    await service.claimSupplierInvitation(originalInvitation.token, {
      claimantName: "Sam Integrator",
      claimantEmail: "sam@example.com"
    });
    await service.submitSupplierProfile(originalInvitation.token, {
      companyName: lead.companyName,
      website: lead.website,
      contactName: "Sam Integrator",
      contactEmail: "sam@example.com",
      location: lead.location,
      categories: ["Industrial automation"],
      industries: ["Manufacturing"],
      serviceRegions: ["NSW"],
      capabilities: lead.capabilities,
      certifications: [],
      profileSummary:
        "Supplier-approved industrial controls recovery profile."
    });

    const expiredAt = new Date(Date.now() - 1_000).toISOString();
    await repository.mutate((draft) => {
      const invitation = draft.supplierInvitations.find(
        (candidate) => candidate.id === originalInvitation.id
      );
      const claim = draft.supplierClaims.find(
        (candidate) => candidate.invitationId === originalInvitation.id
      );
      if (!invitation || !claim) {
        throw new Error("Expected the claimed invitation");
      }
      invitation.expiresAt = expiredAt;
      claim.expiresAt = expiredAt;
    });
    await service.getWorkspace(created.need.id, created.buyerAccessToken);
    assert.equal(
      repository
        .snapshot()
        .supplierLeads.find((candidate) => candidate.id === lead.id)
        ?.lifecycleStatus,
      "approved_for_outreach"
    );

    await service.inviteApprovedSuppliers(
      created.need.id,
      created.buyerAccessToken,
      [lead.id]
    );
    const renewedSnapshot = repository.snapshot();
    const renewedInvitation = renewedSnapshot.supplierInvitations.find(
      (candidate) =>
        candidate.supplierId === lead.id &&
        candidate.id !== originalInvitation.id
    );
    assert.ok(renewedInvitation);
    assert.notEqual(renewedInvitation.token, originalInvitation.token);
    assert.equal(
      renewedSnapshot.supplierClaims.find(
        (candidate) => candidate.invitationId === renewedInvitation.id
      )?.status,
      "claimed"
    );
    assert.equal(
      renewedSnapshot.supplierLeads.find(
        (candidate) => candidate.id === lead.id
      )?.lifecycleStatus,
      "supplier_profile_approved"
    );

    const response = await service.submitSupplierResponse(
      renewedInvitation.token,
      {
        decision: "can_help",
        availability: "Within four hours",
        indicativePrice: { amount: 650_000, currency: "AUD" },
        proposedApproach:
          "Review evidence and perform a controlled, authorised recovery.",
        relevantExperience: "Comparable packaging-line controls recovery.",
        assumptions: [],
        conditions: []
      }
    );
    assert.equal(response.decision, "can_help");
    await assert.rejects(
      () => service.openSupplierClaim(originalInvitation.token),
      (error: unknown) =>
        error instanceof V2ServiceError &&
        error.statusCode === 409
    );
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

async function createApprovedLead(service: VeltactV2Service) {
  const created = await service.createNeed({
    buyerEmail: "engineer@example.com",
    buyerName: "Alex Morgan",
    companyName: "Example Factory",
    profile: plcProfile()
  });
  const research = await service.researchNeed(
    created.need.id,
    created.buyerAccessToken
  );
  await service.decideSolution(
    created.need.id,
    created.buyerAccessToken,
    {
      decision: "hybrid",
      selectedApproachIds: research.researchResult.approaches.map(
        (approach) => approach.id
      )
    }
  );
  const discovery = await service.discoverNeedSuppliers(
    created.need.id,
    created.buyerAccessToken
  );
  const lead = discovery.supplierLeads[0];
  assert.ok(lead);
  await service.approveSupplierLeads(
    created.need.id,
    created.buyerAccessToken,
    [lead.id]
  );
  return { created, lead };
}

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
