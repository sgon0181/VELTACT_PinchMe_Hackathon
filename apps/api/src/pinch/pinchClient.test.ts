import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import {
  assertPinchSandboxConfiguration,
  PinchApiError,
  PinchClient
} from "./pinchClient.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("PinchClient", () => {
  test("authenticates, creates a payer, and creates a metadata-rich hosted link", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      if (url === "https://pinch.test/auth") {
        return jsonResponse({
          access_token: "sandbox-access-token",
          expires_in: 3600
        });
      }
      if (url === "https://pinch.test/api/payers") {
        return jsonResponse({ id: "pyr_sandbox" });
      }
      if (url === "https://pinch.test/api/payment-links") {
        return jsonResponse({
          id: "plk_sandbox",
          url: "https://pay.getpinch.com.au/pay/plk_sandbox"
        });
      }
      throw new Error(`Unexpected test URL: ${url}`);
    }) as typeof fetch;

    const result = await new PinchClient().createHostedPaymentLink({
      engagementId: "eng-123",
      needId: "need-123",
      supplierId: "supplier-123",
      buyerEmail: "buyer@example.com",
      buyerName: "Factory Buyer",
      amount: 750_000,
      description: "Veltact Site assessment commitment",
      returnUrl: "https://veltact.example/api/pinch/return/eng-123",
      metadata: {
        milestoneId: "eng-123-m1-site-assessment"
      }
    });

    assert.deepEqual(result, {
      provider: "pinch",
      payerId: "pyr_sandbox",
      paymentLinkId: "plk_sandbox",
      hostedCheckoutUrl: "https://pay.getpinch.com.au/pay/plk_sandbox"
    });
    assert.equal(requests.length, 3);
    const authHeaders = requests[0]?.init?.headers as
      | Record<string, string>
      | undefined;
    assert.match(authHeaders?.Authorization ?? "", /^Basic /);
    const payerBody = JSON.parse(String(requests[1]?.init?.body)) as Record<
      string,
      unknown
    >;
    assert.equal(payerBody.emailAddress, "buyer@example.com");
    const linkBody = JSON.parse(String(requests[2]?.init?.body)) as Record<
      string,
      unknown
    >;
    assert.equal(linkBody.payerId, "pyr_sandbox");
    assert.equal(linkBody.amount, 750_000);
    assert.equal(
      linkBody.returnUrl,
      "https://veltact.example/api/pinch/return/eng-123"
    );
    assert.deepEqual(JSON.parse(String(linkBody.metadata)), {
      engagementId: "eng-123",
      needId: "need-123",
      supplierId: "supplier-123",
      milestoneId: "eng-123-m1-site-assessment"
    });
  });

  test("maps an approved sandbox Payment Link payment for reconciliation", async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input);
      if (url === "https://pinch.test/auth") {
        return jsonResponse({ access_token: "sandbox-access-token" });
      }
      return jsonResponse({
        id: "plk_sandbox",
        payments: [
          { id: "pmt_pending", status: "processing" },
          { id: "pmt_approved", status: "approved" }
        ]
      });
    }) as typeof fetch;

    const approved = await new PinchClient().getApprovedPaymentForLink(
      "plk_sandbox"
    );
    assert.deepEqual(approved, {
      provider: "pinch",
      paymentId: "pmt_approved",
      status: "approved"
    });
  });

  test("does not fabricate a payer or link when Pinch rejects the request", async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input);
      if (url === "https://pinch.test/auth") {
        return jsonResponse({ access_token: "sandbox-access-token" });
      }
      return jsonResponse(
        { code: "payer_validation_failed" },
        { status: 400 }
      );
    }) as typeof fetch;

    await assert.rejects(
      new PinchClient().createHostedPaymentLink({
        engagementId: "eng-invalid",
        needId: "need-invalid",
        supplierId: "supplier-invalid",
        buyerEmail: "buyer@example.com",
        amount: 750_000,
        description: "Veltact Site assessment commitment",
        returnUrl: "https://veltact.example/api/pinch/return/eng-invalid"
      }),
      (error: unknown) =>
        error instanceof PinchApiError &&
        error.upstreamStatus === 400 &&
        error.upstreamCode === "payer_validation_failed"
    );
  });

  test("refuses obvious live Pinch configuration", () => {
    assert.throws(
      () =>
        assertPinchSandboxConfiguration({
          apiBaseUrl: "https://api.getpinch.com.au/",
          secretKey: "test-secret"
        }),
      /Live Pinch configuration is not permitted/
    );
    assert.throws(
      () =>
        assertPinchSandboxConfiguration({
          apiBaseUrl: "https://payments-proxy.example/api",
          secretKey: "test-secret"
        }),
      /Live Pinch configuration is not permitted/
    );
    assert.throws(
      () =>
        assertPinchSandboxConfiguration({
          apiBaseUrl: "https://api.getpinch.com.au/test",
          secretKey: ["sk", "live", "not-a-real-key"].join("_")
        }),
      /Live Pinch configuration is not permitted/
    );
    assert.doesNotThrow(() =>
      assertPinchSandboxConfiguration({
        apiBaseUrl: "https://api.getpinch.com.au/test",
        secretKey: "sk_test_not-a-real-key"
      })
    );
  });
});

function jsonResponse(
  body: unknown,
  init: ResponseInit = { status: 200 }
) {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json"
    },
    ...init
  });
}
