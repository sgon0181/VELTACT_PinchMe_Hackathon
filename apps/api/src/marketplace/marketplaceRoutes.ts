import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import {
  marketplaceNeedProfileSchema,
  rapidMatchBuyerWorkspaceSchema,
  solutionDecisionTypeSchema
} from "@veltact/contracts";
import {
  approveSupplierOutreachForNeed,
  claimSupplierInvitation,
  consumeIssuedBuyerAccessToken,
  createEngagement,
  createNeed,
  createSolutionDecision,
  discoverNeedSuppliers,
  getEngagement,
  getEngagementForNeed,
  getDeployment,
  getNeed,
  getProviderWarningsForNeed,
  getResearchResultForNeed,
  getResponseForInvitation,
  getSolutionDecisionForNeed,
  getSupplierClaim,
  isBuyerAuthorised,
  listOutreachDeliveriesForNeed,
  listResponsesForNeed,
  listSupplierLeadsForNeed,
  markInvitationViewed,
  prepareSupplierLeadInvitationsForNeed,
  recordAuthoritativePinchPayment,
  researchNeed,
  resetMarketplaceStore,
  seedMarketplaceDemoFindState,
  sendSupplierOutreachForNeed,
  submitSupplierResponse
} from "./store.js";
import {
  emitDeploymentUpdated,
  emitEngagementSecured,
  emitOutreachDeliveryUpdated,
  emitPaymentStatusUpdated,
  emitSupplierInvitationUpdated,
  emitSupplierResponseSubmitted
} from "../realtime.js";
import { marketplaceDeploymentIntegration } from "../deployment/marketplaceIntegration.js";
import { env } from "../env.js";
import { PinchApiError } from "../pinch/pinchClient.js";
import {
  CommitmentPaymentError,
  createLocalDemoPaymentEvidence
} from "../payments/commitmentPaymentService.js";
import { marketplaceCommitmentPaymentService } from "../payments/marketplaceCommitment.js";
import { getPaymentProvider } from "../payments/providerRegistry.js";
import {
  getSupplierDemoResponses,
  type SupplierDemoResponse
} from "./supplierDemoResponses.js";
import type {
  SupplierInvitation,
  SupplierResponse
} from "./types.js";

export const marketplaceRouter = Router();

const createNeedSchema = z.object({
  buyerEmail: z.string().trim().email(),
  profile: marketplaceNeedProfileSchema
});

const supplierResponseSchema = z.object({
  canHelp: z.boolean().optional(),
  decision: z.enum(["can_help", "cannot_help"]).optional(),
  earliestAvailability: z.string().trim().min(1),
  indicativePriceAud: z.coerce.number().int().nonnegative(),
  relevantExperience: z.string().trim().min(1),
  proposedApproach: z.string().trim().min(1).optional(),
  assumptions: z.array(z.string().trim().min(1)).default([]),
  conditions: z
    .union([
      z.string().trim().min(1),
      z.array(z.string().trim().min(1))
    ])
    .optional()
    .transform((value) =>
      value === undefined ? [] : Array.isArray(value) ? value : [value]
    )
})
  .superRefine((value, context) => {
    if (value.canHelp === undefined && value.decision === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["canHelp"],
        message: "canHelp or decision is required"
      });
    }
    if (
      value.canHelp !== undefined &&
      value.decision !== undefined &&
      value.canHelp !== (value.decision === "can_help")
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["decision"],
        message: "decision must agree with canHelp"
      });
    }
  })
  .transform((value) => ({
    ...value,
    canHelp: value.canHelp ?? (value.decision === "can_help")
  }));

const supplierClaimSchema = z.object({
  claimantName: z.string().trim().min(1).optional(),
  claimantEmail: z.string().trim().email().optional(),
  contactName: z.string().trim().min(1).optional(),
  contactEmail: z.string().trim().email().optional()
}).transform((value) => ({
  claimantName: value.claimantName ?? value.contactName,
  claimantEmail: value.claimantEmail ?? value.contactEmail
}));

const solutionDecisionSchema = z.object({
  decision: solutionDecisionTypeSchema,
  selectedApproachIds: z.array(z.string().trim().min(1)).min(1),
  buyerNote: z.string().trim().min(1).optional()
});

const demoResetSchema = z.object({
  scenario: z
    .enum(["plc", "robotics", "robotic-integration"])
    .default("robotics")
});

const createEngagementSchema = z.object({
  supplierResponseId: z.string().trim().min(1)
});

const sendInvitationsSchema = z.object({
  supplierLeadIds: z.array(z.string().trim().min(1)).min(1).optional()
});

marketplaceRouter.post("/needs", (request, response) => {
  const parsed = createNeedSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      status: "error",
      message: "Invalid need request",
      issues: parsed.error.flatten().fieldErrors
    });
    return;
  }

  const createdNeed = createNeed(parsed.data);
  response.status(201).json({
    need: serialiseNeed(createdNeed),
    buyerAccessToken: consumeIssuedBuyerAccessToken(createdNeed.id)
  });
});

marketplaceRouter.get("/needs/:needId", (request, response) => {
  const need = getNeed(request.params.needId);
  if (!need) {
    response.status(404).json({
      status: "error",
      message: "Need not found"
    });
    return;
  }
  if (!requireBuyerAccess(request, response, need.id)) return;

  response.json({
    need: serialiseNeed(need)
  });
});

