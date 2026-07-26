import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  CommitmentPaymentError,
  CommitmentPaymentService,
  createLocalDemoPaymentEvidence,
  type AuthoritativePinchEvidence,
  type CommitmentPaymentContext,
  type CommitmentPaymentPersistenceAdapter
} from "./commitmentPaymentService.js";
import type {
  AuthoritativePaymentResult,
  CreateHostedPaymentLinkInput,
  HostedPaymentLink,
  PaymentProvider
} from "./paymentProvider.js";

describe("CommitmentPaymentService", () => {
  test("reuses an existing usable Payment Link without provider calls", async () => {
    const context = commitmentContext();
    context.existingPaymentLink = {
      ...hostedPaymentLink("existing"),
      paymentStatus: "awaiting_payment"
    };
    const persistence = new MemoryCommitmentAdapter(context);
    const provider = new FakePaymentProvider();
    const service = new CommitmentPaymentService(persistence, provider);

    const first = await service.createOrReuseHostedPaymentLink({
      engagementId: context.engagementId,
      buyerAccessToken: "buyer-token",
      returnUrl: "https://veltact.example/api/pinch/return/eng-robotics"
    });
    const second = await service.createOrReuseHostedPaymentLink({
      engagementId: context.engagementId,
      buyerAccessToken: "buyer-token",
      returnUrl: "https://veltact.example/api/pinch/return/eng-robotics"
    });

    assert.equal(first.reused, true);
    assert.equal(second.reused, true);
    assert.equal(first.paymentLink.paymentLinkId, "plk_existing");
    assert.equal(provider.createCalls, 0);
    assert.equal(persistence.saveCalls, 0);
  });

  test("coalesces concurrent creation and includes commitment metadata", async () => {
    const context = commitmentContext();
    const persistence = new MemoryCommitmentAdapter(context);
    const provider = new FakePaymentProvider();
    provider.createDelay = new Promise<void>((resolve) => {
      provider.releaseCreate = resolve;
    });
    const service = new CommitmentPaymentService(persistence, provider);
    const request = {
      engagementId: context.engagementId,
      buyerAccessToken: "buyer-token",
      returnUrl: "https://veltact.example/api/pinch/return/eng-robotics"
    };

    const first = service.createOrReuseHostedPaymentLink(request);
    const second = service.createOrReuseHostedPaymentLink(request);
    await new Promise<void>((resolve) => setImmediate(resolve));
    provider.releaseCreate?.();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    assert.equal(provider.createCalls, 1);
    assert.equal(persistence.saveCalls, 1);
    assert.equal(firstResult.paymentLink.paymentLinkId, secondResult.paymentLink.paymentLinkId);
    assert.equal(provider.lastCreateInput?.amount, 750_000);
    assert.equal(
      provider.lastCreateInput?.metadata?.milestoneId,
      "eng-robotics-m1-site-assessment"
    );
    assert.equal(
      provider.lastCreateInput?.metadata?.commitmentType,
      "commercial_commitment"
    );
    assert.match(provider.lastCreateInput?.description ?? "", /commitment/i);
    assert.doesNotMatch(provider.lastCreateInput?.description ?? "", /escrow/i);
  });

  test("does not persist or fake a link when the provider fails", async () => {
    const persistence = new MemoryCommitmentAdapter(commitmentContext());
    const provider = new FakePaymentProvider();
    provider.createError = new Error("provider unavailable");
    const service = new CommitmentPaymentService(persistence, provider);

    await assert.rejects(
      service.createOrReuseHostedPaymentLink({
        engagementId: "eng-robotics",
        buyerAccessToken: "buyer-token",
        returnUrl: "https://veltact.example/api/pinch/return/eng-robotics"
      }),
      /provider unavailable/
    );
    assert.equal(persistence.saveCalls, 0);
    assert.equal(persistence.context.existingPaymentLink, undefined);
  });

  test("secures only through explicit approved provider reconciliation", async () => {
    const context = commitmentContext();
    context.existingPaymentLink = {
      ...hostedPaymentLink("reconcile"),
      paymentStatus: "awaiting_payment"
    };
    const persistence = new MemoryCommitmentAdapter(context);
    const provider = new FakePaymentProvider();
    provider.approvedPayment = {
      provider: "pinch",
      paymentId: "pmt_approved",
      status: "approved"
    };
    const service = new CommitmentPaymentService(persistence, provider);

    const first = await service.reconcileApprovedPayment({
      engagementId: context.engagementId,
      buyerAccessToken: "buyer-token"
    });
    const replay = await service.reconcileApprovedPayment({
      engagementId: context.engagementId,
      buyerAccessToken: "buyer-token"
    });

    assert.deepEqual(first, {
      reconciled: true,
      duplicate: false,
      supplierSecured: true
    });
    assert.deepEqual(replay, {
      reconciled: true,
      duplicate: true,
      supplierSecured: true
    });
    assert.equal(persistence.evidence[0]?.source, "pinch_reconciliation");
    assert.equal(persistence.evidence[0]?.providerStatus, "approved");
  });

  test("keeps local demo evidence explicit, non-authoritative, and out of production", () => {
    assert.deepEqual(createLocalDemoPaymentEvidence("development"), {
      provider: "local_demo",
      source: "local_demo",
      authoritative: false,
      label: "Local demo only - not a Pinch transaction"
    });
    assert.throws(
      () => createLocalDemoPaymentEvidence("production"),
      (error: unknown) =>
        error instanceof CommitmentPaymentError &&
        error.statusCode === 404
    );
  });
});

