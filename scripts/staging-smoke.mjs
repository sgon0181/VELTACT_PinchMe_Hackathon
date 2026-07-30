#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const gitRevisionPattern = /^[0-9a-f]{7,40}$/i;

const readinessCapabilities = [
  "persistence",
  "v2Persistence",
  "accountPersistence",
  "buyerCapabilityAuth",
  "pinch",
  "pinchApi",
  "pinchWebhook",
  "localDemoPayment",
  "openAi",
  "v2Research",
  "email",
  "outreachRecipientOverrides",
  "sms"
];

const providerModeValues = {
  research: ["auto", "openai", "fixture"],
  email: ["local_demo", "resend", "sendgrid"],
  sms: ["none", "local_demo", "twilio"],
  payment: ["local_demo", "pinch"]
};

const publicPages = [
  ["/", "<title>Veltact | Find, connect and deploy industrial expertise</title>"],
  [
    "/landing.html",
    "<title>Veltact | Find, connect and deploy industrial expertise</title>"
  ],
  ["/index.html", "<title>Veltact | Buyer workspace</title>"],
  ["/signin.html", "<title>Sign in | Veltact</title>"],
  ["/create-account.html", "<title>Create account | Veltact</title>"],
  ["/supplier.html", "<title>Veltact Supplier Opportunity</title>"]
];

const readinessClassifications = {
  fixture: "fixture-demo-ready",
  strict: "strict-real-provider-ready"
};

export const stagingSmokeUsage = `Usage:
  npm run smoke:staging -- --origin https://HOST [--expected-sha GIT_SHA] [--require either|fixture|strict]

Options:
  --origin         Credential-free HTTPS origin. May also use VELTACT_STAGING_ORIGIN.
  --expected-sha   Expected 7-40 character Git SHA. May also use VELTACT_EXPECTED_SHA.
  --require        Required readiness profile (default: either).
  --help           Show this help.

Exit codes:
  0  All checks pass and the requested readiness profile matches.
  1  The deployment is stale, malformed, unreachable, or not ready.
  2  Command usage is invalid.`;

export class StagingSmokeError extends Error {
  constructor(readonlyFailures) {
    super(
      `Staging readiness failed:\n${readonlyFailures
        .map((failure) => `- ${failure.name}: ${failure.message}`)
        .join("\n")}`
    );
    this.name = "StagingSmokeError";
    this.failures = readonlyFailures;
  }
}

export class StagingSmokeUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "StagingSmokeUsageError";
  }
}

export function parseStagingOptions(
  args = process.argv.slice(2),
  environment = process.env
) {
  if (args.includes("--help")) {
    return { help: true };
  }

  const options = readCommandOptions(args);
  const originValue =
    options.origin ?? environment.VELTACT_STAGING_ORIGIN;
  const expectedShaValue =
    options.expectedSha ?? environment.VELTACT_EXPECTED_SHA;
  const requirementValue =
    options.requirement ??
    environment.VELTACT_READINESS_REQUIREMENT ??
    "either";

  if (!originValue) {
    throw new StagingSmokeUsageError(
      "Provide --origin https://HOST or set VELTACT_STAGING_ORIGIN"
    );
  }

  return {
    help: false,
    origin: parseHttpsOrigin(originValue),
    expectedSha:
      expectedShaValue === undefined
        ? undefined
        : parseGitRevision(expectedShaValue, "expected SHA"),
    requirement: parseRequirement(requirementValue)
  };
}

export function parseStagingOrigin(
  args = process.argv.slice(2),
  environment = process.env
) {
  const options = parseStagingOptions(args, environment);
  if (options.help) {
    throw new StagingSmokeUsageError("--help does not identify an origin");
  }
  return options.origin;
}

