import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const mainBundle = await readFile(
  new URL("../public/assets/main.js", import.meta.url),
  "utf8"
);
const helperStart = mainBundle.indexOf(
  "function eligibleDeploymentTransition"
);
const helperEnd = mainBundle.indexOf(
  "\nfunction renderMilestoneUpdate",
  helperStart
);

assert.notEqual(helperStart, -1, "deployment transition helper should exist");
assert.notEqual(helperEnd, -1, "deployment transition helper should be bounded");

const helperSandbox = {};
vm.runInNewContext(
  `${mainBundle.slice(helperStart, helperEnd)}
this.eligibleDeploymentTransition = eligibleDeploymentTransition;`,
  helperSandbox
);
const { eligibleDeploymentTransition } = helperSandbox;

function milestone(sequence, status) {
  return {
    id: `milestone-${sequence}`,
    sequence,
    status
  };
}

test("offers only the first ordered eligible milestone transition", () => {
  const startFunded = eligibleDeploymentTransition({
    milestones: [
      milestone(1, "funded"),
      milestone(2, "not_started")
    ]
  });
  assert.equal(startFunded.milestone.id, "milestone-1");
  assert.equal(startFunded.nextStatus, "in_progress");

  const completeCurrent = eligibleDeploymentTransition({
    milestones: [
      milestone(1, "in_progress"),
      milestone(2, "not_started")
    ]
  });
  assert.equal(completeCurrent.milestone.id, "milestone-1");
  assert.equal(completeCurrent.nextStatus, "completed");

  const startNext = eligibleDeploymentTransition({
    milestones: [
      milestone(1, "completed"),
      milestone(2, "not_started"),
      milestone(3, "funded")
    ]
  });
  assert.equal(startNext.milestone.id, "milestone-2");
  assert.equal(startNext.nextStatus, "in_progress");
});

test("does not skip an ineligible milestone or infer payment completion", () => {
  assert.equal(
    eligibleDeploymentTransition({
      milestones: [
        milestone(1, "awaiting_payment"),
        milestone(2, "funded")
      ]
    }),
    undefined
  );
  assert.equal(
    eligibleDeploymentTransition({
      milestones: [
        milestone(1, "completed"),
        milestone(2, "completed")
      ]
    }),
    undefined
  );
  assert.match(
    mainBundle,
    /Delivery updates do not fund milestones, alter payment evidence or secure suppliers\./
  );
});

test("renders one required delivery-update form and preserves completed handoff", () => {
  assert.match(mainBundle, /id="deployment-milestone-form"/);
  assert.match(mainBundle, /name="latestUpdate"/);
  assert.match(mainBundle, /maxlength="500"/);
  assert.match(mainBundle, /Complete milestone/);
  assert.match(mainBundle, /Start milestone/);
  assert.match(
    mainBundle,
    /data-start-new>Start new requirement<\/button>/
  );
  assert.match(mainBundle, /milestoneUpdateFormHasFocus\(\)/);
});

test("PATCHes the buyer-scoped milestone route and preserves API errors", async () => {
  globalThis.window = {
    location: { origin: "https://buyer.veltact.example" }
  };
  const { RapidMatchService } = await import(
    `../public/assets/rapidMatchService.js?deployment=${Date.now()}`
  );
  const service = new RapidMatchService();
  service.setBuyerAccessToken("need-123", "buyer-token-123");
  const updatedAt = "2026-07-27T00:00:00.000Z";
  const deployment = {
    engagementId: "engagement-123",
    title: "Delivery",
    status: "active",
    progressPercentage: 50,
    currentMilestoneId: "milestone-1",
    nextMilestoneId: "milestone-2",
    milestones: [
      {
        id: "milestone-1",
        engagementId: "engagement-123",
        sequence: 1,
        title: "Assessment",
        status: "in_progress",
        paymentStatus: "paid",
        progressPercentage: 50,
        latestUpdate: "Assessment started.",
        updatedAt
      },
      {
        id: "milestone-2",
        engagementId: "engagement-123",
        sequence: 2,
        title: "Delivery",
        status: "not_started",
        paymentStatus: "not_started",
        progressPercentage: 0,
        updatedAt
      }
    ],
    latestUpdate: "Assessment started.",
    updatedAt
  };
  const workspace = {
    phase: "deploy",
    status: "delivery_active",
    nextAction: "track_delivery",
    needProfile: { id: "need-123" },
    responses: [],
    engagement: {
      id: "engagement-123",
      status: "supplier_secured"
    },
    deployment
  };

  globalThis.fetch = async (url, init) => {
    assert.equal(
      url,
      "https://buyer.veltact.example/api/engagements/engagement-123/deployment/milestones/milestone-1"
    );
    assert.equal(init.method, "PATCH");
    assert.equal(
      init.headers.get("x-veltact-buyer-token"),
      "buyer-token-123"
    );
    assert.deepEqual(JSON.parse(init.body), {
      status: "completed",
      latestUpdate: "Assessment evidence accepted."
    });
    return new Response(JSON.stringify({ deployment }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const updated = await service.updateDeploymentMilestone(
    workspace,
    "milestone-1",
    "completed",
    "Assessment evidence accepted."
  );
  assert.equal(updated.deployment.engagementId, "engagement-123");

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        message: "The previous milestone must be completed before work can start"
      }),
      {
        status: 409,
        headers: { "content-type": "application/json" }
      }
    );
  await assert.rejects(
    () =>
      service.updateDeploymentMilestone(
        workspace,
        "milestone-2",
        "in_progress",
        "Starting early."
      ),
    /The previous milestone must be completed before work can start/
  );
});