marketplaceRouter.get("/supplier-invitations/:token", (request, response) => {
  const invitation = markInvitationViewed(request.params.token);
  if (!invitation) {
    response.status(404).json({
      status: "error",
      message: "Supplier invitation not found"
    });
    return;
  }

  emitSupplierInvitationUpdated(invitation);

  const need = getNeed(invitation.needId);
  const existingResponse = getResponseForInvitation(invitation.id);
  const supplierClaim = getSupplierClaim(request.params.token);
  const supplierLead = listSupplierLeadsForNeed(invitation.needId).find(
    (lead) => lead.id === invitation.supplierId
  );
  const supplierMatch = need?.matches.find(
    (match) => match.supplier.id === invitation.supplierId
  );
  response.json({
    invitation: {
      ...serialiseSupplierInvitation(invitation),
      needId: invitation.needId,
      supplierName: invitation.supplierName,
      openedAt: invitation.openedAt,
      respondedAt: invitation.respondedAt
    },
    supplierInvitation: serialiseSupplierInvitation(invitation),
    supplierClaim,
    claim: supplierClaim,
    supplierLead,
    supplierMatch: supplierMatch
      ? {
          id: `${invitation.needId}-${supplierMatch.id}`,
          needProfileId: invitation.needId,
          supplierId: supplierMatch.supplier.id,
          score: supplierMatch.score,
          reasons: supplierMatch.explanation,
          risks: supplierMatch.risks,
          status: supplierMatch.status,
          createdAt: supplierMatch.createdAt,
          updatedAt: supplierMatch.updatedAt
        }
      : undefined,
    supplierResponse: existingResponse ? serialiseSupplierResponse(existingResponse) : undefined,
    response: existingResponse,
    need: need ? serialiseSupplierNeed(need) : undefined
  });
});

marketplaceRouter.post("/need-profiles", (request, response) => {
  const parsed = createNeedSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      status: "error",
      message: "Invalid need request",
      issues: parsed.error.flatten().fieldErrors
    });
    return;
  }

  const createdNeed = createNeed(parsed.data);
  const need = serialiseNeed(createdNeed);
  response.status(201).json({
    needProfile: need,
    need,
    buyerAccessToken: consumeIssuedBuyerAccessToken(createdNeed.id)
  });
});

marketplaceRouter.post(
  "/need-profiles/:needProfileId/research",
  async (request, response) => {
    const need = getNeed(request.params.needProfileId);
    if (!need) {
      response.status(404).json({
        status: "error",
        message: "Need profile not found"
      });
      return;
    }
    if (!requireBuyerAccess(request, response, need.id)) return;

    try {
      const result = await researchNeed(need.id);
      if (!result) {
        response.status(404).json({
          status: "error",
          message: "Need profile not found"
        });
        return;
      }
      response.json({
        researchResult: result.researchResult,
        providerWarning: result.providerWarning,
        workspace: serialiseBuyerWorkspace(need)
      });
    } catch (error) {
      response.status(502).json({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Solution research provider failed"
      });
    }
  }
);

marketplaceRouter.post(
  "/need-profiles/:needProfileId/solution-decision",
  (request, response) => {
    const need = getNeed(request.params.needProfileId);
    if (!need) {
      response.status(404).json({
        status: "error",
        message: "Need profile not found"
      });
      return;
    }
    if (!requireBuyerAccess(request, response, need.id)) return;

    const parsed = solutionDecisionSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        status: "error",
        message: "Invalid solution decision",
        issues: parsed.error.flatten().fieldErrors
      });
      return;
    }

    const result = createSolutionDecision(need.id, parsed.data);
    if (result.status === "research_required") {
      response.status(409).json({
        status: "error",
        message: "Research must be completed before a solution decision"
      });
      return;
    }
    if (result.status === "invalid_approaches") {
      response.status(400).json({
        status: "error",
        message: "Select approaches from the current research result"
      });
      return;
    }
    if (result.status === "discovery_started") {
      response.status(409).json({
        status: "error",
        message: "The solution decision cannot change after supplier discovery"
      });
      return;
    }
    if (result.status === "not_found") {
      response.status(404).json({
        status: "error",
        message: "Need profile not found"
      });
      return;
    }

    response.json({
      solutionDecision: result.solutionDecision,
      workspace: serialiseBuyerWorkspace(need)
    });
  }
);

marketplaceRouter.post(
  "/need-profiles/:needProfileId/suppliers/discover",
  async (request, response) => {
    const need = getNeed(request.params.needProfileId);
    if (!need) {
      response.status(404).json({
        status: "error",
        message: "Need profile not found"
      });
      return;
    }
    if (!requireBuyerAccess(request, response, need.id)) return;

    try {
      const result = await discoverNeedSuppliers(need.id);
      if (result.status === "research_required") {
        response.status(409).json({
          status: "error",
          message: "Research must be completed before supplier discovery"
        });
        return;
      }
      if (result.status === "decision_required") {
        response.status(409).json({
          status: "error",
          message: "Approve a solution decision before supplier discovery"
        });
        return;
      }
      if (result.status === "external_path_required") {
        response.status(409).json({
          status: "error",
          message:
            "Supplier discovery requires an outsource or hybrid solution decision"
        });
        return;
      }
      if (result.status === "not_found") {
        response.status(404).json({
          status: "error",
          message: "Need profile not found"
        });
        return;
      }

      response.json({
        supplierLeads: result.supplierLeads,
        discoveredSuppliers: result.supplierLeads,
        providerWarning: result.providerWarning,
        workspace: serialiseBuyerWorkspace(need)
      });
    } catch (error) {
      response.status(502).json({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Supplier discovery provider failed"
      });
    }
  }
);

