import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import express from "express";
import { createServer, type Server } from "node:http";
import type { DeploymentSummary } from "@veltact/contracts";
import { createPinchDeploymentIntegration } from "./integration.js";
import type {
  DeploymentEngagementContext,
  DeploymentPersistenceAdapter,
  DeploymentUpdatedEvent
} from "./types.js";

describe("deployment router", () => {
  let adapter: RouterTestAdapter;
  const events: DeploymentUpdatedEvent[] = [];
  let server: Server;
  let baseUrl: string;

  before(async () => {
    adapter = new RouterTestAdapter();
    const app = express();
    app.use(express.json());
    const integration = createPinchDeploymentIntegration({
      persistence: adapter,
      emitDeploymentUpdated(event) {
        events.push(event);
      }
    });
    app.use("/api", integration.router);
    server = createServer(app);
    server.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    assert(address && typeof address === "object");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  test("requires buyer capability authorization on deployment reads", async () => {
    const response = await fetch(
      `${baseUrl}/api/engagements/eng-route/deployment`
    );
    assert.equal(response.status, 401);
  });

  test("serves and updates the reserved deployment routes", async () => {
    const read = await fetch(
      `${baseUrl}/api/engagements/eng-route/deployment`,
      {
        headers: {
          "x-veltact-buyer-token": "buyer-token"
        }
      }
    );
    assert.equal(read.status, 200);
    const body = (await read.json()) as { deployment: DeploymentSummary };
    assert.equal(body.deployment.milestones.length, 4);
    const first = body.deployment.milestones[0];
    assert(first);

    const invalid = await fetch(
      `${baseUrl}/api/engagements/eng-route/deployment/milestones/${first.id}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-veltact-buyer-token": "buyer-token"
        },
        body: JSON.stringify({
          status: "completed",
          latestUpdate: "Skipped directly to complete."
        })
      }
    );
    assert.equal(invalid.status, 409);

    const updated = await fetch(
      `${baseUrl}/api/engagements/eng-route/deployment/milestones/${first.id}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-veltact-buyer-token": "buyer-token"
        },
        body: JSON.stringify({
          status: "in_progress",
          latestUpdate: "Site assessment is underway."
        })
      }
    );
    assert.equal(updated.status, 200);
    const updatedBody = (await updated.json()) as {
      deployment: DeploymentSummary;
    };
    assert.equal(updatedBody.deployment.progressPercentage, 0);
    assert.equal(updatedBody.deployment.milestones[0]?.status, "in_progress");
    assert.equal(events.length, 1);
    assert.equal(events[0]?.engagementId, "eng-route");
  });
});

class RouterTestAdapter implements DeploymentPersistenceAdapter {
  private deployment: DeploymentSummary | undefined;
  private readonly engagement: DeploymentEngagementContext = {
    engagementId: "eng-route",
    needProfileId: "need-route",
    supplierName: "Industrial Robotics Integration",
    scenario: "robotic_integration",
    commitmentAmount: {
      amount: 750_000,
      currency: "AUD"
    },
    paymentStatus: "paid"
  };

  async findEngagement(engagementId: string) {
    return engagementId === this.engagement.engagementId
      ? this.engagement
      : undefined;
  }

  async isBuyerAuthorized(
    _needProfileId: string,
    buyerAccessToken: string | undefined
  ) {
    return buyerAccessToken === "buyer-token";
  }

  async findDeployment() {
    return this.deployment;
  }

  async saveDeployment(deployment: DeploymentSummary) {
    this.deployment = structuredClone(deployment);
    return this.deployment;
  }
}
