import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { env } from "../env.js";
import {
  approveSupplierOutreachForNeed,
  claimSupplierInvitation,
  createEngagement,
  createNeed,
  getEngagement,
  recordAuthoritativePinchPayment,
  recordLocalDemoPayment,
  reloadMarketplaceStore,
  resetMarketplaceStore,
  saveSupplierCommitmentNotification,
  submitSupplierResponse
} from "../marketplace/store.js";
import {
  getCommitmentNotification,
  notifyCommitmentConfirmed,
  resetCommitmentNotificationsForTests
} from "./commitmentNotification.js";

const originalFetch = globalThis.fetch;
let originalEmailEnv: {
  NODE_ENV: typeof env.NODE_ENV;
  PUBLIC_BASE_URL: typeof env.PUBLIC_BASE_URL;
  EMAIL_PROVIDER: typeof env.EMAIL_PROVIDER;
  EMAIL_FROM: typeof env.EMAIL_FROM;
  RESEND_API_KEY: typeof env.RESEND_API_KEY;
  SUPPLIER_OUTREACH_EMAIL_TO: typeof env.SUPPLIER_OUTREACH_EMAIL_TO;
  MARKETPLACE_DATA_FILE: typeof env.MARKETPLACE_DATA_FILE;
};

beforeEach(() => {
  originalEmailEnv = {
    NODE_ENV: env.NODE_ENV,
    PUBLIC_BASE_URL: env.PUBLIC_BASE_URL,
    EMAIL_PROVIDER: env.EMAIL_PROVIDER,
    EMAIL_FROM: env.EMAIL_FROM,
    RESEND_API_KEY: env.RESEND_API_KEY,
    SUPPLIER_OUTREACH_EMAIL_TO: env.SUPPLIER_OUTREACH_EMAIL_TO,
    MARKETPLACE_DATA_FILE: env.MARKETPLACE_DATA_FILE
  };
  Object.assign(env, {
    NODE_ENV: "test",
    PUBLIC_BASE_URL: "https://demo.veltact.test",
    SUPPLIER_OUTREACH_EMAIL_TO: undefined
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetCommitmentNotificationsForTests();
  env.MARKETPLACE_DATA_FILE = undefined;
  resetMarketplaceStore();
  Object.assign(env, originalEmailEnv);
});

describe("commitment-confirmed supplier email", { concurrency: false }, () => {
  test("sends once after authoritative Pinch evidence and remains idempotent", async () => {
    const engagementId = securedEngagement("pinch");
    Object.assign(env, {
      EMAIL_PROVIDER: "resend",
      EMAIL_FROM: "Veltact <opportunities@veltact.test>",
      RESEND_API_KEY: "re_test_key"
    });
    const requests: RequestInit[] = [];
    globalThis.fetch = async (_input, init) => {
      requests.push(init ?? {});
      return new Response(JSON.stringify({ id: "email-123" }), {
        status: 200
      });
    };
    const updates: string[] = [];

    const [first, duplicate] = await Promise.all([
      notifyCommitmentConfirmed(engagementId, (notification) => {
        updates.push(notification.deliveryStatus);
      }),
      notifyCommitmentConfirmed(engagementId)
    ]);
    const repeated = await notifyCommitmentConfirmed(engagementId);

    assert.equal(first?.deliveryStatus, "sent");
    assert.equal(duplicate?.id, first?.id);
    assert.equal(repeated?.id, first?.id);
    assert.deepEqual(updates, ["queued", "sent"]);
    assert.equal(requests.length, 1);
    const headers = new Headers(requests[0].headers);
    assert.match(
      headers.get("idempotency-key") ?? "",
      /^veltact-commitment-/
    );
    const body = JSON.parse(String(requests[0].body));
    assert.match(body.text, /authoritative backend payment evidence/i);
    assert.doesNotMatch(
      body.text,
      /supplier has been paid|payout complete/i
    );
    assert.equal(
      getCommitmentNotification(engagementId)?.deliveryStatus,
      "sent"
    );
  });

  test("does not notify for non-authoritative local demo evidence", async () => {
    const engagementId = securedEngagement("local_demo");
    let providerCalled = false;
    globalThis.fetch = async () => {
      providerCalled = true;
      return new Response(null, { status: 200 });
    };

    assert.equal(
      await notifyCommitmentConfirmed(engagementId),
      undefined
    );
    assert.equal(providerCalled, false);
    assert.equal(getCommitmentNotification(engagementId), undefined);
  });

  test("reports missing email configuration as not sent without a provider call", async () => {
    const engagementId = securedEngagement("pinch");
    Object.assign(env, {
      EMAIL_PROVIDER: "resend",
      EMAIL_FROM: "Veltact <opportunities@veltact.test>",
      RESEND_API_KEY: undefined
    });
    let providerCalled = false;
    globalThis.fetch = async () => {
      providerCalled = true;
      return new Response(null, { status: 200 });
    };

    const notification = await notifyCommitmentConfirmed(engagementId);

    assert.equal(notification?.deliveryStatus, "not_sent");
    assert.match(notification?.errorMessage ?? "", /RESEND_API_KEY/);
    assert.equal(providerCalled, false);
  });

  test("keeps authoritative commitment email explicitly unsent in local demo mode", async () => {
    const engagementId = securedEngagement("pinch");
    Object.assign(env, {
      NODE_ENV: "test",
      EMAIL_PROVIDER: "local_demo"
    });
    let providerCalled = false;
    globalThis.fetch = async () => {
      providerCalled = true;
      return new Response(null, { status: 200 });
    };

    const notification = await notifyCommitmentConfirmed(engagementId);

    assert.equal(notification?.deliveryStatus, "not_sent");
    assert.equal(notification?.sentAt, undefined);
    assert.match(notification?.errorMessage ?? "", /Local demo only/);
    assert.equal(providerCalled, false);
  });

  test("routes commitment email through the configured staging recipient override", async () => {
    const engagementId = securedEngagement("pinch");
    Object.assign(env, {
      EMAIL_PROVIDER: "resend",
      EMAIL_FROM: "Veltact <opportunities@veltact.test>",
      RESEND_API_KEY: "re_test_key",
      SUPPLIER_OUTREACH_EMAIL_TO: "staging-inbox@example.com"
    });
    let requestBody: Record<string, unknown> | undefined;
    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: "email-123" }), {
        status: 200
      });
    };

    const notification = await notifyCommitmentConfirmed(engagementId);

    assert.equal(notification?.deliveryStatus, "sent");
    assert.equal(notification?.destination, "staging-inbox@example.com");
    assert.deepEqual(requestBody?.to, ["staging-inbox@example.com"]);
  });

  test("persists sent state and suppresses a duplicate after store reload", async () => {
    const directory = mkdtempSync(
      path.join(os.tmpdir(), "veltact-commitment-")
    );
    const filePath = path.join(directory, "marketplace.json");
    Object.assign(env, {
      MARKETPLACE_DATA_FILE: filePath,
      EMAIL_PROVIDER: "resend",
      EMAIL_FROM: "Veltact <opportunities@veltact.test>",
      RESEND_API_KEY: "re_test_key"
    });
    let providerCalls = 0;
    globalThis.fetch = async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({ id: "email-123" }), {
        status: 200
      });
    };

    try {
      const engagementId = securedEngagement("pinch");
      const first = await notifyCommitmentConfirmed(engagementId);
      assert.equal(first?.deliveryStatus, "sent");
      assert.equal(providerCalls, 1);
      const persisted = JSON.parse(readFileSync(filePath, "utf8"));
      assert.equal(
        persisted.commitmentNotifications[0].deliveryStatus,
        "sent"
      );

      assert.equal(reloadMarketplaceStore(filePath), true);
      resetCommitmentNotificationsForTests();
      const recovered = await notifyCommitmentConfirmed(engagementId);

      assert.equal(recovered?.deliveryStatus, "sent");
      assert.equal(providerCalls, 1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("does not replay a persisted queued notification after restart", async () => {
    const directory = mkdtempSync(
      path.join(os.tmpdir(), "veltact-commitment-queued-")
    );
    const filePath = path.join(directory, "marketplace.json");
    Object.assign(env, {
      MARKETPLACE_DATA_FILE: filePath,
      EMAIL_PROVIDER: "resend",
      EMAIL_FROM: "Veltact <opportunities@veltact.test>",
      RESEND_API_KEY: "re_test_key"
    });

    try {
      const engagementId = securedEngagement("pinch");
      const engagement = getEngagement(engagementId);
      assert.ok(engagement);
      const now = new Date().toISOString();
      saveSupplierCommitmentNotification({
        id: `commitment-notification-${engagementId}`,
        engagementId,
        supplierId: engagement.supplierId,
        notificationType: "commitment_confirmed",
        channel: "email",
        destination: "supplier@example.com",
        deliveryStatus: "queued",
        createdAt: now,
        updatedAt: now
      });
      assert.equal(reloadMarketplaceStore(filePath), true);
      resetCommitmentNotificationsForTests();
      let providerCalled = false;
      globalThis.fetch = async () => {
        providerCalled = true;
        return new Response(JSON.stringify({ id: "email-123" }), {
          status: 200
        });
      };

      const recovered = await notifyCommitmentConfirmed(engagementId);

      assert.equal(recovered?.deliveryStatus, "queued");
      assert.equal(providerCalled, false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function securedEngagement(evidence: "pinch" | "local_demo") {
  const need = createNeed({
    buyerEmail: "buyer@example.com",
    profile: {
      title: "Packaging conveyor PLC recovery",
      description: "Recover the stopped Siemens PLC packaging conveyor.",
      category: "Industrial automation",
      industry: "Food manufacturing",
      location: "Western Sydney, NSW",
      urgencyDays: 1,
      budgetAud: 4200,
      requiredCapabilities: ["PLC diagnostics"]
    }
  });
  assert.ok(approveSupplierOutreachForNeed(need.id));
  const invitation = need.invitations[0];
  const claim = claimSupplierInvitation(invitation.token, {
    claimantName: "Supplier Contact",
    claimantEmail: "supplier@example.com"
  });
  assert.equal(claim.status, "claimed");
  const submitted = submitSupplierResponse(invitation.token, {
    canHelp: true,
    earliestAvailability: "2026-07-30",
    indicativePriceAud: 4200,
    relevantExperience: "Siemens PLC conveyor recovery.",
    proposedApproach: "Review evidence then attend site.",
    assumptions: ["Current PLC backup is available."],
    conditions: ["Four-hour minimum callout."]
  });
  assert.equal(submitted.status, "submitted");
  if (submitted.status !== "submitted") {
    throw new Error("Supplier response was not submitted.");
  }
  const created = createEngagement({
    needId: need.id,
    supplierResponseId: submitted.supplierResponse.id
  });
  assert.ok(created.status === "created" || created.status === "existing");

  if (evidence === "pinch") {
    recordAuthoritativePinchPayment({
      eventId: `pinch-event-${created.engagement.id}`,
      eventType: "payment-api-reconciliation",
      engagementId: created.engagement.id,
      paymentId: "pinch-payment-123",
      payload: { status: "approved" }
    });
  } else {
    recordLocalDemoPayment({
      eventId: `local-demo-event-${created.engagement.id}`,
      eventType: "local-demo-payment",
      engagementId: created.engagement.id,
      paymentId: "local-demo-payment-123",
      payload: { status: "approved" }
    });
  }
  return created.engagement.id;
}