marketplaceRouter.get("/need-profiles/:needProfileId", (request, response) => {
  const need = getNeed(request.params.needProfileId);
  if (!need) {
    response.status(404).json({
      status: "error",
      message: "Need profile not found"
    });
    return;
  }
  if (!requireBuyerAccess(request, response, need.id)) return;

  const legacyNeed = serialiseNeed(need);
  const workspace = serialiseBuyerWorkspace(need);
  response.json({
    needProfile: legacyNeed,
    need: legacyNeed,
    workspace,
    phase: workspace.phase,
    status: workspace.status,
    nextAction: workspace.nextAction,
    intakeEvidence: workspace.intakeEvidence,
    researchResult: workspace.researchResult,
    solutionDecision: workspace.solutionDecision,
    discoveredSuppliers: workspace.discoveredSuppliers,
    suppliers: workspace.suppliers,
    matches: workspace.matches,
    invitations: workspace.invitations,
    outreachDeliveries: workspace.outreachDeliveries,
    responses: workspace.responses,
    engagement: workspace.engagement,
    deployment: workspace.deployment,
    providerWarnings: getProviderWarningsForNeed(need.id)
  });
});

marketplaceRouter.get("/need-profiles/:needProfileId/responses", (request, response) => {
  if (!requireBuyerAccess(request, response, request.params.needProfileId)) return;
  const supplierResponses = listResponsesForNeed(request.params.needProfileId);
  if (!supplierResponses) {
    response.status(404).json({
      status: "error",
      message: "Need profile not found"
    });
    return;
  }

  response.json({
    supplierResponses: supplierResponses.map(serialiseSupplierResponse),
    responses: supplierResponses
  });
});

marketplaceRouter.post("/need-profiles/:needProfileId/invitations/send", async (request, response) => {
  const need = getNeed(request.params.needProfileId);
  if (!need) {
    response.status(404).json({
      status: "error",
      message: "Need profile not found"
    });
    return;
  }
  if (!requireBuyerAccess(request, response, need.id)) return;

  const solutionDecision = getSolutionDecisionForNeed(need.id);
  if (solutionDecision?.decision === "local_trial") {
    response.status(409).json({
      status: "error",
      message: "Outreach requires an outsource or hybrid solution decision"
    });
    return;
  }
  const parsed = sendInvitationsSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({
      status: "error",
      message: "Invalid supplier outreach approval",
      issues: parsed.error.flatten().fieldErrors
    });
    return;
  }
  const prepared = prepareSupplierLeadInvitationsForNeed(
    need.id,
    parsed.data.supplierLeadIds
  );
  if (prepared.status === "invalid_leads") {
    response.status(400).json({
      status: "error",
      message: "One or more supplier leads were not found for this need"
    });
    return;
  }
  if (prepared.status === "invalid_lifecycle") {
    response.status(409).json({
      status: "error",
      message: "One or more supplier leads cannot be invited from their current state"
    });
    return;
  }
  if (prepared.status === "not_found") {
    response.status(404).json({
      status: "error",
      message: "Need profile not found"
    });
    return;
  }
  approveSupplierOutreachForNeed(need.id);
  const updatedDeliveries = await sendSupplierOutreachForNeed(
    request.params.needProfileId,
    (delivery) => {
      emitOutreachDeliveryUpdated(
        request.params.needProfileId,
        serialiseOutreachDelivery(delivery)
      );
    },
    prepared.supplierLeadIds.length > 0
      ? new Set(prepared.supplierLeadIds)
      : undefined
  );
  if (!updatedDeliveries) {
    response.status(404).json({
      status: "error",
      message: "Need profile not found"
    });
    return;
  }

  const responseInvitations =
    prepared.invitations.length > 0
      ? prepared.invitations
      : need.invitations;
  const responseInvitationIds = new Set(
    responseInvitations.map((invitation) => invitation.id)
  );
  const deliveries = (
    listOutreachDeliveriesForNeed(request.params.needProfileId) ?? []
  ).filter((delivery) => responseInvitationIds.has(delivery.invitationId));
  response.json({
    supplierInvitations: responseInvitations.map(
      serialiseSupplierInvitation
    ),
    invitations: responseInvitations.map(serialiseLegacyInvitation),
    supplierOutreachDeliveries: deliveries.map(serialiseOutreachDelivery),
    workspace: serialiseBuyerWorkspace(need)
  });
});

marketplaceRouter.post("/need-profiles/:needProfileId/engagements", (request, response) => {
  if (!requireBuyerAccess(request, response, request.params.needProfileId)) return;
  const parsed = createEngagementSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      status: "error",
      message: "Invalid engagement request",
      issues: parsed.error.flatten().fieldErrors
    });
    return;
  }

  const result = createEngagement({
    needId: request.params.needProfileId,
    supplierResponseId: parsed.data.supplierResponseId
  });

  if (result.status === "not_found") {
    response.status(404).json({
      status: "error",
      message: "Need profile or supplier response not found"
    });
    return;
  }
  if (result.status === "not_selectable") {
    response.status(409).json({
      status: "error",
      message: "Only a submitted response from a supplier who can help may be selected"
    });
    return;
  }
  if (result.status === "already_selected") {
    response.status(409).json({
      status: "error",
      message: "A supplier has already been selected for this need"
    });
    return;
  }

  response.status(201).json({ engagement: serialiseEngagement(result.engagement) });
});

