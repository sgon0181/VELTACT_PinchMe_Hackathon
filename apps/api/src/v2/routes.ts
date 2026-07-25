import type { Request, Response } from "express";
import { Router } from "express";
import {
  marketplaceNeedProfileSchema,
  projectTaskStatusSchema,
  solutionDecisionTypeSchema,
  supplierResponseDecisionSchema,
  veltactV2SocketEvent
} from "@veltact/contracts";
import { z, ZodError } from "zod";
import { env } from "../env.js";
import { emitV2Update } from "../realtime.js";
import { V2ServiceError, v2Service } from "./service.js";

export const v2Router = Router();

const createNeedSchema = z.object({
  buyerEmail: z.string().trim().email(),
  buyerName: z.string().trim().min(1),
  companyName: z.string().trim().min(1),
  profile: marketplaceNeedProfileSchema
});

const solutionDecisionSchema = z.object({
  decision: solutionDecisionTypeSchema,
  selectedApproachIds: z.array(z.string().min(1)).min(1),
  buyerNote: z.string().trim().min(1).optional()
});

const supplierLeadSelectionSchema = z.object({
  supplierLeadIds: z.array(z.string().min(1)).min(1).max(10)
});

const supplierProfileInputSchema = z.object({
  companyName: z.string().trim().min(1),
  website: z.string().url(),
  contactName: z.string().trim().min(1),
  contactEmail: z.string().trim().email(),
  contactPhone: z.string().trim().min(1).optional(),
  location: z.string().trim().min(1),
  categories: z.array(z.string().trim().min(1)).min(1),
  industries: z.array(z.string().trim().min(1)).min(1),
  serviceRegions: z.array(z.string().trim().min(1)).min(1),
  capabilities: z.array(z.string().trim().min(1)).min(1),
  certifications: z.array(z.string().trim().min(1)).default([]),
  profileSummary: z.string().trim().min(1)
});

const supplierResponseInputSchema = z.object({
  decision: supplierResponseDecisionSchema,
  availability: z.string().trim().min(1),
  indicativePriceAud: z.coerce.number().positive(),
  proposedApproach: z.string().trim().min(1),
  relevantExperience: z.string().trim().min(1),
  assumptions: z.array(z.string().trim().min(1)).default([]),
  conditions: z.array(z.string().trim().min(1)).default([])
});

const taskUpdateSchema = z.object({
  status: projectTaskStatusSchema
});

const changeRequestSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  impact: z.string().trim().min(1),
  requestedBy: z.string().trim().min(1)
});

const resetSchema = z.object({
  scenario: z.enum(["plc", "robotics"]).default("plc"),
  seeded: z.boolean().default(true)
});

v2Router.post(
  "/needs",
  asyncRoute(async (request, response) => {
    const input = createNeedSchema.parse(request.body);
    const created = await v2Service.createNeed(input);
    response.status(201).json(created);
  })
);

v2Router.get(
  "/needs/:needId",
  asyncRoute(async (request, response) => {
    response.json(
      v2Service.getWorkspace(
        request.params.needId,
        buyerAccessToken(request)
      )
    );
  })
);

v2Router.post(
  "/needs/:needId/research",
  asyncRoute(async (request, response) => {
    const result = await v2Service.researchNeed(
      request.params.needId,
      buyerAccessToken(request)
    );
    emitV2Update(
      request.params.needId,
      veltactV2SocketEvent.researchUpdated,
      result
    );
    response.status(201).json(result);
  })
);

v2Router.post(
  "/needs/:needId/solution-decision",
  asyncRoute(async (request, response) => {
    const decision = await v2Service.decideSolution(
      request.params.needId,
      buyerAccessToken(request),
      solutionDecisionSchema.parse(request.body)
    );
    response.status(201).json({ solutionDecision: decision });
  })
);

