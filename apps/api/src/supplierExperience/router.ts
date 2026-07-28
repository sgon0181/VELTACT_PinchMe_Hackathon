import { Router } from "express";
import type { Request, Response } from "express";
import {
  getInvitation,
  getNeed,
  getResponseForInvitation,
  getSupplierClaim,
  getEngagement,
  isBuyerAuthorised,
  listSupplierLeadsForNeed
} from "../marketplace/store.js";
import { getCommitmentNotification } from "./commitmentNotification.js";
import {
  buildSupplierQuotePdf,
  buildSupplierRfqPdf,
  type SupplierDocumentContext
} from "./supplierDocuments.js";

export const supplierExperienceRouter = Router();

supplierExperienceRouter.get(
  "/supplier-invitations/:token/rfq.pdf",
  (request, response) => {
    const context = documentContext(request.params.token);
    if (!context) {
      response.status(404).json({
        status: "error",
        message: "Supplier invitation not found"
      });
      return;
    }
    if (
      context.invitation.status === "expired" ||
      Date.parse(context.invitation.expiresAt) <= Date.now()
    ) {
      response.status(410).json({
        status: "error",
        message: "Supplier invitation has expired"
      });
      return;
    }
    if (context.invitation.status === "cancelled") {
      response.status(409).json({
        status: "error",
        message: "Supplier invitation is closed"
      });
      return;
    }

    sendPdf(response, buildSupplierRfqPdf(context));
  }
);

supplierExperienceRouter.get(
  "/supplier-invitations/:token/quote.pdf",
  (request, response) => {
    const context = documentContext(request.params.token);
    if (!context) {
      response.status(404).json({
        status: "error",
        message: "Supplier invitation not found"
      });
      return;
    }
    if (!context.response) {
      response.status(409).json({
        status: "error",
        message: "Submit a supplier response before downloading its quote summary"
      });
      return;
    }

    sendPdf(response, buildSupplierQuotePdf(context));
  }
);

supplierExperienceRouter.get(
  "/engagements/:engagementId/commitment-notification",
  (request, response) => {
    const engagement = getEngagement(request.params.engagementId);
    if (!engagement) {
      response.status(404).json({
        status: "error",
        message: "Engagement not found"
      });
      return;
    }
    if (!requireBuyerAccess(request, response, engagement.needId)) return;

    const commitmentNotification = getCommitmentNotification(engagement.id);
    if (!commitmentNotification) {
      response.status(404).json({
        status: "error",
        message: "Commitment notification is not available"
      });
      return;
    }
    response.json({ commitmentNotification });
  }
);

function documentContext(
  token: string
): SupplierDocumentContext | undefined {
  const invitation = getInvitation(token);
  const need = invitation ? getNeed(invitation.needId) : undefined;
  if (!invitation || !need) return undefined;
  const response = getResponseForInvitation(invitation.id);
  const claim = getSupplierClaim(token);
  const match = need.matches.find(
    (candidate) => candidate.supplier.id === invitation.supplierId
  );
  const lead = listSupplierLeadsForNeed(need.id).find(
    (candidate) => candidate.id === invitation.supplierId
  );
  const sourceDisclosure =
    lead?.sourceMode === "fixture"
      ? "Matched from labelled deterministic fixture evidence. The supplier record is fictional and is not a verified business."
      : lead?.sourceMode === "live"
        ? "Matched from buyer-reviewed public supplier evidence. Relevance is not identity, licence, insurance, KYC or availability verification."
        : "Matched from Veltact's reviewed supplier catalogue. Relevance is not identity, licence, KYC or availability verification.";

  return {
    invitation,
    need,
    claim,
    response,
    matchReasons: match?.explanation ?? lead?.matchReasons ?? [],
    sourceDisclosure
  };
}

function sendPdf(
  response: Response,
  document: { body: Buffer; filename: string }
) {
  response.setHeader("Content-Type", "application/pdf");
  response.setHeader(
    "Content-Disposition",
    `attachment; filename="${document.filename}"`
  );
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("Content-Length", String(document.body.length));
  response.send(document.body);
}

function requireBuyerAccess(
  request: Request,
  response: Response,
  needProfileId: string
) {
  if (
    isBuyerAuthorised(
      needProfileId,
      request.header("x-veltact-buyer-token")
    )
  ) {
    return true;
  }
  response.status(404).json({
    status: "error",
    message: "Resource not found"
  });
  return false;
}