marketplaceRouter.get("/engagements/:engagementId", async (request, response) => {
  let engagement = getEngagement(request.params.engagementId);
  if (!engagement) {
    response.status(404).json({
      status: "error",
      message: "Engagement not found"
    });
    return;
  }
  if (!requireBuyerAccess(request, response, engagement.needId)) return;

  if (engagement.paymentStatus === "awaiting_payment" && engagement.paymentLinkId) {
    try {
      const approvedPayment = await getPaymentProvider().getApprovedPaymentForLink(
        engagement.paymentLinkId
      );
      if (approvedPayment) {
        const result = recordAuthoritativePinchPayment({
          eventId: `pinch-api:${approvedPayment.paymentId}`,
          eventType: "payment-api-reconciliation",
          engagementId: engagement.id,
          paymentId: approvedPayment.paymentId,
          payload: {
            paymentLinkId: engagement.paymentLinkId,
            paymentId: approvedPayment.paymentId,
            status: approvedPayment.status
          }
        });

        if (result.engagement) {
          engagement = result.engagement;
          if (!result.duplicate) {
            emitPaymentStatusUpdated(result.engagement);
            emitEngagementSecured(result.engagement);
            emitCurrentDeployment(result.engagement.id, result.engagement.needId);
          }
        }
      }
    } catch {
      // Keep the visible state pending if Pinch cannot be reached during a refresh.
    }
  }

  response.json({ engagement: serialiseEngagement(engagement) });
});

marketplaceRouter.post("/engagements/:engagementId/payment-link", async (request, response) => {
  try {
    const returnUrl = new URL(env.PINCH_RETURN_URL);
    returnUrl.pathname = `/api/pinch/return/${request.params.engagementId}`;
    returnUrl.search = "";
    returnUrl.hash = "";
    const result =
      await marketplaceCommitmentPaymentService.createOrReuseHostedPaymentLink(
        {
          engagementId: request.params.engagementId,
          buyerAccessToken: request.header("x-veltact-buyer-token"),
          returnUrl: returnUrl.toString()
        }
      );
    const engagement = getEngagement(request.params.engagementId);
    const deployment =
      await marketplaceDeploymentIntegration.service.getDeployment(
        request.params.engagementId,
        request.header("x-veltact-buyer-token")
      );

    response.status(result.reused ? 200 : 201).json({
      engagement: engagement ? serialiseEngagement(engagement) : undefined,
      hostedCheckoutUrl: result.paymentLink.hostedCheckoutUrl,
      reused: result.reused,
      commitmentMilestone: deployment?.milestones[0]
    });
  } catch (error) {
    if (error instanceof CommitmentPaymentError) {
      response.status(error.statusCode).json({
        status: "error",
        message: error.message
      });
      return;
    }
    if (error instanceof PinchApiError) {
      response.status(error.statusCode).json({
        status: "error",
        message: error.message,
        upstreamStatus: error.upstreamStatus,
        upstreamCode: error.upstreamCode
      });
      return;
    }

    response.status(500).json({
      status: "error",
      message: "Unexpected payment integration error"
    });
  }
});

marketplaceRouter.post("/engagements/:engagementId/demo-payment", (request, response) => {
  if (env.NODE_ENV === "production") {
    response.status(404).json({
      status: "error",
      message: "Demo payment is unavailable in production"
    });
    return;
  }

  const engagement = getEngagement(request.params.engagementId);
  if (!engagement) {
    response.status(404).json({
      status: "error",
      message: "Engagement not found"
    });
    return;
  }
  if (!requireBuyerAccess(request, response, engagement.needId)) return;

  if (engagement.paymentStatus !== "awaiting_payment" || !engagement.paymentLinkId) {
    response.status(409).json({
      status: "error",
      message: "Create a payment link before completing the demo payment"
    });
    return;
  }

  const result = recordAuthoritativePinchPayment({
    eventId: `demo-payment:${engagement.id}`,
    eventType: "demo-sandbox-payment",
    engagementId: engagement.id,
    paymentId: `demo_${engagement.paymentLinkId}`,
    payload: {
      paymentLinkId: engagement.paymentLinkId,
      status: "approved",
      source: "local_demo"
    }
  });

  if (!result.engagement) {
    response.status(404).json({
      status: "error",
      message: "Engagement not found"
    });
    return;
  }

  if (!result.duplicate) {
    emitPaymentStatusUpdated(result.engagement);
    emitEngagementSecured(result.engagement);
    emitCurrentDeployment(result.engagement.id, result.engagement.needId);
  }
  response.json({
    engagement: serialiseEngagement(result.engagement),
    paymentEvidence: createLocalDemoPaymentEvidence(env.NODE_ENV)
  });
});

