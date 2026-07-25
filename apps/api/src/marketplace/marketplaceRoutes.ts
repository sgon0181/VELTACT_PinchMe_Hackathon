import { Router } from "express";
import { z } from "zod";
import {
  createNeed,
  getInvitation,
  getNeed,
  listResponsesForNeed,
  submitSupplierResponse
} from "./store.js";

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
  const invitation = getInvitation(request.params.token);
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

  response.status(201).json({
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
