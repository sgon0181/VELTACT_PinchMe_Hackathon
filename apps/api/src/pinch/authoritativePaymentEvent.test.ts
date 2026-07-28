import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AuthoritativePinchEvidence } from "../payments/commitmentPaymentService.js";
import {
  extractApprovedPinchPaymentEvent,
  matchesExpectedPinchCommitment,
  PinchWebhookPaymentProcessor,
  type PinchWebhookAuthorityAdapter
} from "./authoritativePaymentEvent.js";

describe("authoritative Pinch webhook payments", () => {
  test("accepts only approved Pinch payment events carrying engagement metadata", () => {
    assert.deepEqual(
      extractApprovedPinchPaymentEvent(approvedWebhook()),
      {
        eventId: "evt_approved",
        eventType: "realtime-payment",
        engagementId: "eng-123",
        needProfileId: "need-123",
        supplierId: "supplier-123",
        milestoneId: "eng-123-m1-site-assessment-scoping-visit",
        paymentId: "pmt_123",
        amountMinor: 750_000,
        currency: "AUD",
        status: "approved"
      }
    );
    assert.equal(
      extractApprovedPinchPaymentEvent(
        approvedWebhook({ Status: "dishonoured" })
      ),
      undefined
    );
    assert.equal(
      extractApprovedPinchPaymentEvent(
        approvedWebhook({ Metadata: undefined })
      ),
      undefined
    );
    assert.equal(
      extractApprovedPinchPaymentEvent({
        ...approvedWebhook(),
        Type: "transfer"
      }),
      undefined
    );
  });

  test("matches the signed commitment metadata and amount to canonical state", () => {
    const event = extractApprovedPinchPaymentEvent(approvedWebhook());
    assert(event);
    const expected = {
      engagementId: "eng-123",
      needProfileId: "need-123",
      supplierId: "supplier-123",
      milestoneId: "eng-123-m1-site-assessment-scoping-visit",
      amountMinor: 750_000,
      currency: "AUD"
    };

    assert.equal(matchesExpectedPinchCommitment(event, expected), true);
    assert.equal(
      matchesExpectedPinchCommitment(event, {
        ...expected,
        supplierId: "supplier-other"
      }),
      false
    );
    assert.equal(
      matchesExpectedPinchCommitment(event, {
        ...expected,
        amountMinor: 1
      }),
      false
    );
  });

  test("does not treat an observed Payment Link attempt as payment authority", () => {
    assert.equal(
      extractApprovedPinchPaymentEvent({
        ...approvedWebhook(),
        Type: "payment-link-attempted"
      }),
      undefined
    );
  });

  test("accepts documented metadata arrays and rejects contradictory commitment evidence", () => {
    const metadata = [
      {
        engagementId: "eng-123",
        needId: "need-123",
        supplierId: "supplier-123"
      },
      {
        milestoneId: "eng-123-m1-site-assessment-scoping-visit",
        commitmentType: "commercial_commitment",
        commitmentAmountMinor: "750000",
        commitmentCurrency: "AUD"
      },
      { providerAddedField: true }
    ];
    assert(
      extractApprovedPinchPaymentEvent(
        approvedWebhook({ Metadata: JSON.stringify(metadata) })
      )
    );
    assert.equal(
      extractApprovedPinchPaymentEvent(approvedWebhook({ Amount: 1 })),
      undefined
    );
  });

  test("passes verified audit evidence once and reports repository replay", async () => {
    const adapter = new ReplayAwareAuthorityAdapter();
    const processor = new PinchWebhookPaymentProcessor(adapter);
    const payload = approvedWebhook();

    const first = await processor.processVerifiedPayload(payload);
    const replay = await processor.processVerifiedPayload(payload);

    assert.deepEqual(first, {
      authoritative: true,
      processed: true,
      duplicate: false,
      supplierSecured: true
    });
    assert.deepEqual(replay, {
      authoritative: true,
      processed: false,
      duplicate: true,
      supplierSecured: true
    });
    assert.equal(adapter.evidence.length, 1);
    assert.equal(adapter.evidence[0]?.source, "pinch_webhook");
    assert.equal(adapter.evidence[0]?.payload, payload);
  });

  test("does not call authority storage for pending or unrelated events", async () => {
    const adapter = new ReplayAwareAuthorityAdapter();
    const processor = new PinchWebhookPaymentProcessor(adapter);
    const result = await processor.processVerifiedPayload(
      approvedWebhook({ Status: "processing" })
    );

    assert.deepEqual(result, {
      authoritative: false,
      processed: false,
      duplicate: false,
      supplierSecured: false
    });
    assert.equal(adapter.evidence.length, 0);
  });
});

class ReplayAwareAuthorityAdapter implements PinchWebhookAuthorityAdapter {
  readonly evidence: AuthoritativePinchEvidence[] = [];
  private readonly eventIds = new Set<string>();

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

function approvedWebhook(
  paymentOverrides: Record<string, unknown> = {}
) {
  return {
    Id: "evt_approved",
    Type: "realtime-payment",
    EventDate: "2026-07-26T00:00:00.000Z",
    Data: {
      Payment: {
        Id: "pmt_123",
        Amount: 750_000,
        Currency: "AUD",
        Status: "approved",
        Metadata: JSON.stringify({
          engagementId: "eng-123",
          needId: "need-123",
          supplierId: "supplier-123",
          milestoneId: "eng-123-m1-site-assessment-scoping-visit",
          commitmentType: "commercial_commitment",
          commitmentAmountMinor: "750000",
          commitmentCurrency: "AUD"
        }),
        ...paymentOverrides
      }
    }
  };
}