marketplaceRouter.post("/supplier-invitations/:token/claim", (request, response) => {
  const parsed = supplierClaimSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({
      status: "error",
      message: "Invalid supplier claim",
      issues: parsed.error.flatten().fieldErrors
    });
    return;
  }

  const result = claimSupplierInvitation(
    request.params.token,
    parsed.data
  );
  if (result.status === "not_found") {
    response.status(404).json({
      status: "error",
      message: "Supplier invitation not found"
    });
    return;
  }
  if (result.status === "expired") {
    response.status(410).json({
      status: "error",
      message: "Supplier invitation has expired"
    });
    return;
  }
  if (result.status === "outreach_required") {
    response.status(409).json({
      status: "error",
      message: "Buyer-approved outreach is required before supplier claim"
    });
    return;
  }
  if (result.status === "closed") {
    response.status(409).json({
      status: "error",
      message: "Supplier responses are closed for this need"
    });
    return;
  }

  response.json({
    supplierClaim: result.supplierClaim,
    claim: result.supplierClaim
  });
});

marketplaceRouter.post("/supplier-invitations/:token/responses", (request, response) => {
  const parsed = supplierResponseSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      status: "error",
      message: "Invalid supplier response",
      issues: parsed.error.flatten().fieldErrors
    });
    return;
  }

  const result = submitSupplierResponse(request.params.token, parsed.data);
  if (result.status === "not_found") {
    response.status(404).json({
      status: "error",
      message: "Supplier invitation not found"
    });
    return;
  }
  if (result.status === "expired") {
    response.status(410).json({
      status: "error",
      message: "Supplier invitation has expired"
    });
    return;
  }
  if (result.status === "not_claimed") {
    response.status(409).json({
      status: "error",
      message: "Claim this supplier invitation before submitting a response"
    });
    return;
  }
  if (result.status === "closed") {
    response.status(409).json({
      status: "error",
      message: "Supplier responses are closed for this need"
    });
    return;
  }

  const supplierResponse = result.supplierResponse;

  emitSupplierResponseSubmitted(supplierResponse);

  response.status(201).json({
    supplierResponse: serialiseSupplierResponse(supplierResponse),
    response: supplierResponse
  });
});

marketplaceRouter.get("/needs/:needId/responses", (request, response) => {
  if (!requireBuyerAccess(request, response, request.params.needId)) return;
  const supplierResponses = listResponsesForNeed(request.params.needId);
  if (!supplierResponses) {
    response.status(404).json({
      status: "error",
      message: "Need not found"
    });
    return;
  }

  response.json({
    supplierResponses: supplierResponses.map(serialiseSupplierResponse),
    responses: supplierResponses
  });
});

marketplaceRouter.post("/demo/reset", (request, response) => {
  if (env.NODE_ENV === "production") {
    response.status(404).json({
      status: "error",
      message: "Demo reset is unavailable in production"
    });
    return;
  }

  const parsed = demoResetSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({
      status: "error",
      message: "Invalid demo reset scenario",
      issues: parsed.error.flatten().fieldErrors
    });
    return;
  }

  const scenario = parsed.data.scenario === "plc" ? "plc" : "robotics";
  resetMarketplaceStore({ preserveAudit: true });
  const createdNeed = createNeed({
    buyerEmail:
      scenario === "robotics"
        ? "projects@demo-packaging.example"
        : "maintenance@demo-packaging.example",
    profile: demoNeedProfile(scenario)
  });
  const buyerAccessToken = consumeIssuedBuyerAccessToken(createdNeed.id);
  const seeded = seedMarketplaceDemoFindState(createdNeed.id);
  const prepared = prepareSupplierLeadInvitationsForNeed(createdNeed.id);
  approveSupplierOutreachForNeed(createdNeed.id);
  const demoSubmissions =
    prepared.status === "prepared"
      ? submitSupplierDemoFixtures(
          prepared.invitations,
          getSupplierDemoResponses(scenario)
        )
      : undefined;
  const workspace = serialiseBuyerWorkspace(createdNeed);
  const supplierPaths =
    demoSubmissions?.map(({ fixture, invitation, supplierResponse }) => ({
      invitationId: invitation.id,
      supplierId: invitation.supplierId,
      supplierName: invitation.supplierName,
      token: invitation.token,
      responseUrl: invitation.responseUrl,
      sourceMode: "fixture" as const,
      deliveryStatus: "not_sent" as const,
      fixtureKey: fixture.key,
      fixtureLabel: fixture.label,
      fixtureCompanyName: fixture.company.companyName,
      evidenceLabel: fixture.evidenceLabel,
      tradeOff: fixture.tradeOff,
      supplierResponseId: supplierResponse.id
    })) ?? [];

  if (
    !seeded ||
    prepared.status !== "prepared" ||
    !demoSubmissions ||
    !buyerAccessToken ||
    supplierPaths.length < 2
  ) {
    response.status(500).json({
      status: "error",
      message: "Canonical demo workspace could not be created"
    });
    return;
  }

  response.json({
    reset: true,
    scenario,
    sourceMode: "fixture",
    needProfileId: createdNeed.id,
    buyerAccessToken,
    buyerUrl: new URL(
      `/index.html?needId=${encodeURIComponent(createdNeed.id)}&accessToken=${encodeURIComponent(buyerAccessToken)}`,
      env.PUBLIC_BASE_URL
    ).toString(),
    workspace,
    supplierPaths,
    supplierInvitationPaths: supplierPaths
  });
});

