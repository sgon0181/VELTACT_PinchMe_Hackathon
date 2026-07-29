import assert from "node:assert/strict";
import test from "node:test";

import {
  demoControlsEnabled,
  healthAllowsDemoControls,
  healthAllowsLocalDemoPayment,
  localDemoPaymentEnabled
} from "../public/assets/apiBase.js";

test("allows demo controls only for explicit development and test health", () => {
  assert.equal(healthAllowsDemoControls({ environment: "development" }), true);
  assert.equal(healthAllowsDemoControls({ environment: "test" }), true);
  assert.equal(healthAllowsDemoControls({ environment: "production" }), false);
  assert.equal(healthAllowsDemoControls({ environment: "staging" }), false);
  assert.equal(healthAllowsDemoControls({}), false);
  assert.equal(healthAllowsDemoControls(undefined), false);
});

test("allows local demo payment only when health confirms the provider and readiness", () => {
  const enabled = {
    environment: "development",
    paymentProvider: "local_demo",
    readiness: { localDemoPayment: true }
  };
  assert.equal(healthAllowsLocalDemoPayment(enabled), true);
  assert.equal(
    healthAllowsLocalDemoPayment({
      ...enabled,
      paymentProvider: "pinch"
    }),
    false
  );
  assert.equal(
    healthAllowsLocalDemoPayment({
      ...enabled,
      readiness: { localDemoPayment: false }
    }),
    false
  );
  assert.equal(
    healthAllowsLocalDemoPayment({
      ...enabled,
      environment: "production"
    }),
    false
  );
});

test("uses health as the local-demo payment authority", async () => {
  const enabled = await localDemoPaymentEnabled(
    "https://veltact.example/api/",
    async (url, init) => {
      assert.equal(url, "https://veltact.example/api/health");
      assert.equal(init.cache, "no-store");
      return {
        ok: true,
        json: async () => ({
          environment: "test",
          paymentProvider: "local_demo",
          readiness: { localDemoPayment: true }
        })
      };
    }
  );
  assert.equal(enabled, true);
});

test("uses the API health environment as the demo-control authority", async () => {
  const enabled = await demoControlsEnabled(
    "https://veltact.example/api/",
    async (url, init) => {
      assert.equal(url, "https://veltact.example/api/health");
      assert.equal(init.headers.Accept, "application/json");
      assert.equal(init.cache, "no-store");
      assert.ok(init.signal instanceof AbortSignal);
      return {
        ok: true,
        json: async () => ({ environment: "development" })
      };
    }
  );
  assert.equal(enabled, true);
});

test("fails closed for production, unhealthy, malformed, and unreachable health", async () => {
  const production = await demoControlsEnabled(
    "https://veltact.example/api",
    async () => ({
      ok: true,
      json: async () => ({ environment: "production" })
    })
  );
  const unhealthy = await demoControlsEnabled(
    "https://veltact.example/api",
    async () => ({ ok: false })
  );
  const malformed = await demoControlsEnabled(
    "https://veltact.example/api",
    async () => ({
      ok: true,
      json: async () => {
        throw new Error("invalid JSON");
      }
    })
  );
  const unreachable = await demoControlsEnabled(
    "https://veltact.example/api",
    async () => {
      throw new Error("offline");
    }
  );

  assert.equal(production, false);
  assert.equal(unhealthy, false);
  assert.equal(malformed, false);
  assert.equal(unreachable, false);
});
