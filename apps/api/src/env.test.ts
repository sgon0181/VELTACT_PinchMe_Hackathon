import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseEnvironment } from "./env.js";

const productionPinchEnvironment = {
  NODE_ENV: "production",
  WEB_ORIGIN: "https://staging.veltact.test",
  PUBLIC_BASE_URL: "https://staging.veltact.test",
  PAYMENT_PROVIDER: "pinch",
  PINCH_CLIENT_ID: "test-client",
  PINCH_SECRET_KEY: "test-secret",
  PINCH_AUTH_URL: "https://auth.getpinch.com.au/connect/token",
  PINCH_API_BASE_URL: "https://api.getpinch.com.au/test",
  PINCH_RETURN_URL: "https://staging.veltact.test/api/pinch/return"
};

describe("production Pinch environment", () => {
  test("requires the webhook secret used for authoritative confirmation", () => {
    assert.throws(
      () => parseEnvironment(productionPinchEnvironment),
      /PINCH_WEBHOOK_SECRET is required/
    );
  });

  test("requires HTTPS public and return URLs", () => {
    assert.throws(
      () =>
        parseEnvironment({
          ...productionPinchEnvironment,
          WEB_ORIGIN: "http://staging.veltact.test",
          PUBLIC_BASE_URL: "http://staging.veltact.test",
          PINCH_RETURN_URL:
            "http://staging.veltact.test/api/pinch/return",
          PINCH_WEBHOOK_SECRET: "whsec_test"
        }),
      /must use HTTPS/
    );
  });

  test("accepts a complete production sandbox configuration", () => {
    const result = parseEnvironment({
      ...productionPinchEnvironment,
      PINCH_WEBHOOK_SECRET: "whsec_test"
    });

    assert.equal(result.PAYMENT_PROVIDER, "pinch");
    assert.equal(result.PINCH_WEBHOOK_SECRET, "whsec_test");
  });
});
