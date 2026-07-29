import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  parseStagingOrigin,
  runStagingSmoke,
  StagingSmokeError
} from "./staging-smoke.mjs";

const readyHealth = {
  application: "veltact-api",
  status: "ok",
  environment: "production",
  paymentProvider: "pinch",
  readiness: {
    persistence: true,
    v2Persistence: true,
    accountPersistence: true,
    buyerCapabilityAuth: true,
    pinch: true,
    localDemoPayment: false,
    openAi: true,
    v2Research: true,
    email: true,
    outreachRecipientOverrides: true,
    sms: true
  }
};

describe("staging preflight", () => {
  test("accepts an explicit credential-free HTTPS origin", () => {
    assert.equal(
      parseStagingOrigin(["--origin", "https://staging.veltact.test/path"]),
      "https://staging.veltact.test"
    );
    assert.throws(
      () => parseStagingOrigin(["--origin=http://localhost:4000"]),
      /credential-free HTTPS/
    );
  });

  test("passes production readiness, Pinch auth and public pages", async () => {
    const messages = [];
    await runStagingSmoke({
      origin: "https://staging.veltact.test",
      request: fixtureRequest(),
      logger: {
        log: (message) => messages.push(message),
        error: (message) => messages.push(message)
      }
    });

    assert.equal(messages.at(-1)?.startsWith("PASS staging preflight"), true);
  });

  test("reports unavailable required providers without hiding page results", async () => {
    const health = structuredClone(readyHealth);
    health.readiness.sms = false;
    const messages = [];

    await assert.rejects(
      runStagingSmoke({
        origin: "https://staging.veltact.test",
        request: fixtureRequest({ health }),
        logger: {
          log: (message) => messages.push(message),
          error: (message) => messages.push(message)
        }
      }),
      (error) =>
        error instanceof StagingSmokeError &&
        error.message.includes("not ready: sms")
    );
    assert.equal(messages.includes("PASS Public page /supplier.html"), true);
  });
});

function fixtureRequest({ health = readyHealth } = {}) {
  return async (url) => {
    const path = new URL(url).pathname;
    if (path === "/api/health") {
      return Response.json(health);
    }
    if (path === "/api/pinch/health") {
      return Response.json({
        authenticated: true,
        environment: "sandbox"
      });
    }
    const marker = new Map([
      ["/", "<title>Veltact"],
      ["/index.html", "<title>Veltact"],
      ["/signin.html", "<title>Sign in | Veltact"],
      ["/create-account.html", "<title>Create account | Veltact"],
      ["/supplier.html", "<title>Veltact Supplier Opportunity"]
    ]).get(path);
    return marker
      ? new Response(`<!doctype html>${marker}</title>`)
      : new Response("Not found", { status: 404 });
  };
}