v2Router.post(
  "/needs/:needId/suppliers/discover",
  asyncRoute(async (request, response) => {
    const result = await v2Service.discoverNeedSuppliers(
      request.params.needId,
      buyerAccessToken(request)
    );
    emitV2Update(
      request.params.needId,
      veltactV2SocketEvent.discoveryUpdated,
      result
    );
    response.status(201).json(result);
  })
);

v2Router.post(
  "/needs/:needId/suppliers/approve-outreach",
  asyncRoute(async (request, response) => {
    const input = supplierLeadSelectionSchema.parse(request.body);
    const supplierLeads = await v2Service.approveSupplierLeads(
      request.params.needId,
      buyerAccessToken(request),
      input.supplierLeadIds
    );
    emitV2Update(
      request.params.needId,
      veltactV2SocketEvent.supplierLifecycleUpdated,
      { supplierLeads }
    );
    response.json({ supplierLeads });
  })
);

v2Router.post(
  "/needs/:needId/invitations/send",
  asyncRoute(async (request, response) => {
    const input = supplierLeadSelectionSchema.parse(request.body);
    const result = await v2Service.inviteApprovedSuppliers(
      request.params.needId,
      buyerAccessToken(request),
      input.supplierLeadIds
    );
    emitV2Update(
      request.params.needId,
      veltactV2SocketEvent.supplierLifecycleUpdated,
      result
    );
    response.json(result);
  })
);

v2Router.get(
  "/supplier-claims/:token",
  asyncRoute(async (request, response) => {
    response.json(await v2Service.openSupplierClaim(request.params.token));
  })
);

v2Router.post(
  "/supplier-claims/:token/profile",
  asyncRoute(async (request, response) => {
    const supplierProfile = await v2Service.submitSupplierProfile(
      request.params.token,
      supplierProfileInputSchema.parse(request.body)
    );
    const claimState = v2Service.getSupplierClaim(request.params.token);
    emitV2Update(
      claimState.need.id,
      veltactV2SocketEvent.supplierLifecycleUpdated,
      { supplierProfile, supplierLead: claimState.lead }
    );
    response.status(201).json({ supplierProfile });
  })
);

v2Router.post(
  "/needs/:needId/suppliers/:supplierLeadId/buyer-approve",
  asyncRoute(async (request, response) => {
    const result = await v2Service.buyerApproveSupplierProfile(
      request.params.needId,
      buyerAccessToken(request),
      request.params.supplierLeadId
    );
    emitV2Update(
      request.params.needId,
      veltactV2SocketEvent.supplierLifecycleUpdated,
      result
    );
    response.json(result);
  })
);

v2Router.post(
  "/needs/:needId/suppliers/:supplierLeadId/activate",
  asyncRoute(async (request, response) => {
    const result = await v2Service.activateSupplier(
      request.params.needId,
      buyerAccessToken(request),
      request.params.supplierLeadId
    );
    emitV2Update(
      request.params.needId,
      veltactV2SocketEvent.supplierLifecycleUpdated,
      result
    );
    response.json(result);
  })
);

v2Router.post(
  "/supplier-claims/:token/response",
  asyncRoute(async (request, response) => {
    const parsed = supplierResponseInputSchema.parse(request.body);
    const supplierResponse = await v2Service.submitSupplierResponse(
      request.params.token,
      {
        decision: parsed.decision,
        availability: parsed.availability,
        indicativePrice: {
          amount: Math.round(parsed.indicativePriceAud * 100),
          currency: "AUD"
        },
        proposedApproach: parsed.proposedApproach,
        relevantExperience: parsed.relevantExperience,
        assumptions: parsed.assumptions,
        conditions: parsed.conditions
      }
    );
    emitV2Update(
      supplierResponse.needProfileId,
      veltactV2SocketEvent.supplierResponseSubmitted,
      { supplierResponse }
    );
    response.status(201).json({ supplierResponse });
  })
);

v2Router.post(
  "/needs/:needId/responses/:supplierResponseId/select",
  asyncRoute(async (request, response) => {
    const project = await v2Service.selectSupplierResponse(
      request.params.needId,
      buyerAccessToken(request),
      request.params.supplierResponseId
    );
    emitV2Update(
      request.params.needId,
      veltactV2SocketEvent.projectUpdated,
      { project }
    );
    response.status(201).json({ project });
  })
);

