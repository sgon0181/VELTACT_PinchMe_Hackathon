import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { pinchClient } from "../pinch/pinchClient.js";
import {
  LocalDemoPaymentProvider,
  isLocalDemoHostedPaymentLink,
  localDemoPaymentProvider
} from "./localDemoPaymentProvider.js";
import { isUsableHostedPaymentLink } from "./commitmentPaymentService.js";
import { createConfiguredPaymentProvider } from "./providerRegistry.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("creates a clearly labelled local hosted-link state without a network call", async () => {
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("Unexpected external request");
  }) as typeof fetch;

  const provider = new LocalDemoPaymentProvider();
  const link = await provider.createHostedPaymentLink({
    engagementId: "engagement-123",
    needId: "need-456",
    supplierId: "supplier-789",
    buyerEmail: "buyer@example.com",
    amount: 1_850_000,
    description: "Veltact Diagnosis commitment",
    returnUrl: "http://localhost:4000/api/pinch/return/engagement-123"
  });

  assert.deepEqual(link, {
    provider: "local_demo",
    payerId: "local_demo_payer_need-456",
    paymentLinkId: "local_demo_link_engagement-123",
    hostedCheckoutUrl:
      "http://localhost:4000/api/pinch/return/engagement-123?payment_provider=local_demo&payment_link_id=local_demo_link_engagement-123"
  });
  assert.equal(
    await provider.getApprovedPaymentForLink(link.paymentLinkId),
    undefined
  );
  assert.equal(
    isUsableHostedPaymentLink({
      ...link,
      paymentStatus: "awaiting_payment"
    }),
    true
  );
  assert.equal(
    isUsableHostedPaymentLink({
      ...link,
      hostedCheckoutUrl: link.hostedCheckoutUrl.replace(
        "payment_provider=local_demo",
        "payment_provider=pinch"
      ),
      paymentStatus: "awaiting_payment"
    }),
    false
  );
  assert.equal(isLocalDemoHostedPaymentLink(link), true);
  assert.equal(
    isLocalDemoHostedPaymentLink({
      ...link,
      payerId: "pinch-payer-123"
    }),
    false
  );
  assert.equal(
    isLocalDemoHostedPaymentLink({
      ...link,
      hostedCheckoutUrl: link.hostedCheckoutUrl.replace(
        "payment_link_id=local_demo_link_engagement-123",
        "payment_link_id=local_demo_link_other"
      )
    }),
    false
  );
  assert.equal(fetchCalls, 0);
});

test("selects local demo only when explicitly configured outside production", () => {
  assert.equal(
    createConfiguredPaymentProvider({
      nodeEnv: "development",
      mode: "local_demo"
    }),
    localDemoPaymentProvider
  );
  assert.equal(
    createConfiguredPaymentProvider({
      nodeEnv: "test",
      mode: "local_demo"
    }),
    localDemoPaymentProvider
  );
  assert.throws(
    () =>
      createConfiguredPaymentProvider({
        nodeEnv: "production",
        mode: "local_demo"
      }),
    /unavailable in production/
  );
});

test("keeps Pinch as the default configured provider", () => {
  assert.equal(
    createConfiguredPaymentProvider({
      nodeEnv: "development",
      mode: "pinch"
    }),
    pinchClient
  );
});
