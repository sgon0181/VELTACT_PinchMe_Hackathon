import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  deploymentSummarySchema,
  type DeploymentSummary
} from "@veltact/contracts";
import {
  DeploymentService,
  DeploymentServiceError
} from "./service.js";
import type {
  DeploymentEngagementContext,
  DeploymentPersistenceAdapter,
  DeploymentUpdatedEvent
} from "./types.js";

describe("DeploymentService", () => {
  test("creates the four-stage PLC and robotics projections", async () => {
    const plcAdapter = new MemoryDeploymentAdapter(plcEngagement());
    const plc = await new DeploymentService(plcAdapter).getDeployment(
      "eng-plc",
      "buyer-token"
    );
    assert.deepEqual(
      plc.milestones.map((milestone) => milestone.title),
      ["Diagnosis", "Recovery", "Validation", "Handover"]
    );
    assert.equal(plc.milestones[0]?.amount?.amount, 150_000);
    assert.equal(plc.milestones.slice(1).every((milestone) => !milestone.amount), true);

    const roboticsAdapter = new MemoryDeploymentAdapter(roboticsEngagement());
    const robotics = await new DeploymentService(roboticsAdapter).getDeployment(
      "eng-robotics",
      "buyer-token"
    );
    assert.deepEqual(
      robotics.milestones.map((milestone) => milestone.title),
      [
        "Site Assessment / Scoping Visit",
        "Design",
        "Installation",
        "Commissioning"
      ]
    );
    assert.equal(robotics.milestones[0]?.status, "awaiting_payment");
    assert.equal(robotics.status, "commitment_pending");
    assert.doesNotThrow(() => deploymentSummarySchema.parse(robotics));
  });

  test("funding activates the commitment without completing engineering work", async () => {
    const adapter = new MemoryDeploymentAdapter({
      ...roboticsEngagement(),
      paymentStatus: "paid"
    });
    const deployment = await new DeploymentService(adapter).getDeployment(
      "eng-robotics",
      "buyer-token"
    );

    assert.equal(deployment.status, "active");
    assert.equal(deployment.progressPercentage, 0);
    assert.equal(
      deployment.milestones[0]?.title,
      "Site Assessment / Scoping Visit"
    );
    assert.equal(deployment.milestones[0]?.status, "funded");
    assert.equal(deployment.milestones[0]?.progressPercentage, 0);
    assert.equal(
      deployment.milestones.some(
        (milestone) => milestone.status === "completed"
      ),
      false
    );
    assert.match(deployment.latestUpdate ?? "", /not yet complete/);
  });

  test("derives progress only from ordered milestone completion", async () => {
    const adapter = new MemoryDeploymentAdapter({
      ...plcEngagement(),
      paymentStatus: "paid"
    });
    const updates: DeploymentUpdatedEvent[] = [];
    const service = new DeploymentService(
      adapter,
      (event) => {
        updates.push(event);
      },
      sequenceClock()
    );
    const initial = await service.getDeployment("eng-plc", "buyer-token");
    const first = initial.milestones[0];
    const second = initial.milestones[1];
    assert(first && second);

    await assert.rejects(
      service.updateMilestone({
        engagementId: "eng-plc",
        milestoneId: second.id,
        buyerAccessToken: "buyer-token",
        status: "in_progress",
        latestUpdate: "Recovery started."
      }),
      conflict(/previous milestone/)
    );
    await assert.rejects(
      service.updateMilestone({
        engagementId: "eng-plc",
        milestoneId: first.id,
        buyerAccessToken: "buyer-token",
        status: "completed",
        latestUpdate: "Diagnosis complete."
      }),
      conflict(/in progress/)
    );

    const inProgress = await service.updateMilestone({
      engagementId: "eng-plc",
      milestoneId: first.id,
      buyerAccessToken: "buyer-token",
      status: "in_progress",
      latestUpdate: "Controlled diagnosis has started."
    });
    assert.equal(inProgress.progressPercentage, 0);
    assert.equal(inProgress.milestones[0]?.progressPercentage, 50);

    const completed = await service.updateMilestone({
      engagementId: "eng-plc",
      milestoneId: first.id,
      buyerAccessToken: "buyer-token",
      status: "completed",
      latestUpdate: "Diagnosis evidence accepted."
    });
    assert.equal(completed.progressPercentage, 25);
    assert.equal(completed.currentMilestoneId, second.id);
    assert.equal(updates.length, 2);
    assert.equal(updates[1]?.needProfileId, "need-plc");
  });

  test("requires buyer capability authorization", async () => {
    const adapter = new MemoryDeploymentAdapter(plcEngagement());
    const service = new DeploymentService(adapter);

    await assert.rejects(
      service.getDeployment("eng-plc", undefined),
      authorizationError()
    );
    await assert.rejects(
      service.getDeployment("eng-plc", "wrong-token"),
      authorizationError()
    );
    assert.equal(adapter.deployments.size, 0);
  });

  test("synchronizes authoritative paid state without advancing progress", async () => {
    const engagement = roboticsEngagement();
    const adapter = new MemoryDeploymentAdapter(engagement);
    const service = new DeploymentService(adapter, undefined, sequenceClock());
    const pending = await service.getDeployment(
      engagement.engagementId,
      "buyer-token"
    );
    assert.equal(pending.milestones[0]?.status, "awaiting_payment");

    engagement.paymentStatus = "paid";
    const funded = await service.getDeployment(
      engagement.engagementId,
      "buyer-token"
    );
    assert.equal(funded.milestones[0]?.status, "funded");
    assert.equal(funded.progressPercentage, 0);
    assert.equal(funded.milestones[1]?.status, "not_started");
  });
});

class MemoryDeploymentAdapter implements DeploymentPersistenceAdapter {
  readonly deployments = new Map<string, DeploymentSummary>();

  constructor(readonly engagement: DeploymentEngagementContext) {}

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

  async findDeployment(engagementId: string) {
    return this.deployments.get(engagementId);
  }

  async saveDeployment(deployment: DeploymentSummary) {
    const saved = structuredClone(deployment);
    this.deployments.set(saved.engagementId, saved);
    return saved;
  }
}

function plcEngagement(): DeploymentEngagementContext {
  return {
    engagementId: "eng-plc",
    needProfileId: "need-plc",
    supplierName: "Controls Response Group",
    scenario: "plc_recovery",
    commitmentAmount: {
      amount: 150_000,
      currency: "AUD"
    },
    paymentStatus: "not_started"
  };
}

function roboticsEngagement(): DeploymentEngagementContext {
  return {
    engagementId: "eng-robotics",
    needProfileId: "need-robotics",
    supplierName: "Industrial Robotics Integration",
    scenario: "robotic_integration",
    commitmentAmount: {
      amount: 750_000,
      currency: "AUD"
    },
    paymentStatus: "awaiting_payment"
  };
}

function sequenceClock() {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 6, 26, 0, 0, tick++));
}

function conflict(pattern: RegExp) {
  return (error: unknown) =>
    error instanceof DeploymentServiceError &&
    error.statusCode === 409 &&
    pattern.test(error.message);
}

function authorizationError() {
  return (error: unknown) =>
    error instanceof DeploymentServiceError && error.statusCode === 401;
}
