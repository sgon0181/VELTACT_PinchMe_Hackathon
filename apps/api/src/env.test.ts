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
  test("accepts a Render revision without requiring a manually configured release id", () => {
    const result = parseEnvironment({
      NODE_ENV: "development",
      PAYMENT_PROVIDER: "local_demo",
      RENDER_GIT_COMMIT: "7c9a9975d193189a40da6a9d1e4593bac5861b04"
    });

    assert.equal(
      result.RENDER_GIT_COMMIT,
      "7c9a9975d193189a40da6a9d1e4593bac5861b04"
    );
  });

  test("rejects malformed release revisions", () => {
    assert.throws(
      () =>
        parseEnvironment({
          NODE_ENV: "development",
          PAYMENT_PROVIDER: "local_demo",
          VELTACT_RELEASE_SHA: "latest"
        }),
      /VELTACT_RELEASE_SHA/
    );
  });

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
