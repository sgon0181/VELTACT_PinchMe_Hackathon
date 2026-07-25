import { Router } from "express";
import { z } from "zod";
import {
  attachPaymentLinkToEngagement,
  createEngagement,
  createNeed,
  getEngagement,
  getNeed,
  listResponsesForNeed,
  markInvitationViewed,
  recordAuthoritativePinchPayment,
  resetMarketplaceStore,
  submitSupplierResponse
} from "./store.js";
import {
  emitPaymentStatusUpdated,
  emitSupplierInvitationUpdated,
  emitSupplierResponseSubmitted
} from "../realtime.js";
import { env } from "../env.js";
import { PinchApiError } from "../pinch/pinchClient.js";
import { getPaymentProvider } from "../payments/providerRegistry.js";

export const marketplaceRouter = Router();

const needProfileSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  problemSummary: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1),
  industry: z.string().trim().min(1),
  equipmentTechnology: z.array(z.string().trim().min(1)).optional(),
  location: z.string().trim().min(1),
  urgencyDays: z.coerce.number().int().positive().optional(),
  budgetAud: z.coerce.number().int().positive().optional(),
  constraints: z.array(z.string().trim().min(1)).optional(),
  buyerPriority: z.enum(["speed", "technical_fit", "quality", "trust", "price"]).optional(),
  requiredCapabilities: z.array(z.string().trim().min(1)).optional(),
  requiredCapability: z.array(z.string().trim().min(1)).optional()
});

const createNeedSchema = z.object({
  buyerEmail: z.string().trim().email(),
  profile: needProfileSchema
});

const supplierResponseSchema = z.object({
  canHelp: z.boolean(),
  earliestAvailability: z.string().trim().min(1),
  indicativePriceAud: z.coerce.number().int().nonnegative(),
  relevantExperience: z.string().trim().min(1),
  conditions: z.string().trim().min(1)
});

