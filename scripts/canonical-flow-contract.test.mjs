import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  rapidMatchApiRoute,
  sendSupplierInvitationsRequestSchema
} from "@veltact/contracts";

const repositoryRoot = new URL("../", import.meta.url);

async function repositoryFile(path) {
  return readFile(new URL(path, repositoryRoot), "utf8");
}

test("canonical public surfaces do not link to migration-only applications", async () => {
  const [landing, buyer, supplier, signIn, createAccount] = await Promise.all([
    repositoryFile("apps/buyer/public/landing.html"),
    repositoryFile("apps/buyer/public/index.html"),
    repositoryFile("apps/buyer/public/supplier.html"),
    repositoryFile("apps/buyer/public/signin.html"),
    repositoryFile("apps/buyer/public/create-account.html")
  ]);

  assert.match(buyer, /src="\.\/assets\/main\.js/);
  assert.match(supplier, /src="\.\/supplier\.js/);
  assert.match(landing, /href="\.\/index\.html\?start=new"/);
  assert.match(signIn, /href="\.\/index\.html\?start=new"/);
  assert.match(createAccount, /href="\.\/index\.html\?start=new"/);

  for (const surface of [landing, buyer, supplier, signIn, createAccount]) {
    assert.doesNotMatch(surface, /(?:href|src)="[^"]*(?:v2|supplier-claim)/i);
  }
});

test("shared outreach contract supports combined email and SMS plus link-only generation", () => {
  assert.deepEqual(
    sendSupplierInvitationsRequestSchema.parse({
      supplierLeadIds: ["supplier-a", "supplier-b"],
      deliveryChannels: ["email", "sms"]
    }),
    {
      supplierLeadIds: ["supplier-a", "supplier-b"],
      deliveryChannels: ["email", "sms"]
    }
  );

  assert.deepEqual(
    sendSupplierInvitationsRequestSchema.parse({
      supplierLeadIds: ["supplier-a"],
      deliveryChannels: []
    }),
    {
      supplierLeadIds: ["supplier-a"],
      deliveryChannels: []
    }
  );
});

test("canonical route names remain in the RapidMatch namespace", () => {
  assert.equal(
    rapidMatchApiRoute.createNeedProfile,
    "/api/need-profiles"
  );
  assert.equal(
    rapidMatchApiRoute.sendInvitations,
    "/api/need-profiles/:needProfileId/invitations/send"
  );
  assert.equal(
    rapidMatchApiRoute.createEngagement,
    "/api/need-profiles/:needProfileId/engagements"
  );

  for (const route of Object.values(rapidMatchApiRoute)) {
    assert.doesNotMatch(route, /\/api\/v2\//);
  }
});

test("active documentation does not delegate authority to an archived charter", async () => {
  const [readme, product, blueprint] = await Promise.all([
    repositoryFile("README.md"),
    repositoryFile("docs/PRODUCT.md"),
    repositoryFile("docs/DEMO_BLUEPRINT.md")
  ]);

  assert.doesNotMatch(readme, /docs\/STAGING_DEMO_CHARTER\.md/);
  assert.match(product, /sole source of truth/i);
  assert.match(blueprint, /docs\/PRODUCT\.md` is authoritative/);
});