export function classifyReadiness(healthInput) {
  const health = validateHealth(healthInput);
  const fixtureFailures = fixtureProfileFailures(health);
  if (fixtureFailures.length === 0) {
    return {
      classification: readinessClassifications.fixture,
      health
    };
  }

  const strictFailures = strictProfileFailures(health);
  if (strictFailures.length === 0) {
    return {
      classification: readinessClassifications.strict,
      health
    };
  }

  return {
    classification: "not-ready",
    health,
    reasons: [
      `${readinessClassifications.fixture}: ${fixtureFailures.join(", ")}`,
      `${readinessClassifications.strict}: ${strictFailures.join(", ")}`
    ]
  };
}

export async function runStagingSmoke({
  origin,
  expectedSha,
  requirement = "either",
  request = fetch,
  logger = console,
  timeoutMs = 10_000
}) {
  const checkedOrigin = parseHttpsOrigin(origin);
  const checkedExpectedSha =
    expectedSha === undefined
      ? undefined
      : parseGitRevision(expectedSha, "expected SHA");
  const checkedRequirement = parseRequirement(requirement);
  const failures = [];
  let healthResponse;
  let readiness;

  const runCheck = async (name, check) => {
    try {
      await check();
      logger.log(`PASS ${name}`);
    } catch (error) {
      failures.push({
        name,
        message: safeErrorMessage(error)
      });
      logger.error(`FAIL ${name}`);
    }
  };

  await runCheck("API health contract", async () => {
    const result = await readJson(
      new URL("/api/health", checkedOrigin),
      request,
      timeoutMs,
      checkedOrigin
    );
    healthResponse = {
      response: result.response,
      health: validateHealth(result.value)
    };
  });

  if (healthResponse) {
    await runCheck("Release revision", async () => {
      const actualRevision = healthResponse.health.releaseRevision;
      if (
        checkedExpectedSha &&
        !gitRevisionsMatch(actualRevision, checkedExpectedSha)
      ) {
        throw new Error(
          `deployed revision ${actualRevision} does not match expected ${checkedExpectedSha}`
        );
      }
    });

    await runCheck("Configured public origin", async () => {
      const allowedOrigin = healthResponse.response.headers.get(
        "access-control-allow-origin"
      );
      if (allowedOrigin !== checkedOrigin) {
        throw new Error(
          "API public-origin behavior does not match the requested origin"
        );
      }
    });

    await runCheck("Provider readiness classification", async () => {
      readiness = classifyReadiness(healthResponse.health);
      if (readiness.classification === "not-ready") {
        throw new Error(readiness.reasons.join("; "));
      }
    });

    if (
      readiness?.classification === readinessClassifications.strict
    ) {
      await runCheck("Pinch sandbox authentication", async () => {
        const result = await readJson(
          new URL("/api/pinch/health", checkedOrigin),
          request,
          timeoutMs,
          checkedOrigin
        );
        assertEqual(result.value.authenticated, true, "Pinch authentication");
        assertEqual(result.value.environment, "sandbox", "Pinch environment");
      });
    }

    if (readiness && readiness.classification !== "not-ready") {
      await runCheck("Requested readiness profile", async () => {
        const expectedClassification =
          checkedRequirement === "either"
            ? readiness.classification
            : readinessClassifications[checkedRequirement];
        if (readiness.classification !== expectedClassification) {
          throw new Error(
            `required ${expectedClassification}, detected ${readiness.classification}`
          );
        }
      });
    }
  }

  for (const [path, marker] of publicPages) {
    await runCheck(`Public page ${path}`, async () => {
      const body = await readText(
        new URL(path, checkedOrigin),
        request,
        timeoutMs,
        checkedOrigin
      );
      if (!body.includes(marker)) {
        throw new Error(`expected the release marker for ${path}`);
      }
    });
  }

  if (failures.length > 0) {
    throw new StagingSmokeError(failures);
  }

  const result = {
    classification: readiness.classification,
    releaseRevision: readiness.health.releaseRevision,
    providerModes: readiness.health.providerModes
  };
  logger.log(`READY ${result.classification}`);
  logger.log(`RELEASE ${result.releaseRevision}`);
  logger.log(
    `PROVIDERS research=${result.providerModes.research} email=${result.providerModes.email} sms=${result.providerModes.sms} payment=${result.providerModes.payment}`
  );
  logger.log(
    "MANUAL PROOF REQUIRED browser journey, physical delivery, checkout, and authoritative payment confirmation"
  );
  return result;
}