const createEngagementSchema = z.object({
  supplierResponseId: z.string().trim().min(1)
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

  response.status(201).json({
    need: serialiseNeed(createNeed(parsed.data))
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
  response.json({
    invitation: {
      ...serialiseSupplierInvitation(invitation),
      needId: invitation.needId,
      supplierName: invitation.supplierName,
      openedAt: invitation.openedAt,
      respondedAt: invitation.respondedAt
    },
    supplierInvitation: serialiseSupplierInvitation(invitation),
    need: need ? serialiseNeed(need) : undefined
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

  const need = serialiseNeed(createNeed(parsed.data));
  response.status(201).json({
    needProfile: need,
    need
  });
});

marketplaceRouter.get("/need-profiles/:needProfileId", (request, response) => {
  const need = getNeed(request.params.needProfileId);
  if (!need) {
    response.status(404).json({
      status: "error",
      message: "Need profile not found"
    });
    return;
  }

  response.json({
    needProfile: serialiseNeed(need),
    need: serialiseNeed(need)
  });
});

marketplaceRouter.get("/need-profiles/:needProfileId/responses", (request, response) => {
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

marketplaceRouter.post("/need-profiles/:needProfileId/invitations/send", (request, response) => {
  const need = getNeed(request.params.needProfileId);
  if (!need) {
    response.status(404).json({
      status: "error",
      message: "Need profile not found"
    });
    return;
  }

  response.json({
    supplierInvitations: need.invitations.map(serialiseSupplierInvitation),
    invitations: need.invitations.map(serialiseLegacyInvitation)
  });
});

marketplaceRouter.post("/need-profiles/:needProfileId/engagements", (request, response) => {
  const parsed = createEngagementSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      status: "error",
      message: "Invalid engagement request",
      issues: parsed.error.flatten().fieldErrors
    });
    return;
  }

  const engagement = createEngagement({
    needId: request.params.needProfileId,
    supplierResponseId: parsed.data.supplierResponseId
  });

  if (!engagement) {
    response.status(404).json({
      status: "error",
      message: "Need profile or supplier response not found"
    });
    return;
  }

  response.status(201).json({ engagement: serialiseEngagement(engagement) });
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
  const engagement = getEngagement(request.params.engagementId);
  if (!engagement) {
    response.status(404).json({
      status: "error",
      message: "Engagement not found"
    });
    return;
  }

  if (engagement.hostedCheckoutUrl && engagement.paymentLinkId && engagement.pinchPayerId) {
    response.json({ engagement: serialiseEngagement(engagement) });
    return;
  }

  const need = getNeed(engagement.needId);
  if (!need) {
    response.status(404).json({
      status: "error",
      message: "Need profile not found"
    });
    return;
  }

  try {
    const paymentLink = await getPaymentProvider().createHostedPaymentLink({
      engagementId: engagement.id,
      needId: engagement.needId,
      supplierId: engagement.supplierId,
      buyerEmail: need.buyerEmail,
      buyerName: need.profile.title,
      amount: need.profile.budgetAud ?? 1000,
      description: `Veltact engagement ${engagement.id}`,
      returnUrl: new URL(`/api/pinch/return/${engagement.id}`, env.API_PUBLIC_URL).toString()
    });

    const updatedEngagement = attachPaymentLinkToEngagement({
      engagementId: engagement.id,
      payerId: paymentLink.payerId,
      paymentLinkId: paymentLink.paymentLinkId,
      hostedCheckoutUrl: paymentLink.hostedCheckoutUrl
    });

    response.status(201).json({
      engagement: updatedEngagement ? serialiseEngagement(updatedEngagement) : undefined,
      hostedCheckoutUrl: paymentLink.hostedCheckoutUrl
    });
  } catch (error) {
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

  const supplierResponse = submitSupplierResponse(request.params.token, parsed.data);
  if (!supplierResponse) {
    response.status(404).json({
      status: "error",
      message: "Supplier invitation not found"
    });
    return;
  }

  emitSupplierResponseSubmitted(supplierResponse);

  response.status(201).json({
    supplierResponse: serialiseSupplierResponse(supplierResponse),
    response: supplierResponse
  });
});

marketplaceRouter.get("/needs/:needId/responses", (request, response) => {
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

marketplaceRouter.post("/demo/reset", (_request, response) => {
  if (env.NODE_ENV === "production") {
    response.status(404).json({
      status: "error",
      message: "Demo reset is unavailable in production"
    });
    return;
  }

  resetMarketplaceStore();
  response.json({
    reset: true
  });
});

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
    suppliers: need.matches.map((match) => ({
      id: match.supplier.id,
      companyName: match.supplier.name,
      contactEmail: match.supplier.contactEmail,
      categories: [need.profile.category],
      serviceRegions: match.supplier.locations,
      capabilities: match.supplier.capabilities,
      verified: match.supplier.verified,
      createdAt: match.createdAt,
      updatedAt: match.updatedAt
    })),
    matches: need.matches.map((match) => ({
      id: `${need.id}-${match.id}`,
      needProfileId: need.id,
      supplierId: match.supplier.id,
      supplierName: match.supplier.name,
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
      ...(need.profile.equipmentTechnology ?? [])
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
  const legacyStatus =
    invitation.status === "sent" || invitation.status === "pending"
      ? "invited"
      : invitation.status === "opened"
        ? "viewed"
        : "responded";

  return {
    ...serialiseSupplierInvitation(invitation),
    needId: invitation.needId,
    supplierName: invitation.supplierName,
    status: legacyStatus,
    viewedAt: invitation.openedAt,
    respondedAt: invitation.respondedAt
  };
}

function serialiseSupplierResponse(supplierResponse: NonNullable<ReturnType<typeof submitSupplierResponse>>) {
  return {
    id: supplierResponse.id,
    needProfileId: supplierResponse.needProfileId,
    supplierId: supplierResponse.supplierId,
    invitationId: supplierResponse.invitationId,
    decision: supplierResponse.decision,
    availability: supplierResponse.availability,
    indicativePrice: supplierResponse.indicativePrice,
    relevantExperience: supplierResponse.relevantExperience,
    conditions: supplierResponse.conditions ? [supplierResponse.conditions] : [],
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
