import type {
  DeploymentSummary,
  Money,
  PaymentStatus
} from "@veltact/contracts";

export type DeploymentScenario = "plc_recovery" | "robotic_integration";

export type DeploymentEngagementContext = {
  engagementId: string;
  needProfileId: string;
  supplierName: string;
  scenario: DeploymentScenario;
  commitmentAmount: Money;
  paymentStatus: PaymentStatus;
};

export interface DeploymentPersistenceAdapter {
  findEngagement(
    engagementId: string
  ): Promise<DeploymentEngagementContext | undefined>;
  isBuyerAuthorized(
    needProfileId: string,
    buyerAccessToken: string | undefined
  ): Promise<boolean>;
  findDeployment(engagementId: string): Promise<DeploymentSummary | undefined>;
  saveDeployment(deployment: DeploymentSummary): Promise<DeploymentSummary>;
}

export type DeploymentUpdatedEvent = {
  needProfileId: string;
  engagementId: string;
  deployment: DeploymentSummary;
};

export type DeploymentUpdatedEmitter = (
  event: DeploymentUpdatedEvent
) => void | Promise<void>;