function readCommandOptions(args) {
  const values = {};
  const flags = new Map([
    ["--origin", "origin"],
    ["--expected-sha", "expectedSha"],
    ["--require", "requirement"]
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const separator = argument.indexOf("=");
    const flag = separator >= 0 ? argument.slice(0, separator) : argument;
    const key = flags.get(flag);
    if (!key) {
      throw new StagingSmokeUsageError("Unknown command option");
    }
    if (Object.hasOwn(values, key)) {
      throw new StagingSmokeUsageError(`Option ${flag} was provided more than once`);
    }

    const inlineValue =
      separator >= 0 ? argument.slice(separator + 1) : undefined;
    const value =
      inlineValue ??
      (() => {
        index += 1;
        return args[index];
      })();
    if (!value || value.startsWith("--")) {
      throw new StagingSmokeUsageError(`Option ${flag} requires a value`);
    }
    values[key] = value;
  }

  return values;
}

function parseHttpsOrigin(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new StagingSmokeUsageError(
      "The staging origin must be a credential-free HTTPS origin"
    );
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new StagingSmokeUsageError(
      "The staging origin must be a credential-free HTTPS origin with no path, query, or fragment"
    );
  }

  return parsed.origin;
}

function parseGitRevision(value, label) {
  if (typeof value !== "string" || !gitRevisionPattern.test(value.trim())) {
    throw new StagingSmokeUsageError(
      `The ${label} must be a 7-40 character hexadecimal Git SHA`
    );
  }
  return value.trim().toLowerCase();
}

function parseRequirement(value) {
  if (!["either", "fixture", "strict"].includes(value)) {
    throw new StagingSmokeUsageError(
      "The readiness requirement must be either, fixture, or strict"
    );
  }
  return value;
}

function validateHealth(value) {
  const health = objectValue(value, "/api/health");
  assertEqual(health.application, "veltact-api", "application identity");
  assertEqual(health.status, "ok", "API status");
  assertOneOf(
    health.environment,
    ["development", "test", "production"],
    "runtime environment"
  );
  const releaseRevision = parseDeployedRevision(health.releaseRevision);
  const providerModesValue = objectValue(
    health.providerModes,
    "providerModes"
  );
  const providerModes = {};
  for (const [provider, allowedValues] of Object.entries(providerModeValues)) {
    assertOneOf(
      providerModesValue[provider],
      allowedValues,
      `providerModes.${provider}`
    );
    providerModes[provider] = providerModesValue[provider];
  }
  assertEqual(
    health.paymentProvider,
    providerModes.payment,
    "payment provider consistency"
  );

  const readinessValue = objectValue(health.readiness, "readiness");
  const readiness = {};
  for (const capability of readinessCapabilities) {
    if (typeof readinessValue[capability] !== "boolean") {
      throw new Error(`readiness.${capability} must be boolean`);
    }
    readiness[capability] = readinessValue[capability];
  }

  return {
    application: "veltact-api",
    status: "ok",
    environment: health.environment,
    releaseRevision,
    paymentProvider: health.paymentProvider,
    providerModes,
    readiness
  };
}

function parseDeployedRevision(value) {
  if (typeof value !== "string" || !gitRevisionPattern.test(value)) {
    throw new Error(
      "releaseRevision must identify a deployed 7-40 character Git SHA"
    );
  }
  return value.toLowerCase();
}

function fixtureProfileFailures(health) {
  return profileFailures(health, {
    environments: ["development", "test"],
    providerModes: {
      research: ["fixture"],
      email: ["local_demo"],
      sms: ["local_demo"],
      payment: ["local_demo"]
    },
    readyCapabilities: [
      "persistence",
      "v2Persistence",
      "accountPersistence",
      "localDemoPayment",
      "v2Research",
      "email",
      "sms"
    ]
  });
}

