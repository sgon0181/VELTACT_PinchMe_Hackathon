import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import { supplierRegistryResponseSchema } from "@veltact/contracts";
import { env } from "../env.js";
import {
  claimSupplierInvitation,
  createEngagement,
  createNeed,
  createSolutionDecision,
  discoverNeedSuppliers,
  getSupplierRegistryForNeed,
  prepareSupplierLeadInvitationsForNeed,
  recordLocalDemoPayment,
  reloadMarketplaceStore,
  researchNeed,
  resetMarketplaceStore,
  seedMarketplaceDemoFindState,
  submitSupplierResponse,
  upsertSupplierRegistryEntry
} from "./store.js";

const temporaryDirectories: string[] = [];
const originalDataFile = env.MARKETPLACE_DATA_FILE;
const originalResearchProvider = env.VELTACT_RESEARCH_PROVIDER;
const originalDiscoveryProvider = env.VELTACT_DISCOVERY_PROVIDER;

afterEach(() => {
  Object.assign(env, { MARKETPLACE_DATA_FILE: undefined });
  resetMarketplaceStore();
  Object.assign(env, {
    MARKETPLACE_DATA_FILE: originalDataFile,
    VELTACT_RESEARCH_PROVIDER: originalResearchProvider,
    VELTACT_DISCOVERY_PROVIDER: originalDiscoveryProvider
  });
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("supplier registry", { concurrency: false }, () => {
  test("deduplicates identity and upgrades provenance monotonically", () => {
    const discovered = upsertSupplierRegistryEntry({
      buyerEmail: "buyer@example.com",
      needProfileId: "need-1",
      supplierName: "AxisForge Robotics",
      website: "https://www.axisforge.example/services",
      location: "Western Sydney",
      capabilities: ["robot diagnostics"],
      provenanceState: "discovered",
      source: "fixture",
      occurredAt: "2026-07-31T00:00:00.000Z"
    });
    const responded = upsertSupplierRegistryEntry({
      buyerEmail: "BUYER@example.com",
      needProfileId: "need-1",
      supplierName: "AxisForge Robotics Pty Ltd",
      website: "https://axisforge.example/contact",
      location: "Sydney",
      capabilities: ["robot diagnostics", "commissioning"],
      provenanceState: "responded",
      source: "live_discovery",
      responsePrice: { amount: 1_850_000, currency: "AUD" },
      occurredAt: "2026-07-31T00:05:00.000Z"
    });
    const replayedDiscovery = upsertSupplierRegistryEntry({
      buyerEmail: "buyer@example.com",
      needProfileId: "need-1",
      supplierName: "AxisForge Robotics",
      website: "https://axisforge.example",
      location: "Western Sydney",
      capabilities: ["robot diagnostics"],
      provenanceState: "discovered",
      source: "fixture",
      occurredAt: "2026-07-31T00:06:00.000Z"
    });

    assert.equal(discovered.id, responded.id);
    assert.equal(responded.id, replayedDiscovery.id);
    assert.equal(replayedDiscovery.provenanceState, "responded");
    assert.equal(replayedDiscovery.source, "live_discovery");
    assert.deepEqual(replayedDiscovery.capabilities, [
      "robot diagnostics",
      "commissioning"
    ]);
    assert.equal(replayedDiscovery.engagementHistory.length, 1);
    assert.equal(
      replayedDiscovery.engagementHistory[0].responsePrice?.amount,
      1_850_000
    );
  });

  test("writes through the fixture flow, survives reload and reuses entries", async () => {
    const directory = mkdtempSync(
      path.join(os.tmpdir(), "veltact-registry-")
    );
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "marketplace.json");
    Object.assign(env, {
      MARKETPLACE_DATA_FILE: filePath,
      VELTACT_RESEARCH_PROVIDER: "fixture",
      VELTACT_DISCOVERY_PROVIDER: "fixture"
    });

    const firstNeed = createNeed({
      buyerEmail: "projects@demo-packaging.example",
      profile: roboticsNeed()
    });
    const firstResponses = runFixtureResponses(firstNeed.id);
    const engagementResult = createEngagement({
      needId: firstNeed.id,
      supplierResponseId: firstResponses[0]
    });
    assert.equal(engagementResult.status, "created");
    if (engagementResult.status !== "created") return;
    recordLocalDemoPayment({
      eventId: "demo-payment:registry-test",
      eventType: "local-demo-payment",
      engagementId: engagementResult.engagement.id,
      paymentId: "demo_registry_test",
      payload: { source: "local_demo" }
    });

    const registry = getSupplierRegistryForNeed(firstNeed.id);
    assert.doesNotThrow(() => supplierRegistryResponseSchema.parse(registry));
    const fixtureEntries =
      registry?.entries.filter((entry) => entry.source === "fixture") ?? [];
    assert.equal(fixtureEntries.length, 3);
    assert.equal(
      fixtureEntries.filter((entry) => entry.provenanceState === "secured")
        .length,
      1
    );
    assert.equal(
      fixtureEntries.filter((entry) => entry.provenanceState === "responded")
        .length,
      2
    );

    Object.assign(env, { MARKETPLACE_DATA_FILE: undefined });
    resetMarketplaceStore();
    assert.equal(reloadMarketplaceStore(filePath), true);
    assert.equal(
      getSupplierRegistryForNeed(firstNeed.id)?.entries.filter(
        (entry) => entry.source === "fixture"
      ).length,
      3
    );

    Object.assign(env, { MARKETPLACE_DATA_FILE: filePath });
    const secondNeed = createNeed({
      buyerEmail: "projects@demo-packaging.example",
      profile: roboticsNeed()
    });
    const research = await researchNeed(secondNeed.id);
    assert.ok(research);
    const integration = research.researchResult.approaches.find((approach) =>
      approach.id.endsWith(":integration")
    );
    assert.ok(integration);
    const decision = createSolutionDecision(secondNeed.id, {
      decision: "outsource",
      selectedApproachIds: [integration.id]
    });
    assert.equal(decision.status, "created");
    const discovered = await discoverNeedSuppliers(secondNeed.id);
    assert.equal(discovered.status, "discovered");
    if (discovered.status === "discovered") {
      assert.ok(
        discovered.supplierLeads.some((lead) =>
          lead.matchReasons.some((reason) =>
            reason.startsWith("In your supplier bench:")
          )
        )
      );
    }
    const afterSecondNeed =
      getSupplierRegistryForNeed(secondNeed.id)?.entries.filter(
        (entry) => entry.source === "fixture"
      ) ?? [];
    assert.equal(afterSecondNeed.length, 3);
    assert.ok(
      afterSecondNeed.some((entry) => entry.engagementHistory.length === 2)
    );
  });
});

function runFixtureResponses(needId: string) {
  assert.ok(seedMarketplaceDemoFindState(needId));
  const prepared = prepareSupplierLeadInvitationsForNeed(needId);
  assert.equal(prepared.status, "prepared");
  if (prepared.status !== "prepared") return [];

  return prepared.invitations.map((invitation, index) => {
    const claim = claimSupplierInvitation(invitation.token, {
      claimantName: `Supplier ${index + 1}`,
      claimantEmail: `supplier${index + 1}@example.com`
    });
    assert.equal(claim.status, "claimed");
    const submitted = submitSupplierResponse(invitation.token, {
      canHelp: true,
      earliestAvailability: "Within 24 hours",
      indicativePriceAud: 15_000 + index * 1_000,
      relevantExperience: "Comparable industrial robotics recovery.",
      proposedApproach: "Diagnose, isolate and commission safely.",
      conditions: ["Site induction required"]
    });
    assert.equal(submitted.status, "submitted");
    return submitted.status === "submitted"
      ? submitted.supplierResponse.id
      : "";
  });
}

function roboticsNeed() {
  return {
    title: "Robotic palletiser stopped before morning dispatch",
    description:
      "ABB palletising robot stopped mid-cycle and the packaging line cannot restart safely.",
    problemSummary:
      "A robotics specialist must diagnose the cell and restore safe production.",
    category: "industrial robotics and automation",
    industry: "food packaging manufacturing",
    equipmentOrTechnology: ["ABB palletising robot", "Siemens S7 PLC"],
    location: "Western Sydney NSW",
    urgencyDays: 1,
    budgetAud: 18_000,
    constraints: ["Safe restart and handover required"],
    buyerPriority: "speed" as const,
    requiredCapabilities: [
      "Robotic cell fault recovery",
      "ABB robot diagnostics",
      "Safety circuit diagnostics"
    ]
  };
}
