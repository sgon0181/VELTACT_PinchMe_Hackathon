import assert from "node:assert/strict";
import { createServer } from "node:http";
import { afterEach, describe, test } from "node:test";
import { app } from "../app.js";
import {
  approveSupplierOutreachForNeed,
  claimSupplierInvitation,
  createNeed,
  resetMarketplaceStore,
  submitSupplierResponse
} from "../marketplace/store.js";
import {
  buildSupplierQuotePdf,
  buildSupplierRfqPdf,
  type SupplierDocumentContext
} from "./supplierDocuments.js";

afterEach(() => {
  resetMarketplaceStore();
});

describe("token-scoped supplier PDF documents", () => {
  test("renders useful RFQ and quote PDFs without embedding the invitation token", () => {
    const context = documentContext();
    const rfq = buildSupplierRfqPdf(context);
    const quote = buildSupplierQuotePdf(context);
    const rfqText = rfq.body.toString("ascii");
    const quoteText = quote.body.toString("ascii");

    assert.match(rfqText, /^%PDF-1\.4/);
    assert.match(rfqText, /Private request for quote/);
    assert.match(rfqText, /PLC diagnostics/);
    assert.doesNotMatch(rfqText, /private-token-123/);
    assert.match(rfq.filename, /rfq\.pdf$/);

    assert.match(quoteText, /^%PDF-1\.4/);
    assert.match(quoteText, /Supplier quote summary/);
    assert.match(quoteText, /Indicative price/);
    assert.match(quoteText, /No safeguard bypass/);
    assert.doesNotMatch(quoteText, /private-token-123/);
    assert.doesNotMatch(quoteText, /supplier has been paid|payout complete/i);
  });

  test("serves and protects canonical PDF routes through the real app", async () => {
    const need = createNeed({
      buyerEmail: "buyer@example.com",
      profile: documentContext().need.profile
    });
    assert.ok(approveSupplierOutreachForNeed(need.id));
    const invitation = need.invitations[0];
    const server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}/api/supplier-invitations/${encodeURIComponent(
      invitation.token
    )}`;

    try {
      const rfq = await fetch(`${baseUrl}/rfq.pdf`);
      assert.equal(rfq.status, 200);
      assert.equal(rfq.headers.get("content-type"), "application/pdf");
      assert.match(
        rfq.headers.get("content-disposition") ?? "",
        /attachment; filename=.*-rfq\.pdf/
      );

      const quoteBeforeResponse = await fetch(`${baseUrl}/quote.pdf`);
      assert.equal(quoteBeforeResponse.status, 409);

      const claim = claimSupplierInvitation(invitation.token, {
        claimantName: "Supplier Contact",
        claimantEmail: "supplier@example.com"
      });
      assert.equal(claim.status, "claimed");
      const submitted = submitSupplierResponse(invitation.token, {
        canHelp: true,
        earliestAvailability: "2026-07-30",
        indicativePriceAud: 4200,
        relevantExperience: "Siemens PLC conveyor recovery.",
        proposedApproach: "Review evidence then attend site.",
        assumptions: ["Current PLC backup is available."],
        conditions: ["Four-hour minimum callout."]
      });
      assert.equal(submitted.status, "submitted");

      const quote = await fetch(`${baseUrl}/quote.pdf`);
      assert.equal(quote.status, 200);
      assert.equal(quote.headers.get("content-type"), "application/pdf");
      assert.match(
        quote.headers.get("content-disposition") ?? "",
        /quote-summary\.pdf/
      );

      const unknownRfq = await fetch(
        `${baseUrl.replace(invitation.token, "unknown-token")}/rfq.pdf`
      );
      const unknownQuote = await fetch(
        `${baseUrl.replace(invitation.token, "unknown-token")}/quote.pdf`
      );
      assert.equal(unknownRfq.status, 404);
      assert.equal(unknownQuote.status, 404);

      invitation.status = "cancelled";
      const cancelledRfq = await fetch(`${baseUrl}/rfq.pdf`);
      const cancelledQuote = await fetch(`${baseUrl}/quote.pdf`);
      assert.equal(cancelledRfq.status, 409);
      assert.equal(cancelledQuote.status, 409);

      invitation.status = "responded";
      invitation.expiresAt = new Date(Date.now() - 1_000).toISOString();
      const expiredRfq = await fetch(`${baseUrl}/rfq.pdf`);
      const expiredQuote = await fetch(`${baseUrl}/quote.pdf`);
      assert.equal(expiredRfq.status, 410);
      assert.equal(expiredQuote.status, 410);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

function documentContext(): SupplierDocumentContext {
  const now = "2026-07-28T00:00:00.000Z";
  return {
    invitation: {
      id: "invitation-123",
      token: "private-token-123",
      needId: "need-123",
      needProfileId: "need-123",
      supplierId: "supplier-123",
      supplierName: "Western Sydney Controls",
      matchId: "match-123",
      responseUrl:
        "https://demo.veltact.test/supplier.html?token=private-token-123",
      status: "responded",
      sentAt: now,
      respondedAt: now,
      expiresAt: "2026-08-01T00:00:00.000Z",
      createdAt: now,
      updatedAt: now
    },
    need: {
      id: "need-123",
      buyerEmail: "buyer@example.com",
      buyerAccessTokenHash: "buyer-token-hash",
      profile: {
        title: "Packaging conveyor PLC recovery",
        description:
          "Recover the stopped Siemens PLC-controlled packaging conveyor.",
        category: "Industrial automation",
        industry: "Food manufacturing",
        location: "Western Sydney, NSW",
        urgencyDays: 1,
        budgetAud: 4200,
        requiredCapabilities: ["PLC diagnostics", "Conveyor recovery"]
      },
      matches: [],
      invitations: [],
      status: "responses_open",
      createdAt: now,
      updatedAt: now
    },
    claim: {
      id: "claim-123",
      invitationId: "invitation-123",
      supplierLeadId: "supplier-123",
      token: "private-token-123",
      expiresAt: "2026-08-01T00:00:00.000Z",
      claimantName: "Supplier Contact",
      claimantEmail: "supplier@example.com",
      status: "claimed",
      claimedAt: now,
      createdAt: now,
      updatedAt: now
    },
    response: {
      id: "response-123",
      needId: "need-123",
      needProfileId: "need-123",
      supplierId: "supplier-123",
      supplierName: "Western Sydney Controls",
      invitationId: "invitation-123",
      decision: "can_help",
      canHelp: true,
      earliestAvailability: "2026-07-30",
      availability: "2026-07-30",
      indicativePriceAud: 4200,
      indicativePrice: { amount: 420000, currency: "AUD" },
      relevantExperience: "Siemens PLC conveyor recovery.",
      proposedApproach: "Review evidence then attend site.",
      assumptions: ["Current PLC backup is available."],
      conditions: ["No safeguard bypass."],
      status: "submitted",
      submittedAt: now,
      createdAt: now,
      updatedAt: now
    },
    matchReasons: ["Siemens PLC and conveyor experience."],
    sourceDisclosure:
      "Matched from reviewed catalogue evidence; relevance is not verification."
  };
}
