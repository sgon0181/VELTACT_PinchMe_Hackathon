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
  test("uses an available low-latency OpenAI model by default", () => {
    const result = parseEnvironment({
      NODE_ENV: "development",
      PAYMENT_PROVIDER: "local_demo",
      OPENAI_API_KEY: ""
    });

    assert.equal(result.OPENAI_MODEL, "gpt-5.4-mini");
    assert.equal(result.OPENAI_API_KEY, undefined);
    assert.equal(result.VELTACT_DISCOVERY_PROVIDER, "auto");
    assert.equal(result.VELTACT_SERVICE_FEE_BPS, 500);
  });

  test("accepts a bounded disclosed service-fee rate", () => {
    const result = parseEnvironment({
      NODE_ENV: "development",
      PAYMENT_PROVIDER: "local_demo",
      VELTACT_SERVICE_FEE_BPS: "650"
    });

    assert.equal(result.VELTACT_SERVICE_FEE_BPS, 650);
    assert.throws(() =>
      parseEnvironment({
        NODE_ENV: "development",
        PAYMENT_PROVIDER: "local_demo",
        VELTACT_SERVICE_FEE_BPS: "10001"
      })
    );
  });

  test("accepts the optional Perplexity supplier discovery mode", () => {
    const result = parseEnvironment({
      NODE_ENV: "development",
      PAYMENT_PROVIDER: "local_demo",
      VELTACT_DISCOVERY_PROVIDER: "perplexity",
      PERPLEXITY_API_KEY: "test-perplexity-key"
    });

    assert.equal(result.VELTACT_DISCOVERY_PROVIDER, "perplexity");
    assert.equal(result.PERPLEXITY_API_KEY, "test-perplexity-key");
  });

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

  test("keeps every generated link on the Render preview origin", () => {
    const result = parseEnvironment({
      NODE_ENV: "development",
      IS_PULL_REQUEST: "true",
      RENDER_EXTERNAL_URL: "https://veltact-pr-2.onrender.com",
      WEB_ORIGIN: "https://veltact.com",
      PUBLIC_BASE_URL: "https://veltact.com",
      API_PUBLIC_URL: "https://veltact.com",
      PINCH_RETURN_URL: "https://veltact.com/api/pinch/return",
      PAYMENT_PROVIDER: "local_demo"
    });

    assert.equal(result.WEB_ORIGIN, "https://veltact-pr-2.onrender.com");
    assert.equal(result.PUBLIC_BASE_URL, "https://veltact-pr-2.onrender.com");
    assert.equal(result.API_PUBLIC_URL, "https://veltact-pr-2.onrender.com");
    assert.equal(
      result.PINCH_RETURN_URL,
      "https://veltact-pr-2.onrender.com/api/pinch/return"
    );
  });

  test("rejects an unsafe or missing Render preview origin", () => {
    assert.throws(
      () =>
        parseEnvironment({
          NODE_ENV: "development",
          IS_PULL_REQUEST: "true",
          PAYMENT_PROVIDER: "local_demo"
        }),
      /RENDER_EXTERNAL_URL is required/
    );
    assert.throws(
      () =>
        parseEnvironment({
          NODE_ENV: "development",
          IS_PULL_REQUEST: "true",
          RENDER_EXTERNAL_URL: "http://veltact-pr-2.onrender.com",
          PAYMENT_PROVIDER: "local_demo"
        }),
      /credential-free HTTPS origin/
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
