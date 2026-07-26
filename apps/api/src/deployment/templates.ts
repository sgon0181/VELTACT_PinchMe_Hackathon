import type {
  DeploymentMilestoneStatus,
  DeploymentMilestoneSummary,
  DeploymentSummary,
  PaymentStatus
} from "@veltact/contracts";
import type {
  DeploymentEngagementContext,
  DeploymentScenario
} from "./types.js";

const MILESTONE_TITLES: Record<DeploymentScenario, readonly string[]> = {
  plc_recovery: ["Diagnosis", "Recovery", "Validation", "Handover"],
  robotic_integration: [
    "Site assessment",
    "Design",
    "Installation",
    "Commissioning"
  ]
};

export function createDeploymentSummary(
  engagement: DeploymentEngagementContext,
  updatedAt: string
): DeploymentSummary {
  if (engagement.commitmentAmount.amount <= 0) {
    throw new Error("Deployment commitment amount must be positive");
  }

  const titles = MILESTONE_TITLES[engagement.scenario];
  const commitmentStatus = statusFromPayment(engagement.paymentStatus);
  const commitmentUpdate = initialCommitmentUpdate(
    titles[0],
    engagement.paymentStatus
  );
  const milestones = titles.map<DeploymentMilestoneSummary>((title, index) => ({
    id: milestoneId(engagement.engagementId, index + 1, title),
    engagementId: engagement.engagementId,
    sequence: index + 1,
    title,
    ...(index === 0 ? { amount: engagement.commitmentAmount } : {}),
    status: index === 0 ? commitmentStatus : "not_started",
    paymentStatus: index === 0 ? engagement.paymentStatus : "not_started",
    progressPercentage: 0,
    ...(index === 0 ? { latestUpdate: commitmentUpdate } : {}),
    updatedAt
  }));

  return deriveDeploymentSummary({
    engagementId: engagement.engagementId,
    title: deploymentTitle(engagement),
    status: "not_started",
    progressPercentage: 0,
    milestones,
    latestUpdate: commitmentUpdate,
    updatedAt
  });
}

export function syncCommitmentPayment(
  deployment: DeploymentSummary,
  paymentStatus: PaymentStatus,
  updatedAt: string
): { deployment: DeploymentSummary; changed: boolean } {
  const next = structuredClone(deployment);
  const commitment = next.milestones[0];
  if (!commitment) {
    throw new Error("Deployment has no commitment milestone");
  }

  let changed = false;
  if (commitment.paymentStatus !== paymentStatus) {
    commitment.paymentStatus = paymentStatus;
    changed = true;
  }

  if (isPaymentControlledStatus(commitment.status)) {
    const nextStatus = statusFromPayment(paymentStatus);
    if (commitment.status !== nextStatus) {
      commitment.status = nextStatus;
      commitment.progressPercentage = milestoneProgress(nextStatus);
      changed = true;
    }
  }

  if (!changed) {
    return { deployment, changed: false };
  }

  const update = initialCommitmentUpdate(commitment.title, paymentStatus);
  commitment.latestUpdate = update;
  commitment.updatedAt = updatedAt;
  next.latestUpdate = update;
  next.updatedAt = updatedAt;
  return {
    deployment: deriveDeploymentSummary(next),
    changed: true
  };
}

export function deriveDeploymentSummary(
  deployment: DeploymentSummary
): DeploymentSummary {
  const {
    currentMilestoneId: _currentMilestoneId,
    nextMilestoneId: _nextMilestoneId,
    ...base
  } = deployment;
  const milestones = [...deployment.milestones].sort(
    (left, right) => left.sequence - right.sequence
  );
  const completedCount = milestones.filter(
    (milestone) => milestone.status === "completed"
  ).length;
  const progressPercentage = Math.round(
    (completedCount / milestones.length) * 100
  );
  const currentIndex = milestones.findIndex(
    (milestone) => milestone.status !== "completed"
  );
  const current =
    currentIndex === -1 ? undefined : milestones[currentIndex];
  const next =
    currentIndex === -1 ? undefined : milestones[currentIndex + 1];

  return {
    ...base,
    status: deriveDeploymentStatus(milestones),
    progressPercentage,
    ...(current ? { currentMilestoneId: current.id } : {}),
    ...(next ? { nextMilestoneId: next.id } : {}),
    milestones
  };
}

export function milestoneProgress(status: DeploymentMilestoneStatus) {
  if (status === "completed") return 100;
  if (status === "in_progress") return 50;
  return 0;
}

function deriveDeploymentStatus(
  milestones: DeploymentMilestoneSummary[]
): DeploymentSummary["status"] {
  if (milestones.every((milestone) => milestone.status === "completed")) {
    return "completed";
  }
  if (
    milestones.some((milestone) =>
      ["funded", "in_progress", "completed"].includes(milestone.status)
    )
  ) {
    return "active";
  }
  if (milestones[0]?.status === "awaiting_payment") {
    return "commitment_pending";
  }
  return "not_started";
}

function statusFromPayment(
  paymentStatus: PaymentStatus
): DeploymentMilestoneStatus {
  if (paymentStatus === "paid") {
    return "funded";
  }
  if (
    ["link_created", "awaiting_payment", "pending"].includes(paymentStatus)
  ) {
    return "awaiting_payment";
  }
  return "not_started";
}

function isPaymentControlledStatus(status: DeploymentMilestoneStatus) {
  return ["not_started", "awaiting_payment", "funded"].includes(status);
}

function initialCommitmentUpdate(
  milestoneTitle: string,
  paymentStatus: PaymentStatus
) {
  if (paymentStatus === "paid") {
    return `${milestoneTitle} commitment is funded. Engineering work is not yet complete.`;
  }
  if (
    ["link_created", "awaiting_payment", "pending"].includes(paymentStatus)
  ) {
    return `Awaiting authoritative Pinch confirmation for the ${milestoneTitle.toLowerCase()} commitment.`;
  }
  if (["failed", "cancelled", "refunded"].includes(paymentStatus)) {
    return `${milestoneTitle} commitment payment is ${paymentStatus}.`;
  }
  return `${milestoneTitle} commitment is ready for Pinch checkout.`;
}

function deploymentTitle(engagement: DeploymentEngagementContext) {
  const work =
    engagement.scenario === "robotic_integration"
      ? "Robotic integration"
      : "PLC recovery";
  return `${work} deployment with ${engagement.supplierName}`;
}

function milestoneId(
  engagementId: string,
  sequence: number,
  title: string
) {
  const slug = title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
  return `${engagementId}-m${sequence}-${slug}`;
}
