import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";
import {
  DeploymentService,
  DeploymentServiceError
} from "./service.js";

const updateMilestoneSchema = z
  .object({
    status: z.enum(["in_progress", "completed"]),
    latestUpdate: z.string().trim().min(1).max(500)
  })
  .strict();

export function createDeploymentRouter(service: DeploymentService) {
  const router = Router();

  router.get(
    "/engagements/:engagementId/deployment",
    async (request, response) => {
      try {
        const deployment = await service.getDeployment(
          request.params.engagementId,
          request.header("x-veltact-buyer-token")
        );
        response.json({ deployment });
      } catch (error) {
        sendDeploymentError(response, error);
      }
    }
  );

  router.patch(
    "/engagements/:engagementId/deployment/milestones/:milestoneId",
    async (request, response) => {
      const parsed = updateMilestoneSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({
          status: "error",
          message: "Invalid deployment milestone update",
          issues: parsed.error.flatten().fieldErrors
        });
        return;
      }

      try {
        const deployment = await service.updateMilestone({
          engagementId: request.params.engagementId,
          milestoneId: request.params.milestoneId,
          buyerAccessToken: request.header("x-veltact-buyer-token"),
          ...parsed.data
        });
        response.json({ deployment });
      } catch (error) {
        sendDeploymentError(response, error);
      }
    }
  );

  return router;
}

function sendDeploymentError(
  response: Response,
  error: unknown
) {
  if (error instanceof DeploymentServiceError) {
    response.status(error.statusCode).json({
      status: "error",
      message: error.message
    });
    return;
  }

  response.status(500).json({
    status: "error",
    message: "Unexpected deployment integration error"
  });
}
