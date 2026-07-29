import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { after, before, test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../.."
);

let server: ReturnType<typeof createServer>;
let baseUrl: string;
let configuredAccountDataFile: string;

before(async () => {
  configuredAccountDataFile = path.join(
    tmpdir(),
    `veltact-account-health-${process.pid}.json`
  );
  process.env.NODE_ENV = "test";
  process.env.PAYMENT_PROVIDER = "local_demo";
  process.env.ACCOUNT_DATA_FILE = configuredAccountDataFile;
  const { app } = await import("../app.js");
  server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(
  () =>
    new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    })
);

test("reports account credential persistence readiness", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  const health = (await response.json()) as {
    readiness: { accountPersistence?: boolean };
  };
  assert.equal(health.readiness.accountPersistence, true);
  const { env } = await import("../env.js");
  assert.equal(env.ACCOUNT_DATA_FILE, configuredAccountDataFile);
});

test("keeps the Render free-tier account store explicitly ephemeral", async () => {
  const renderConfiguration = await readFile(
    path.join(repositoryRoot, "render.yaml"),
    "utf8"
  );
  assert.match(renderConfiguration, /plan: free/);
  assert.doesNotMatch(renderConfiguration, /^\s+disk:/m);
  assert.doesNotMatch(
    renderConfiguration,
    /- key: ACCOUNT_DATA_FILE\s+value: \/var\/data\/veltact\/accounts\.json/
  );
});
