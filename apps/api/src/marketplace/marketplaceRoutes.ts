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
  submitSupplierResponse
} from "./store.js";
import { emitSupplierResponseSubmitted } from "../realtime.js";
import { env } from "../env.js";
import { PinchApiError } from "../pinch/pinchClient.js";
import { getPaymentProvider } from "../payments/providerRegistry.js";

export const marketplaceRouter = Router();

const needProfileSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  category: z.string().trim().min(1),
  industry: z.string().trim().min(1),
  location: z.string().trim().min(1),
  urgencyDays: z.coerce.number().int().positive().optional(),
  budgetAud: z.coerce.number().int().positive().optional(),
  requiredCapabilities: z.array(z.string().trim().min(1)).optional()
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

  const need = getNeed(invitation.needId);
  response.json({
    invitation,
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
    needProfile: serialiseNeed(need)
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
    supplierResponses,
    responses: supplierResponses
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

  response.status(201).json({ engagement });
});

marketplaceRouter.get("/engagements/:engagementId", (request, response) => {
  const engagement = getEngagement(request.params.engagementId);
  if (!engagement) {
    response.status(404).json({
      status: "error",
      message: "Engagement not found"
    });
    return;
  }

  response.json({ engagement });
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
    response.json({ engagement });
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
      engagement: updatedEngagement,
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
    supplierResponse,
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
    responses: supplierResponses
  });
});

function serialiseNeed(need: ReturnType<typeof createNeed>) {
  return {
    id: need.id,
    buyerEmail: need.buyerEmail,
    profile: need.profile,
    createdAt: need.createdAt,
    matches: need.matches.map((match) => ({
      supplierId: match.supplier.id,
      supplierName: match.supplier.name,
      score: match.score,
      explanation: match.explanation
    })),
    invitations: need.invitations
  };
}
