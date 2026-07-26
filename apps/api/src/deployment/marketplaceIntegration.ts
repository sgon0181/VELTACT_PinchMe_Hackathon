import { emitDeploymentUpdated } from "../realtime.js";
import {
  getDeployment,
  getEngagement,
  getNeed,
  isBuyerAuthorised,
  listResponsesForNeed,
  saveDeployment
} from "../marketplace/store.js";
import { createPinchDeploymentIntegration } from "./integration.js";
import type {
  DeploymentEngagementContext,
  DeploymentPersistenceAdapter,
  DeploymentScenario
} from "./types.js";

const marketplaceDeploymentPersistence: DeploymentPersistenceAdapter = {
  async findEngagement(engagementId) {
    return marketplaceDeploymentContext(engagementId);
  },
  async isBuyerAuthorized(needProfileId, buyerAccessToken) {
    return isBuyerAuthorised(needProfileId, buyerAccessToken);
  },
  async findDeployment(engagementId) {
    return getDeployment(engagementId);
  },
  async saveDeployment(deployment) {
    return saveDeployment(deployment);
  }
};

export const marketplaceDeploymentIntegration =
  createPinchDeploymentIntegration({
    persistence: marketplaceDeploymentPersistence,
    emitDeploymentUpdated
  });

export function marketplaceDeploymentContext(
  engagementId: string
): DeploymentEngagementContext | undefined {
  const engagement = getEngagement(engagementId);
  if (!engagement) return undefined;

  const need = getNeed(engagement.needId);
  const response = listResponsesForNeed(engagement.needId)?.find(
    (candidate) => candidate.id === engagement.supplierResponseId
  );
  if (!need || !response || response.indicativePrice.amount <= 0) {
    return undefined;
  }

  return {
    engagementId: engagement.id,
    needProfileId: engagement.needId,
    supplierName: engagement.supplierName,
    scenario: inferDeploymentScenario(need.profile),
    commitmentAmount: response.indicativePrice,
    paymentStatus: engagement.paymentStatus
  };
}

function inferDeploymentScenario(
  profile: NonNullable<ReturnType<typeof getNeed>>["profile"]
): DeploymentScenario {
  const requirement = [
    profile.title,
    profile.description,
    profile.problemSummary,
    profile.category,
    ...(profile.equipmentOrTechnology ?? []),
    ...(profile.equipmentTechnology ?? [])
  ]
    .filter(Boolean)
    .join(" ");

  return /robot|pallet|cobot|abb|fanuc/i.test(requirement)
    ? "robotic_integration"
    : "plc_recovery";
}
