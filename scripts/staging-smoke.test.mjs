import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import {
  classifyReadiness,
  parseStagingOptions,
  runStagingSmoke,
  StagingSmokeError,
  StagingSmokeUsageError
} from "./staging-smoke.mjs";

const origin = "https://staging.veltact.test";
const releaseRevision = "a".repeat(40);
const fixtureHealth = {
  application: "veltact-api",
  status: "ok",
  environment: "development",
  releaseRevision,
  paymentProvider: "local_demo",
  providerModes: {
    research: "fixture",
    email: "local_demo",
    sms: "local_demo",
    payment: "local_demo"
  },
  readiness: {
    persistence: true,
    v2Persistence: true,
    accountPersistence: true,
    buyerCapabilityAuth: false,
    pinch: false,
    pinchApi: false,
    pinchWebhook: false,
    localDemoPayment: true,
    openAi: false,
    v2Research: true,
    email: true,
    outreachRecipientOverrides: false,
    sms: true
  }
};
const strictHealth = {
  ...structuredClone(fixtureHealth),
  environment: "production",
  paymentProvider: "pinch",
  providerModes: {
    research: "openai",
    email: "resend",
    sms: "twilio",
    payment: "pinch"
  },
  readiness: {
    persistence: true,
    v2Persistence: true,
    accountPersistence: true,
    buyerCapabilityAuth: true,
    pinch: true,
    pinchApi: true,
    pinchWebhook: true,
    localDemoPayment: false,
    openAi: true,
    v2Research: true,
    email: true,
    outreachRecipientOverrides: true,
    sms: true
  }
};

describe("staging readiness command", () => {
  test("parses an exact credential-free HTTPS origin and release requirement", () => {
    assert.deepEqual(
      parseStagingOptions([
        "--origin",
        `${origin}/`,
        "--expected-sha",
        releaseRevision.slice(0, 12),
        "--require=strict"
      ]),
      {
        help: false,
        origin,
        expectedSha: releaseRevision.slice(0, 12),
        requirement: "strict"
      }
    );

    for (const invalidOrigin of [
      "http://staging.veltact.test",
      "https://user:password@staging.veltact.test",
      `${origin}/api`,
      `${origin}?token=sensitive`
    ]) {
      assert.throws(
        () => parseStagingOptions(["--origin", invalidOrigin]),
        StagingSmokeUsageError
      );
    }
    assert.throws(
      () =>
        parseStagingOptions([
          "--origin",
          origin,
          "--expected-sha",
          "not-a-sha"
        ]),
      /hexadecimal Git SHA/
    );
  });

  test("classifies exact fixture and strict real-provider health", () => {
    assert.equal(
      classifyReadiness(fixtureHealth).classification,
      "fixture-demo-ready"
    );
    assert.equal(
      classifyReadiness(strictHealth).classification,
      "strict-real-provider-ready"
    );

    const mixedHealth = structuredClone(strictHealth);
    mixedHealth.providerModes.research = "auto";
    assert.equal(classifyReadiness(mixedHealth).classification, "not-ready");
  });

  test("passes fixture readiness using only non-destructive, credential-free requests", async () => {
    const calls = [];
    const messages = [];
    const result = await runStagingSmoke({
      origin,
      expectedSha: releaseRevision.slice(0, 10),
      requirement: "fixture",
      request: fixtureRequest({ calls }),
      logger: memoryLogger(messages)
    });

    assert.equal(result.classification, "fixture-demo-ready");
    assert.equal(
      calls.some(({ path }) => path === "/api/pinch/health"),
      false
    );
    for (const call of calls) {
      assert.equal(call.method, "GET");
      assert.equal(call.credentials, "omit");
      assert.equal(call.authorization, undefined);
      assert.equal(call.cookie, undefined);
      assert.equal(call.origin, origin);
      assert.equal(call.search, "");
    }
    assert.equal(messages.includes("READY fixture-demo-ready"), true);
  });

  test("passes strict readiness only after Pinch sandbox authentication", async () => {
    const calls = [];
    const result = await runStagingSmoke({
      origin,
      expectedSha: releaseRevision,
      requirement: "strict",
      request: fixtureRequest({ health: strictHealth, calls }),
      logger: memoryLogger([])
    });

    assert.equal(result.classification, "strict-real-provider-ready");
    assert.equal(
      calls.some(({ path }) => path === "/api/pinch/health"),
      true
    );
  });

  test("requires both Pinch API and webhook readiness in strict mode", () => {
    for (const capability of ["pinchApi", "pinchWebhook"]) {
      const health = structuredClone(strictHealth);
      health.readiness[capability] = false;
      health.readiness.pinch = false;

      const result = classifyReadiness(health);
      assert.equal(result.classification, "not-ready");
      assert.ok(
        result.reasons.some((reason) =>
          reason.includes(`readiness.${capability} is false`)
        )
      );
    }
  });

  test("rejects malformed health without reflecting an unexpected provider value", async () => {
    const health = structuredClone(fixtureHealth);
    health.providerModes.email = "secret-provider-token";

    await assert.rejects(
      runStagingSmoke({
        origin,
        request: fixtureRequest({ health }),
        logger: memoryLogger([])
      }),
      (error) =>
        error instanceof StagingSmokeError &&
        error.message.includes("providerModes.email is invalid") &&
        !error.message.includes("secret-provider-token")
    );
  });

  test("rejects a stale deployed revision while completing page checks", async () => {
    const messages = [];
    await assert.rejects(
      runStagingSmoke({
        origin,
        expectedSha: "b".repeat(40),
        request: fixtureRequest(),
        logger: memoryLogger(messages)
      }),
      (error) =>
        error instanceof StagingSmokeError &&
        error.message.includes("does not match expected")
    );
    assert.equal(messages.includes("PASS Public page /supplier.html"), true);
  });

  test("rejects malformed JSON and a mismatched configured public origin", async () => {
    await assert.rejects(
      runStagingSmoke({
        origin,
        request: fixtureRequest({ malformedHealth: true }),
        logger: memoryLogger([])
      }),
      (error) =>
        error instanceof StagingSmokeError &&
        error.message.includes("/api/health returned malformed JSON")
    );

    await assert.rejects(
      runStagingSmoke({
        origin,
        request: fixtureRequest({
          corsOrigin: "https://old-deploy.veltact.test"
        }),
        logger: memoryLogger([])
      }),
      (error) =>
        error instanceof StagingSmokeError &&
        error.message.includes("public-origin behavior")
    );
  });

  test("fails when the requested readiness profile differs from classification", async () => {
    await assert.rejects(
      runStagingSmoke({
        origin,
        requirement: "strict",
        request: fixtureRequest(),
        logger: memoryLogger([])
      }),
      (error) =>
        error instanceof StagingSmokeError &&
        error.message.includes(
          "required strict-real-provider-ready, detected fixture-demo-ready"
        )
    );
  });

  test("uses exit code 0 for help and 2 for invalid command usage", () => {
    const script = fileURLToPath(new URL("./staging-smoke.mjs", import.meta.url));
    const help = spawnSync(process.execPath, [script, "--help"], {
      encoding: "utf8"
    });
    assert.equal(help.status, 0);
    assert.match(help.stdout, /Exit codes:/);

    const invalid = spawnSync(
      process.execPath,
      [script, "--origin", "http://staging.veltact.test"],
      { encoding: "utf8" }
    );
    assert.equal(invalid.status, 2);
    assert.match(invalid.stderr, /credential-free HTTPS origin/);
  });
});