function submitSupplierDemoFixtures(
  invitations: SupplierInvitation[],
  fixtures: SupplierDemoResponse[]
):
  | Array<{
      fixture: SupplierDemoResponse;
      invitation: SupplierInvitation;
      supplierResponse: SupplierResponse;
    }>
  | undefined {
  if (invitations.length < fixtures.length) {
    return undefined;
  }

  const submissions: Array<{
    fixture: SupplierDemoResponse;
    invitation: SupplierInvitation;
    supplierResponse: SupplierResponse;
  }> = [];
  for (const [index, fixture] of fixtures.entries()) {
    const invitation = invitations[index];
    const claim = claimSupplierInvitation(invitation.token, {
      claimantName: fixture.company.contactName,
      claimantEmail: fixture.company.contactEmail
    });
    if (claim.status !== "claimed") {
      return undefined;
    }

    const submission = submitSupplierResponse(
      invitation.token,
      fixture.response
    );
    if (submission.status !== "submitted") {
      return undefined;
    }
    submissions.push({
      fixture,
      invitation,
      supplierResponse: submission.supplierResponse
    });
  }
  return submissions;
}

function requireBuyerAccess(request: Request, response: Response, needId: string) {
  if (isBuyerAuthorised(needId, request.header("x-veltact-buyer-token"))) {
    return true;
  }

  response.status(401).json({
    status: "error",
    message: "Buyer access token is required for this requirement"
  });
  return false;
}

function serialiseNeed(need: NonNullable<ReturnType<typeof getNeed>>) {
  const needProfile = serialiseNeedProfile(need);
  const supplierMatches = need.matches.map((match) => ({
    id: `${need.id}-${match.id}`,
    needProfileId: need.id,
    supplierId: match.supplier.id,
    score: match.score,
    reasons: match.explanation,
    risks: match.risks,
    status: match.status,
    createdAt: match.createdAt,
    updatedAt: match.updatedAt
  }));
  const supplierInvitations = need.invitations.map(serialiseSupplierInvitation);

  return {
    id: need.id,
    buyerEmail: need.buyerEmail,
    profile: need.profile,
    createdAt: need.createdAt,
    updatedAt: need.updatedAt,
    status: need.status,
    needProfile,
    supplierMatches,
    supplierInvitations,
    supplierOutreachDeliveries: listOutreachDeliveriesForNeed(need.id)?.map(serialiseOutreachDelivery) ?? [],
    suppliers: need.matches.map((match) => ({
      id: match.supplier.id,
      companyName: match.supplier.companyName,
      contactEmail: match.supplier.contactEmail,
      categories: match.supplier.categories,
      serviceRegions: match.supplier.serviceRegions,
      capabilities: match.supplier.capabilities,
      verified: match.supplier.verified,
      verificationStatus: match.supplier.verificationStatus,
      verificationSource: match.supplier.verificationSource,
      verifiedAt: match.supplier.verifiedAt,
      createdAt: match.supplier.createdAt,
      updatedAt: match.supplier.updatedAt
    })),
    matches: need.matches.map((match) => ({
      id: `${need.id}-${match.id}`,
      needProfileId: need.id,
      supplierId: match.supplier.id,
      supplierName: match.supplier.companyName,
      score: match.score,
      explanation: match.explanation,
      reasons: match.explanation,
      risks: match.risks,
      status: match.status,
      createdAt: match.createdAt,
      updatedAt: match.updatedAt
    })),
    invitations: need.invitations.map(serialiseLegacyInvitation)
  };
}

function serialiseBuyerWorkspace(
  need: NonNullable<ReturnType<typeof getNeed>>
) {
  const responses = listResponsesForNeed(need.id) ?? [];
  const engagement = getEngagementForNeed(need.id);
  const journey = determineJourneyProjection(need, responses, engagement);
  const discoveredSuppliers = listSupplierLeadsForNeed(need.id);
  const discoveredSupplierIds = new Set(
    discoveredSuppliers.map((lead) => lead.id)
  );
  const canonicalInvitations =
    discoveredSupplierIds.size > 0
      ? need.invitations.filter((invitation) =>
          discoveredSupplierIds.has(invitation.supplierId)
        )
      : need.invitations;
  const canonicalInvitationIds = new Set(
    canonicalInvitations.map((invitation) => invitation.id)
  );

  return rapidMatchBuyerWorkspaceSchema.parse({
    ...journey,
    needProfile: serialiseNeedProfile(need),
    intakeEvidence: [],
    researchResult: getResearchResultForNeed(need.id),
    solutionDecision: getSolutionDecisionForNeed(need.id),
    discoveredSuppliers,
    suppliers: need.matches.map((match) => ({
      id: match.supplier.id,
      companyName: match.supplier.companyName,
      contactName: match.supplier.contactName,
      contactEmail: match.supplier.contactEmail,
      categories: match.supplier.categories,
      serviceRegions: match.supplier.serviceRegions,
      capabilities: match.supplier.capabilities,
      verified: match.supplier.verified,
      createdAt: match.supplier.createdAt,
      updatedAt: match.supplier.updatedAt
    })),
    matches: need.matches.map((match) => ({
      id: `${need.id}-${match.id}`,
      needProfileId: need.id,
      supplierId: match.supplier.id,
      score: match.score,
      reasons: match.explanation,
      risks: match.risks,
      status: match.status,
      createdAt: match.createdAt,
      updatedAt: match.updatedAt
    })),
    invitations: canonicalInvitations.map(serialiseSupplierInvitation),
    outreachDeliveries:
      listOutreachDeliveriesForNeed(need.id)
        ?.filter((delivery) =>
          canonicalInvitationIds.has(delivery.invitationId)
        )
        .map(serialiseOutreachDelivery) ?? [],
    responses: responses.map(serialiseSupplierResponse),
    engagement: engagement ? serialiseEngagement(engagement) : undefined,
    deployment: engagement ? getDeployment(engagement.id) : undefined
  });
}

