import assert from "node:assert/strict";
import crypto from "node:crypto";
import { afterEach, describe, test } from "node:test";
import {
  PinchWebhookError,
  verifyPinchWebhookSignature
} from "./webhookVerifier.js";

const originalSecret = process.env.PINCH_WEBHOOK_SECRET;

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.PINCH_WEBHOOK_SECRET;
  } else {
    process.env.PINCH_WEBHOOK_SECRET = originalSecret;
  }
});

describe("verifyPinchWebhookSignature", () => {
  test("accepts the documented timestamped v2 HMAC signature", () => {
    process.env.PINCH_WEBHOOK_SECRET = "whsec_test_only";
    const rawBody = Buffer.from(JSON.stringify({ Id: "evt_123" }));
    const timestamp = Math.floor(Date.now() / 1000).toString();

    assert.deepEqual(
      verifyPinchWebhookSignature({
        signatureHeader: signature(timestamp, rawBody),
        rawBody
      }),
      { timestamp: Number(timestamp) }
    );
  });

  test("rejects unsigned, stale, and tampered deliveries", () => {
    process.env.PINCH_WEBHOOK_SECRET = "whsec_test_only";
    const rawBody = Buffer.from(JSON.stringify({ Id: "evt_123" }));
    const now = Math.floor(Date.now() / 1000).toString();
    const stale = (Math.floor(Date.now() / 1000) - 301).toString();

    assert.throws(
      () =>
        verifyPinchWebhookSignature({
          signatureHeader: undefined,
          rawBody
        }),
      webhookError(/Missing/)
    );
    assert.throws(
      () =>
        verifyPinchWebhookSignature({
          signatureHeader: signature(stale, rawBody),
          rawBody
        }),
      webhookError(/outside tolerance/)
    );
    assert.throws(
      () =>
        verifyPinchWebhookSignature({
          signatureHeader: signature(now, Buffer.from("{}")),
          rawBody
        }),
      webhookError(/verification failed/)
    );
  });
});

function signature(timestamp: string, rawBody: Buffer) {
  const digest = crypto
    .createHmac("sha256", process.env.PINCH_WEBHOOK_SECRET ?? "")
    .update(`${timestamp}.${rawBody.toString("utf8")}`)
    .digest("hex");
  return `t=${timestamp},v2=${digest}`;
}

function webhookError(pattern: RegExp) {
  return (error: unknown) =>
    error instanceof PinchWebhookError && pattern.test(error.message);
}
