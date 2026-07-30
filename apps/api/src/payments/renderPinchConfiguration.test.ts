import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../.."
);

test("deploys main with Pinch TEST mode and dashboard-managed credentials", async () => {
  const configuration = await readFile(
    path.join(repositoryRoot, "render.yaml"),
    "utf8"
  );

  assert.match(configuration, /^\s+branch: main$/m);
  assert.match(
    configuration,
    /- key: PAYMENT_PROVIDER\s+value: pinch/
  );
  assert.match(
    configuration,
    /- key: PINCH_AUTH_URL\s+value: https:\/\/auth\.getpinch\.com\.au\/connect\/token/
  );
  assert.match(
    configuration,
    /- key: PINCH_API_BASE_URL\s+value: https:\/\/api\.getpinch\.com\.au\/test\//
  );
  assert.match(
    configuration,
    /- key: PINCH_API_VERSION\s+value: "2020\.1"/
  );
  assert.match(
    configuration,
    /- key: PINCH_RETURN_URL\s+value: https:\/\/veltact\.com\/api\/pinch\/return/
  );

  for (const key of [
    "PINCH_CLIENT_ID",
    "PINCH_SECRET_KEY",
    "PINCH_WEBHOOK_SECRET"
  ]) {
    assert.match(
      configuration,
      new RegExp(`- key: ${key}\\s+sync: false`)
    );
  }

  assert.doesNotMatch(configuration, /api\.getpinch\.com\.au\/live/);
  assert.doesNotMatch(configuration, /sk_live_/i);
});
