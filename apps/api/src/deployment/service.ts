import {
  deploymentSummarySchema,
  type DeploymentMilestoneStatus,
  type DeploymentSummary
} from "@veltact/contracts";
import {
  createDeploymentSummary,
  deriveDeploymentSummary,
  ensureMilestoneFundingSchedule,
  milestoneProgress,
  syncCommitmentPayment
} from "./templates.js";
import type {
  DeploymentEngagementContext,
  DeploymentPersistenceAdapter,
  DeploymentUpdatedEmitter
} from "./types.js";

export class DeploymentServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "DeploymentServiceError";
  }
}

export class DeploymentService {
  constructor(
    private readonly persistence: DeploymentPersistenceAdapter,
    private readonly emitUpdated?: DeploymentUpdatedEmitter,
    private readonly now: () => Date = () => new Date()
  ) {}

  async getDeployment(
    engagementId: string,
    buyerAccessToken: string | undefined
  ) {
    const engagement = await this.requireAuthorizedEngagement(
      engagementId,
      buyerAccessToken
    );
    return this.loadOrCreate(engagement);
  }

  async updateMilestone(input: {
    engagementId: string;
    milestoneId: string;
    buyerAccessToken: string | undefined;
    status: Extract<DeploymentMilestoneStatus, "in_progress" | "completed">;
    latestUpdate: string;
  }) {
    const engagement = await this.requireAuthorizedEngagement(
      input.engagementId,
      input.buyerAccessToken
    );
    const current = await this.loadOrCreate(engagement);
    const deployment = structuredClone(current);
    const milestone = deployment.milestones.find(
      (candidate) => candidate.id === input.milestoneId
    );
    if (!milestone) {
      throw new DeploymentServiceError("Deployment milestone not found", 404);
    }

    validateTransition(deployment, milestone.id, input.status);
    if (
      milestone.status === input.status &&
      milestone.latestUpdate === input.latestUpdate
    ) {
      return current;
    }

    const updatedAt = this.now().toISOString();
    milestone.status = input.status;
    milestone.progressPercentage = milestoneProgress(input.status);
    milestone.latestUpdate = input.latestUpdate;
    milestone.updatedAt = updatedAt;
    deployment.latestUpdate = input.latestUpdate;
    deployment.updatedAt = updatedAt;

    const saved = await this.save(deriveDeploymentSummary(deployment));
    await this.emitUpdated?.({
      needProfileId: engagement.needProfileId,
      engagementId: engagement.engagementId,
      deployment: saved
    });
    return saved;
  }

  private async requireAuthorizedEngagement(
    engagementId: string,
    buyerAccessToken: string | undefined
  ) {
    const engagement = await this.persistence.findEngagement(engagementId);
    if (!engagement) {
      throw new DeploymentServiceError("Engagement not found", 404);
    }
    const authorized = await this.persistence.isBuyerAuthorized(
      engagement.needProfileId,
      buyerAccessToken
    );
    if (!authorized) {
      throw new DeploymentServiceError(
        "Buyer access token is required for this requirement",
        401
      );
    }
    return engagement;
  }

  private async loadOrCreate(engagement: DeploymentEngagementContext) {
    const existing = await this.persistence.findDeployment(
      engagement.engagementId
    );
    const updatedAt = this.now().toISOString();
    if (!existing) {
      return this.save(createDeploymentSummary(engagement, updatedAt));
    }

    const parsed = parsePersistedDeployment(existing);
    const scheduled = ensureMilestoneFundingSchedule(
      parsed,
      engagement.commitmentAmount
    );
    const synced = syncCommitmentPayment(
      scheduled.deployment,
      engagement.paymentStatus,
      updatedAt
    );
    return scheduled.changed || synced.changed
      ? this.save(synced.deployment)
      : parsed;
  }

  private async save(deployment: DeploymentSummary) {
    const valid = deploymentSummarySchema.parse(deployment);
    const saved = await this.persistence.saveDeployment(valid);
    return parsePersistedDeployment(saved);
  }
}

function validateTransition(
  deployment: DeploymentSummary,
  milestoneId: string,
  nextStatus: Extract<DeploymentMilestoneStatus, "in_progress" | "completed">
) {
  const index = deployment.milestones.findIndex(
    (milestone) => milestone.id === milestoneId
  );
  const milestone = deployment.milestones[index];
  if (!milestone) {
    throw new DeploymentServiceError("Deployment milestone not found", 404);
  }
  if (milestone.status === nextStatus) {
    return;
  }

  if (nextStatus === "completed") {
    if (milestone.status !== "in_progress") {
      throw new DeploymentServiceError(
        "A milestone must be in progress before it can be completed",
        409
      );
    }
    return;
  }

  const previous = index === 0 ? undefined : deployment.milestones[index - 1];
  const isReady =
    milestone.status === "funded" ||
    (milestone.status === "not_started" && previous?.status === "completed");
  if (!isReady) {
    throw new DeploymentServiceError(
      index === 0
        ? "Authoritative payment evidence is required before work can start"
        : "The previous milestone must be completed before work can start",
      409
    );
  }
}

function parsePersistedDeployment(value: unknown) {
  const parsed = deploymentSummarySchema.safeParse(value);
  if (!parsed.success) {
    throw new DeploymentServiceError(
      "Persisted deployment data is invalid",
      500
    );
  }
  return parsed.data;
}
