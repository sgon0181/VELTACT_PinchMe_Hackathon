#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const requiredReadiness = [
  "persistence",
  "v2Persistence",
  "accountPersistence",
  "buyerCapabilityAuth",
  "pinch",
  "openAi",
  "v2Research",
  "email",
  "outreachRecipientOverrides",
  "sms"
];

const publicPages = [
  ["/", "<title>Veltact"],
  ["/index.html", "<title>Veltact"],
  ["/signin.html", "<title>Sign in | Veltact"],
  ["/create-account.html", "<title>Create account | Veltact"],
  ["/supplier.html", "<title>Veltact Supplier Opportunity"]
];

export class StagingSmokeError extends Error {
  constructor(readonlyFailures) {
    super(
      `Staging preflight failed:\n${readonlyFailures
        .map((failure) => `- ${failure.name}: ${failure.message}`)
        .join("\n")}`
    );
    this.name = "StagingSmokeError";
    this.failures = readonlyFailures;
  }
}

export function parseStagingOrigin(
  args = process.argv.slice(2),
  environment = process.env
) {
  const inlineOrigin = args.find((argument) => argument.startsWith("--origin="));
  const originIndex = args.indexOf("--origin");
  const value =
    inlineOrigin?.slice("--origin=".length) ||
    (originIndex >= 0 ? args[originIndex + 1] : undefined) ||
    environment.VELTACT_STAGING_ORIGIN;

  if (!value) {
    throw new Error(
      "Provide --origin https://YOUR-STAGING-ORIGIN or set VELTACT_STAGING_ORIGIN"
    );
  }

  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("The staging origin must be a credential-free HTTPS URL");
  }

  return parsed.origin;
}

export async function runStagingSmoke({
  origin,
  request = fetch,
  logger = console,
  timeoutMs = 10_000
}) {
  const failures = [];
  const runCheck = async (name, check) => {
    try {
      await check();
      logger.log(`PASS ${name}`);
    } catch (error) {
      failures.push({
        name,
        message: error instanceof Error ? error.message : String(error)
      });
      logger.error(`FAIL ${name}`);
    }
  };

  await runCheck("API deployment readiness", async () => {
    const health = await readJson(
      new URL("/api/health", origin),
      request,
      timeoutMs
    );
    assertEqual(health.application, "veltact-api", "application identity");
    assertEqual(health.status, "ok", "API status");
    assertEqual(health.environment, "production", "runtime environment");
    assertEqual(health.paymentProvider, "pinch", "payment provider");

    const readiness = objectValue(health.readiness, "readiness");
    const unavailable = requiredReadiness.filter(
      (capability) => readiness[capability] !== true
    );
    if (unavailable.length > 0) {
      throw new Error(`not ready: ${unavailable.join(", ")}`);
    }
    assertEqual(
      readiness.localDemoPayment,
      false,
      "local demo payment availability"
    );
  });

  await runCheck("Pinch sandbox authentication", async () => {
    const health = await readJson(
      new URL("/api/pinch/health", origin),
      request,
      timeoutMs
    );
    assertEqual(health.authenticated, true, "Pinch authentication");
    assertEqual(health.environment, "sandbox", "Pinch environment");
  });

  for (const [path, marker] of publicPages) {
    await runCheck(`Public page ${path}`, async () => {
      const body = await readText(new URL(path, origin), request, timeoutMs);
      if (!body.includes(marker)) {
        throw new Error(`expected page marker ${JSON.stringify(marker)}`);
      }
    });
  }

  if (failures.length > 0) {
    throw new StagingSmokeError(failures);
  }

  logger.log(
    "PASS staging preflight (physical delivery, checkout and webhook proof still required)"
  );
}

async function readJson(url, request, timeoutMs) {
  const response = await request(url, requestOptions(timeoutMs));
  if (!response.ok) {
    throw new Error(`${url.pathname} returned HTTP ${response.status}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`${url.pathname} did not return JSON`);
  }
  return objectValue(await response.json(), url.pathname);
}

async function readText(url, request, timeoutMs) {
  const response = await request(url, requestOptions(timeoutMs));
  if (!response.ok) {
    throw new Error(`${url.pathname} returned HTTP ${response.status}`);
  }
  return response.text();
}

function requestOptions(timeoutMs) {
  return {
    headers: {
      Accept: "application/json, text/html;q=0.9"
    },
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs)
  };
}

function objectValue(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} was not an object`);
  }
  return value;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      `${label} expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`
    );
  }
}

const runningAsCommand =
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (runningAsCommand) {
  try {
    const origin = parseStagingOrigin();
    await runStagingSmoke({ origin });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
