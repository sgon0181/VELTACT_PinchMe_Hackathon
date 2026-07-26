import { createDeploymentRouter } from "./router.js";
import { DeploymentService } from "./service.js";
import type {
  DeploymentPersistenceAdapter,
  DeploymentUpdatedEmitter
} from "./types.js";

export type PinchDeploymentIntegrationOptions = {
  persistence: DeploymentPersistenceAdapter;
  emitDeploymentUpdated: DeploymentUpdatedEmitter;
  now?: () => Date;
};

export function createPinchDeploymentIntegration(
  options: PinchDeploymentIntegrationOptions
) {
  const service = new DeploymentService(
    options.persistence,
    options.emitDeploymentUpdated,
    options.now
  );
  return {
    service,
    router: createDeploymentRouter(service)
  };
}

export type {
  DeploymentEngagementContext,
  DeploymentPersistenceAdapter,
  DeploymentScenario,
  DeploymentUpdatedEmitter,
  DeploymentUpdatedEvent
} from "./types.js";
