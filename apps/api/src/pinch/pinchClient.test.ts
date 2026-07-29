import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import {
  assertPinchHostedCheckoutUrl,
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
      currency: "AUD",
      description: "Veltact Site Assessment / Scoping Visit commitment",
      returnUrl: "https://veltact.example/api/pinch/return/eng-123",
      metadata: {
        engagementId: "eng-spoofed",
        milestoneId: "eng-123-m1-site-assessment-scoping-visit",
        commitmentType: "commercial_commitment",
        commitmentAmountMinor: "750000",
        commitmentCurrency: "AUD"
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
    assert.equal(payerBody.firstName, "Factory Buyer");
    const authBody = new URLSearchParams(
      String(requests[0]?.init?.body)
    );
    assert.equal(authBody.get("grant_type"), "client_credentials");
    assert.equal(authBody.get("scope"), "api1");
    const linkBody = JSON.parse(String(requests[2]?.init?.body)) as Record<
      string,
      unknown
    >;
    assert.equal(linkBody.payerId, "pyr_sandbox");
    assert.equal(linkBody.amount, 750_000);
    assert.equal(linkBody.currency, "AUD");
    assert.equal(
      linkBody.returnUrl,
      "https://veltact.example/api/pinch/return/eng-123"
    );
    assert.deepEqual(
      JSON.parse(String(linkBody.metadata)),
      commitmentMetadata()
    );
  });

  test("reconciles through the documented Payment Link payer relationship", async () => {
    const requests: string[] = [];
    globalThis.fetch = (async (input) => {
      const url = String(input);
      requests.push(url);
      if (url === "https://pinch.test/auth") {
        return jsonResponse({ access_token: "sandbox-access-token" });
      }
      if (url === "https://pinch.test/api/payment-links/plk_sandbox") {
        return jsonResponse({
          id: "plk_sandbox",
          amountInCents: 750_000,
          currency: "AUD",
          metadata: JSON.stringify(commitmentMetadata()),
          payer: {
            id: "pyr_sandbox"
          }
        });
      }
      if (url === "https://pinch.test/api/payments/payer/pyr_sandbox") {
        return jsonResponse([
          {
            id: "pmt_pending",
            payer: { id: "pyr_sandbox" },
            amount: 750_000,
            currency: "AUD",
            status: "processing",
            metadata: JSON.stringify(commitmentMetadata())
          },
          {
            id: "pmt_other_commitment",
            payer: { id: "pyr_sandbox" },
            amount: 750_000,
            currency: "AUD",
            status: "approved",
            metadata: JSON.stringify({
              ...commitmentMetadata(),
              supplierId: "supplier-other"
            })
          },
          {
            id: "pmt_approved",
            payer: { id: "pyr_sandbox" },
            amount: 750_000,
            currency: "AUD",
            status: "approved",
            metadata: JSON.stringify(commitmentMetadata())
          }
        ]);
      }
      throw new Error(`Unexpected test URL: ${url}`);
    }) as typeof fetch;

    const approved = await new PinchClient().getApprovedPaymentForLink(
      "plk_sandbox"
    );
    assert.deepEqual(approved, {
      provider: "pinch",
      paymentId: "pmt_approved",
      status: "approved",
      paymentLinkId: "plk_sandbox",
      payerId: "pyr_sandbox",
      amount: 750_000,
      currency: "AUD",
      metadata: commitmentMetadata()
    });
    assert.deepEqual(requests, [
      "https://pinch.test/auth",
      "https://pinch.test/api/payment-links/plk_sandbox",
      "https://pinch.test/api/payments/payer/pyr_sandbox"
    ]);
  });

  test("does not reconcile approved payment data that is not bound to the link", async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input);
      if (url === "https://pinch.test/auth") {
        return jsonResponse({ access_token: "sandbox-access-token" });
      }
      if (url === "https://pinch.test/api/payment-links/plk_sandbox") {
        return jsonResponse({
          id: "plk_sandbox",
          amountInCents: 750_000,
          currency: "AUD",
          metadata: JSON.stringify(commitmentMetadata()),
          payer: {
            id: "pyr_sandbox"
          },
          payments: [
            {
              id: "pmt_untrusted_embedded",
              status: "approved"
            }
          ]
        });
      }
      if (url === "https://pinch.test/api/payments/payer/pyr_sandbox") {
        return jsonResponse([
          {
            id: "pmt_wrong_amount",
            payer: { id: "pyr_sandbox" },
            amount: 1,
            currency: "AUD",
            status: "approved",
            metadata: JSON.stringify(commitmentMetadata())
          },
          {
            id: "pmt_wrong_payer",
            payer: { id: "pyr_other" },
            amount: 750_000,
            currency: "AUD",
            status: "approved",
            metadata: JSON.stringify(commitmentMetadata())
          }
        ]);
      }
      throw new Error(`Unexpected test URL: ${url}`);
    }) as typeof fetch;

    assert.equal(
      await new PinchClient().getApprovedPaymentForLink("plk_sandbox"),
      undefined
    );
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
        currency: "AUD",
        description: "Veltact Site Assessment / Scoping Visit commitment",
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
          authUrl: "https://credentials.example/connect/token",
          apiBaseUrl: "https://api.getpinch.com.au/test",
          secretKey: "sk_test_not-a-real-key"
        }),
      /Untrusted Pinch authentication configuration/
    );
    assert.throws(
      () =>
        assertPinchSandboxConfiguration({
          apiBaseUrl: "https://payments-proxy.example/test",
          secretKey: "sk_test_not-a-real-key"
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
        authUrl: "https://auth.getpinch.com.au/connect/token",
        apiBaseUrl: "https://api.getpinch.com.au/test",
        secretKey: "sk_test_not-a-real-key"
      })
    );
  });

  test("accepts only the official Pinch hosted checkout origin", () => {
    assert.doesNotThrow(() =>
      assertPinchHostedCheckoutUrl(
        "https://pay.getpinch.com.au/pay/plk_sandbox"
      )
    );
    assert.doesNotThrow(() =>
      assertPinchHostedCheckoutUrl(
        "https://sandbox.getpinch.com.au/pay/plk_sandbox"
      )
    );
    assert.throws(
      () =>
        assertPinchHostedCheckoutUrl(
          "https://pay.getpinch.com.au.example/pay/plk_sandbox"
        ),
      /untrusted URL/
    );
    assert.throws(
      () => assertPinchHostedCheckoutUrl("not-a-url"),
      (error: unknown) => error instanceof PinchApiError
    );
  });
});

function commitmentMetadata() {
  return {
    engagementId: "eng-123",
    needId: "need-123",
    supplierId: "supplier-123",
    milestoneId: "eng-123-m1-site-assessment-scoping-visit",
    commitmentType: "commercial_commitment",
    commitmentAmountMinor: "750000",
    commitmentCurrency: "AUD"
  };
}

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
