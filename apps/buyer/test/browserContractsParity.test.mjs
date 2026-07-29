import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  engagementSchema,
  paymentEvidenceSchema,
  supplierCommercialResponseSchema
} from "../public/assets/vendor/contracts/index.js";

const compiledContractsUrl = new URL(
  "../../../packages/contracts/dist/index.js",
  import.meta.url
);
const browserContractsUrl = new URL(
  "../public/assets/vendor/contracts/index.js",
  import.meta.url
);

test("browser contracts are byte-for-byte current with the compiled package", async () => {
  const [compiledContracts, browserContracts] = await Promise.all([
    readFile(compiledContractsUrl, "utf8"),
    readFile(browserContractsUrl, "utf8")
  ]);

  assert.equal(browserContracts, compiledContracts);
});

test("browser engagement parsing retains explicit payment provenance", () => {
  const engagement = engagementSchema.parse({
    id: "engagement-123",
    needProfileId: "need-123",
    supplierId: "supplier-123",
    supplierResponseId: "response-123",
    status: "supplier_secured",
    paymentStatus: "paid",
    localDemoPaymentId: "demo_local_demo_link_engagement-123",
    paymentEvidenceProvider: "local_demo",
    paymentEvidenceSource: "local_demo",
    paymentEvidenceAuthoritative: false,
    securedAt: "2026-07-28T00:00:00.000Z",
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z"
  });

  assert.equal(
    engagement.localDemoPaymentId,
    "demo_local_demo_link_engagement-123"
  );
  assert.equal(engagement.paymentEvidenceProvider, "local_demo");
  assert.equal(engagement.paymentEvidenceSource, "local_demo");
  assert.equal(engagement.paymentEvidenceAuthoritative, false);
});

test("browser commercial and payment schemas enforce the new discriminants", () => {
  const declined = supplierCommercialResponseSchema.parse({
    id: "response-123",
    needProfileId: "need-123",
    supplierLeadId: "lead-123",
    decision: "cannot_help",
    declineReason: "Outside our current service window.",
    assumptions: [],
    conditions: [],
    submittedAt: "2026-07-28T00:00:00.000Z"
  });
  assert.equal(declined.decision, "cannot_help");
  assert.equal(declined.supplierProfileId, undefined);

  const localEvidence = paymentEvidenceSchema.parse({
    id: "evidence-123",
    projectId: "project-123",
    milestoneId: "milestone-123",
    provider: "local_demo",
    eventId: "local-demo:project-123:milestone-123",
    eventType: "local-demo-payment",
    paymentStatus: "paid",
    authoritative: false,
    receivedAt: "2026-07-28T00:00:00.000Z",
    metadata: {}
  });
  assert.equal(localEvidence.authoritative, false);

  assert.throws(() =>
    paymentEvidenceSchema.parse({
      ...localEvidence,
      authoritative: true
    })
  );
});