class MemoryCommitmentAdapter
  implements CommitmentPaymentPersistenceAdapter
{
  saveCalls = 0;
  readonly evidence: AuthoritativePinchEvidence[] = [];
  private readonly eventIds = new Set<string>();

  constructor(readonly context: CommitmentPaymentContext) {}

  async findCommitment(engagementId: string) {
    return engagementId === this.context.engagementId
      ? this.context
      : undefined;
  }

  async isBuyerAuthorized(
    _needProfileId: string,
    buyerAccessToken: string | undefined
  ) {
    return buyerAccessToken === "buyer-token";
  }

  async saveHostedPaymentLink(
    _engagementId: string,
    paymentLink: HostedPaymentLink
  ) {
    this.saveCalls += 1;
    this.context.existingPaymentLink = {
      ...paymentLink,
      paymentStatus: "awaiting_payment"
    };
  }

  async recordAuthoritativePayment(evidence: AuthoritativePinchEvidence) {
    const duplicate = this.eventIds.has(evidence.eventId);
    if (!duplicate) {
      this.eventIds.add(evidence.eventId);
      this.evidence.push(evidence);
    }
    return {
      duplicate,
      supplierSecured: true
    };
  }
}

class FakePaymentProvider implements PaymentProvider {
  createCalls = 0;
  createError: Error | undefined;
  createDelay: Promise<void> | undefined;
  releaseCreate: (() => void) | undefined;
  lastCreateInput: CreateHostedPaymentLinkInput | undefined;
  approvedPayment: AuthoritativePaymentResult | undefined;

  async createHostedPaymentLink(input: CreateHostedPaymentLinkInput) {
    this.createCalls += 1;
    this.lastCreateInput = input;
    await this.createDelay;
    if (this.createError) {
      throw this.createError;
    }
    return hostedPaymentLink(String(this.createCalls));
  }

  async getApprovedPaymentForLink() {
    return this.approvedPayment;
  }
}

function commitmentContext(): CommitmentPaymentContext {
  return {
    engagementId: "eng-robotics",
    needProfileId: "need-robotics",
    supplierId: "supplier-robotics",
    buyerEmail: "buyer@example.com",
    buyerName: "Western Sydney Factory",
    commitment: {
      milestoneId: "eng-robotics-m1-site-assessment",
      title: "Site assessment",
      amount: {
        amount: 750_000,
        currency: "AUD"
      }
    },
    paymentStatus: "not_started"
  };
}

function hostedPaymentLink(suffix: string): HostedPaymentLink {
  return {
    provider: "pinch",
    payerId: `pyr_${suffix}`,
    paymentLinkId: `plk_${suffix}`,
    hostedCheckoutUrl: `https://pay.getpinch.com.au/pay/plk_${suffix}`
  };
}