function fixtureRequest({
  health = fixtureHealth,
  calls = [],
  corsOrigin = origin,
  malformedHealth = false
} = {}) {
  return async (url, init) => {
    const parsed = new URL(url);
    const headers = new Headers(init.headers);
    calls.push({
      path: parsed.pathname,
      search: parsed.search,
      method: init.method,
      credentials: init.credentials,
      authorization: headers.get("authorization") ?? undefined,
      cookie: headers.get("cookie") ?? undefined,
      origin: headers.get("origin")
    });

    if (parsed.pathname === "/api/health") {
      const responseHeaders = {
        "access-control-allow-origin": corsOrigin,
        "content-type": "application/json"
      };
      return malformedHealth
        ? new Response("{", { headers: responseHeaders })
        : new Response(JSON.stringify(health), { headers: responseHeaders });
    }
    if (parsed.pathname === "/api/pinch/health") {
      return Response.json({
        authenticated: true,
        environment: "sandbox"
      });
    }

    const marker = new Map([
      [
        "/",
        "<title>Veltact | Find, connect and deploy industrial expertise</title>"
      ],
      [
        "/landing.html",
        "<title>Veltact | Find, connect and deploy industrial expertise</title>"
      ],
      ["/index.html", "<title>Veltact | Buyer workspace</title>"],
      ["/signin.html", "<title>Sign in | Veltact</title>"],
      ["/create-account.html", "<title>Create account | Veltact</title>"],
      ["/supplier.html", "<title>Veltact Supplier Opportunity</title>"]
    ]).get(parsed.pathname);
    return marker
      ? new Response(`<!doctype html>${marker}`, {
          headers: { "content-type": "text/html; charset=utf-8" }
        })
      : new Response("Not found", { status: 404 });
  };
}

function memoryLogger(messages) {
  return {
    log: (message) => messages.push(message),
    error: (message) => messages.push(message)
  };
}
