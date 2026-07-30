import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mainBundle = await readFile(
  new URL("../public/assets/main.js", import.meta.url),
  "utf8"
);
const styles = await readFile(
  new URL("../public/styles.css", import.meta.url),
  "utf8"
);

test("renders the supplier bench as a read-only, accessible workspace view", () => {
  assert.match(mainBundle, /data-open-registry>Your suppliers/);
  assert.match(mainBundle, /Your supplier bench builds itself as you use Veltact\./);
  assert.match(mainBundle, /role="table" aria-label="Your suppliers"/);
  assert.match(mainBundle, /Labelled demo fixture/);
  assert.match(styles, /\.registry-table/);
  assert.match(styles, /\.registry-state-secured/);
});

test("keeps discovery evidence and the supplier-consent boundary visible", () => {
  assert.match(mainBundle, /Public discovery evidence/);
  assert.match(
    mainBundle,
    /Public evidence produced this candidate\. It is not a verified or enrolled supplier\./
  );
  assert.match(mainBundle, /candidate-source-list/);
});

test("loads the buyer-scoped registry with the capability token", async () => {
  globalThis.window = {
    location: { origin: "https://buyer.veltact.example" }
  };
  const { RapidMatchService } = await import(
    `../public/assets/rapidMatchService.js?registry=${Date.now()}`
  );
  const service = new RapidMatchService();
  service.setBuyerAccessToken("need-123", "buyer-token-123");
  globalThis.fetch = async (url, init) => {
    assert.equal(
      url,
      "https://buyer.veltact.example/api/registry?needProfileId=need-123"
    );
    assert.equal(init.method, "GET");
    assert.equal(
      init.headers.get("x-veltact-buyer-token"),
      "buyer-token-123"
    );
    return new Response(
      JSON.stringify({
        schemaVersion: 1,
        entries: [],
        summary: {
          total: 0,
          discovered: 0,
          contacted: 0,
          responded: 0,
          secured: 0,
          delivered: 0
        }
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );
  };

  const registry = await service.loadSupplierRegistry("need-123");
  assert.equal(registry.schemaVersion, 1);
  assert.equal(registry.summary.total, 0);
});