function strictProfileFailures(health) {
  return profileFailures(health, {
    environments: ["production"],
    providerModes: {
      research: ["openai"],
      email: ["resend", "sendgrid"],
      sms: ["twilio"],
      payment: ["pinch"]
    },
    readyCapabilities: [
      "persistence",
      "v2Persistence",
      "accountPersistence",
      "buyerCapabilityAuth",
      "pinch",
      "pinchApi",
      "pinchWebhook",
      "openAi",
      "v2Research",
      "email",
      "outreachRecipientOverrides",
      "sms"
    ],
    unavailableCapabilities: ["localDemoPayment"]
  });
}

function profileFailures(health, profile) {
  const failures = [];
  if (!profile.environments.includes(health.environment)) {
    failures.push("runtime environment does not match");
  }
  for (const [provider, expectedModes] of Object.entries(
    profile.providerModes
  )) {
    if (!expectedModes.includes(health.providerModes[provider])) {
      failures.push(`providerModes.${provider} does not match`);
    }
  }
  for (const capability of profile.readyCapabilities) {
    if (health.readiness[capability] !== true) {
      failures.push(`readiness.${capability} is false`);
    }
  }
  for (const capability of profile.unavailableCapabilities ?? []) {
    if (health.readiness[capability] !== false) {
      failures.push(`readiness.${capability} is true`);
    }
  }
  return failures;
}

function gitRevisionsMatch(actual, expected) {
  return actual.startsWith(expected) || expected.startsWith(actual);
}

async function readJson(url, request, timeoutMs, origin) {
  const response = await makeRequest(
    url,
    request,
    timeoutMs,
    origin,
    "application/json"
  );
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`${url.pathname} did not return JSON`);
  }
  let value;
  try {
    value = await response.json();
  } catch {
    throw new Error(`${url.pathname} returned malformed JSON`);
  }
  return {
    response,
    value: objectValue(value, url.pathname)
  };
}

async function readText(url, request, timeoutMs, origin) {
  const response = await makeRequest(
    url,
    request,
    timeoutMs,
    origin,
    "text/html"
  );
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    throw new Error(`${url.pathname} did not return HTML`);
  }
  return response.text();
}

async function makeRequest(url, request, timeoutMs, origin, accept) {
  let response;
  try {
    response = await request(
      url,
      requestOptions(timeoutMs, origin, accept)
    );
  } catch {
    throw new Error(`${url.pathname} request failed`);
  }
  if (!response || typeof response.ok !== "boolean") {
    throw new Error(`${url.pathname} returned an invalid response`);
  }
  if (!response.ok) {
    throw new Error(`${url.pathname} returned HTTP ${response.status}`);
  }
  return response;
}

function requestOptions(timeoutMs, origin, accept) {
  return {
    method: "GET",
    headers: {
      Accept: accept,
      "Cache-Control": "no-cache",
      Origin: origin
    },
    cache: "no-store",
    credentials: "omit",
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
    throw new Error(`${label} is invalid`);
  }
}

function assertOneOf(actual, expected, label) {
  if (!expected.includes(actual)) {
    throw new Error(`${label} is invalid`);
  }
}

function safeErrorMessage(error) {
  return error instanceof Error ? error.message : "check could not be completed";
}

const runningAsCommand =
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (runningAsCommand) {
  try {
    const options = parseStagingOptions();
    if (options.help) {
      console.log(stagingSmokeUsage);
    } else {
      await runStagingSmoke(options);
    }
  } catch (error) {
    if (error instanceof StagingSmokeUsageError) {
      console.error(error.message);
      console.error(stagingSmokeUsage);
      process.exitCode = 2;
    } else if (error instanceof StagingSmokeError) {
      console.error(error.message);
      process.exitCode = 1;
    } else {
      console.error("Staging readiness failed unexpectedly");
      process.exitCode = 1;
    }
  }
}