function determineJourneyProjection(
  need: NonNullable<ReturnType<typeof getNeed>>,
  responses: SupplierResponse[],
  engagement: NonNullable<ReturnType<typeof getEngagementForNeed>> | undefined
) {
  if (engagement) {
    if (engagement.status === "supplier_secured") {
      return {
        phase: "deploy" as const,
        status: "supplier_secured" as const,
        nextAction: "track_delivery" as const
      };
    }
    if (engagement.paymentStatus === "awaiting_payment") {
      return {
        phase: "deploy" as const,
        status: "commitment_pending" as const,
        nextAction: "await_payment_confirmation" as const
      };
    }
    return {
      phase: "deploy" as const,
      status: "commitment_pending" as const,
      nextAction: "open_pinch_checkout" as const
    };
  }

  if (responses.length >= 2) {
    return {
      phase: "connect" as const,
      status: "supplier_selection" as const,
      nextAction: "compare_responses" as const
    };
  }
  if (responses.length === 1) {
    return {
      phase: "connect" as const,
      status: "supplier_responses" as const,
      nextAction: "await_responses" as const
    };
  }

  const decision = getSolutionDecisionForNeed(need.id);
  if (decision?.decision === "local_trial") {
    return {
      phase: "find" as const,
      status: "internal_plan_ready" as const,
      nextAction: "use_plan_internally" as const
    };
  }
  if (decision) {
    if (listSupplierLeadsForNeed(need.id).length === 0) {
      return {
        phase: "connect" as const,
        status: "supplier_matching" as const,
        nextAction: "find_specialist" as const
      };
    }
    if (!need.outreachApprovedAt) {
      return {
        phase: "connect" as const,
        status: "supplier_matching" as const,
        nextAction: "approve_outreach" as const
      };
    }
    const hasOutreachResult =
      listOutreachDeliveriesForNeed(need.id)?.some(
        (delivery) =>
          delivery.deliveryStatus !== "not_sent" ||
          Boolean(delivery.errorMessage)
      ) ?? false;
    return hasOutreachResult
      ? {
          phase: "connect" as const,
          status: "supplier_outreach" as const,
          nextAction: "await_responses" as const
        }
      : {
          phase: "connect" as const,
          status: "supplier_outreach" as const,
          nextAction: "send_invitations" as const
        };
  }
  if (getResearchResultForNeed(need.id)) {
    return {
      phase: "find" as const,
      status: "solution_review" as const,
      nextAction: "find_specialist" as const
    };
  }
  return {
    phase: "find" as const,
    status: "need_profile_review" as const,
    nextAction: "confirm_need_profile" as const
  };
}

function serialiseSupplierNeed(need: NonNullable<ReturnType<typeof getNeed>>) {
  return {
    id: need.id,
    profile: need.profile,
    status: need.status,
    createdAt: need.createdAt,
    updatedAt: need.updatedAt
  };
}

function serialiseOutreachDelivery(delivery: NonNullable<ReturnType<typeof listOutreachDeliveriesForNeed>>[number]) {
  return {
    invitationId: delivery.invitationId,
    supplierId: delivery.supplierId,
    channel: delivery.channel,
    destination: delivery.destination,
    deliveryStatus: delivery.deliveryStatus,
    sentAt: delivery.sentAt,
    errorMessage: delivery.errorMessage
  };
}

function serialiseNeedProfile(need: NonNullable<ReturnType<typeof getNeed>>) {
  return {
    id: need.id,
    companyName: inferCompanyName(need.buyerEmail),
    contactEmail: need.buyerEmail,
    title: need.profile.title,
    description: need.profile.problemSummary ?? need.profile.description,
    category: need.profile.category,
    location: need.profile.location,
    priority: toContractPriority(need.profile.buyerPriority, need.profile.urgencyDays),
    requiredBy: need.profile.urgencyDays === undefined ? undefined : requiredByLabel(need.profile.urgencyDays),
    budget:
      need.profile.budgetAud === undefined
        ? undefined
        : {
            amount: need.profile.budgetAud * 100,
            currency: "AUD"
          },
    mustHaves: [
      ...(need.profile.requiredCapability ?? need.profile.requiredCapabilities ?? []),
      ...equipmentOrTechnologyValues(need.profile)
    ],
    niceToHaves: ["Comparable supplier response", "Clear availability and commercial conditions"],
    constraints: [
      need.profile.industry,
      requiredByLabel(need.profile.urgencyDays),
      ...(need.profile.constraints ?? [])
    ].filter(
      (item): item is string => Boolean(item)
    ),
    status: need.status,
    createdAt: need.createdAt,
    updatedAt: need.updatedAt
  };
}

function serialiseSupplierInvitation(invitation: NonNullable<ReturnType<typeof markInvitationViewed>>) {
  return {
    id: invitation.id,
    needProfileId: invitation.needProfileId,
    supplierId: invitation.supplierId,
    matchId: invitation.matchId,
    token: invitation.token,
    responseUrl: invitation.responseUrl,
    status: invitation.status,
    sentAt: invitation.sentAt,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt
  };
}