v2Router.patch(
  "/projects/:projectId/tasks/:taskId",
  asyncRoute(async (request, response) => {
    const input = taskUpdateSchema.parse(request.body);
    const project = await v2Service.updateProjectTask(
      request.params.projectId,
      buyerAccessToken(request),
      request.params.taskId,
      input.status
    );
    emitV2Update(
      project.needProfileId,
      veltactV2SocketEvent.projectUpdated,
      { project }
    );
    response.json({ project });
  })
);

v2Router.post(
  "/projects/:projectId/milestones/:milestoneId/accept",
  asyncRoute(async (request, response) => {
    const project = await v2Service.acceptMilestone(
      request.params.projectId,
      buyerAccessToken(request),
      request.params.milestoneId
    );
    emitV2Update(
      project.needProfileId,
      veltactV2SocketEvent.projectUpdated,
      { project }
    );
    response.json({ project });
  })
);

v2Router.post(
  "/projects/:projectId/milestones/:milestoneId/payment-link",
  asyncRoute(async (request, response) => {
    const milestone = await v2Service.createMilestonePaymentLink(
      request.params.projectId,
      buyerAccessToken(request),
      request.params.milestoneId
    );
    response.status(201).json({
      milestone,
      hostedCheckoutUrl: milestone.hostedCheckoutUrl
    });
  })
);

v2Router.post(
  "/projects/:projectId/milestones/:milestoneId/reconcile",
  asyncRoute(async (request, response) => {
    const milestone = await v2Service.reconcileMilestonePayment(
      request.params.projectId,
      buyerAccessToken(request),
      request.params.milestoneId
    );
    response.json({ milestone });
  })
);

v2Router.post(
  "/projects/:projectId/milestones/:milestoneId/demo-payment",
  asyncRoute(async (request, response) => {
    const result = await v2Service.recordDemoMilestonePayment(
      request.params.projectId,
      buyerAccessToken(request),
      request.params.milestoneId
    );
    emitV2Update(
      result.needProfileId,
      veltactV2SocketEvent.milestonePaymentUpdated,
      result
    );
    response.json(result);
  })
);

v2Router.post(
  "/projects/:projectId/change-requests",
  asyncRoute(async (request, response) => {
    const changeRequest = await v2Service.createChangeRequest(
      request.params.projectId,
      buyerAccessToken(request),
      changeRequestSchema.parse(request.body)
    );
    response.status(201).json({ changeRequest });
  })
);

v2Router.post(
  "/demo/reset",
  asyncRoute(async (request, response) => {
    if (env.NODE_ENV === "production") {
      throw new V2ServiceError("Demo reset is unavailable in production", 404);
    }
    const input = resetSchema.parse(request.body ?? {});
    const result = input.seeded
      ? await v2Service.seedDemo(input.scenario)
      : await v2Service.reset().then(() => ({
          reset: true,
          buyerUrl: new URL("/v2.html", env.PUBLIC_BASE_URL).toString()
        }));
    response.json(result);
  })
);

function buyerAccessToken(request: Request) {
  return request.header("x-veltact-buyer-token");
}

type V2Request = Request<Record<string, string>>;

function asyncRoute(
  handler: (request: V2Request, response: Response) => Promise<void>
) {
  return (request: Request, response: Response) => {
    handler(request as V2Request, response).catch((error: unknown) => {
      if (response.headersSent) return;
      if (error instanceof V2ServiceError) {
        response.status(error.statusCode).json({
          status: "error",
          message: error.message
        });
        return;
      }
      if (error instanceof ZodError) {
        response.status(400).json({
          status: "error",
          message: "Invalid Veltact V2 request",
          issues: error.flatten().fieldErrors
        });
        return;
      }
      response.status(500).json({
        status: "error",
        message: "Unexpected Veltact V2 integration error"
      });
    });
  };
}