function serialiseLegacyInvitation(invitation: NonNullable<ReturnType<typeof markInvitationViewed>>) {
  const legacyStatus = ["sent", "pending"].includes(invitation.status)
    ? "invited"
    : invitation.status === "opened"
      ? "viewed"
      : invitation.status;

  return {
    ...serialiseSupplierInvitation(invitation),
    needId: invitation.needId,
    supplierName: invitation.supplierName,
    status: legacyStatus,
    viewedAt: invitation.openedAt,
    respondedAt: invitation.respondedAt
  };
}

function serialiseSupplierResponse(supplierResponse: SupplierResponse) {
  return {
    id: supplierResponse.id,
    needProfileId: supplierResponse.needProfileId,
    supplierId: supplierResponse.supplierId,
    invitationId: supplierResponse.invitationId,
    decision: supplierResponse.decision,
    availability: supplierResponse.availability,
    indicativePrice: supplierResponse.indicativePrice,
    relevantExperience: supplierResponse.relevantExperience,
    proposedApproach: supplierResponse.proposedApproach,
    assumptions: supplierResponse.assumptions,
    conditions: supplierResponse.conditions,
    message: supplierResponse.canHelp
      ? `${supplierResponse.supplierName} has confirmed availability and commercial intent.`
      : `${supplierResponse.supplierName} cannot help with this requirement.`,
    status: supplierResponse.status,
    submittedAt: supplierResponse.submittedAt,
    createdAt: supplierResponse.createdAt,
    updatedAt: supplierResponse.updatedAt
  };
}

function serialiseEngagement(engagement: NonNullable<ReturnType<typeof getEngagement>>) {
  return {
    ...engagement,
    needProfileId: engagement.needId
  };
}

function emitCurrentDeployment(
  engagementId: string,
  needProfileId: string
) {
  const deployment = getDeployment(engagementId);
  if (!deployment) return;
  emitDeploymentUpdated({
    needProfileId,
    engagementId,
    deployment
  });
}

function inferCompanyName(email: string) {
  const domain = email.split("@")[1];
  return domain ? `${domain.split(".")[0]} buyer` : "Demo buyer";
}

function requiredByLabel(days?: number) {
  if (days === undefined) {
    return undefined;
  }
  if (days <= 1) {
    return "Required today";
  }
  return `Required within ${days} days`;
}

function toContractPriority(
  buyerPriority: NonNullable<NonNullable<ReturnType<typeof getNeed>>["profile"]["buyerPriority"]> | undefined,
  urgencyDays?: number
) {
  if (buyerPriority === "speed" || (urgencyDays !== undefined && urgencyDays <= 1)) {
    return "urgent";
  }
  if (buyerPriority === "price" || buyerPriority === "technical_fit") {
    return "soon";
  }
  return "planned";
}

function equipmentOrTechnologyValues(profile: NonNullable<ReturnType<typeof getNeed>>["profile"]) {
  return profile.equipmentOrTechnology ?? profile.equipmentTechnology ?? [];
}

function demoNeedProfile(scenario: "plc" | "robotics") {
  if (scenario === "robotics") {
    return {
      title: "Mixed-carton robotic palletising cell",
      description:
        "Plan a robotic palletising cell for mixed cartons from the existing packaging conveyor without disrupting adjacent production.",
      problemSummary:
        "The factory needs a safe, evidence-backed path to automate mixed-carton palletising and select an integrator for feasibility, proof of process and commissioning.",
      category: "Robotics integration",
      industry: "Food and beverage manufacturing",
      equipmentOrTechnology: [
        "Industrial robot",
        "Machine vision",
        "End-of-arm tooling",
        "Packaging conveyor"
      ],
      location: "Western Sydney, NSW",
      urgencyDays: 60,
      budgetAud: 120000,
      constraints: [
        "Maintain access to the adjacent packaging line",
        "Provide operator and maintenance training",
        "Validate machinery safety before commissioning"
      ],
      buyerPriority: "technical_fit" as const,
      requiredCapabilities: [
        "Robotic systems integration",
        "Machinery safety",
        "Proof-of-process testing",
        "Commissioning and training"
      ]
    };
  }

  return {
    title: "Recover a stopped Siemens PLC packaging line",
    description:
      "The packaging line stopped after an intermittent Siemens PLC communication fault and requires evidence-led triage, controlled recovery and validation.",
    problemSummary:
      "Production is stopped in Western Sydney. The factory needs safe recovery today without bypassing safeguards or losing diagnostic evidence.",
    category: "Industrial automation breakdown",
    industry: "Food and beverage manufacturing",
    equipmentOrTechnology: [
      "Siemens S7 PLC",
      "Industrial Ethernet",
      "Variable speed drives",
      "Packaging conveyor"
    ],
    location: "Western Sydney, NSW",
    urgencyDays: 1,
    budgetAud: 20000,
    constraints: [
      "No safeguard bypass",
      "All changes require site authorisation",
      "Validated backup and handover required"
    ],
    buyerPriority: "speed" as const,
    requiredCapabilities: [
      "Siemens PLC diagnostics",
      "Industrial networking",
      "Safe isolation",
      "Controlled recovery and validation"
    ]
  };
}
