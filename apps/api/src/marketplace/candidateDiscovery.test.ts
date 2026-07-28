import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  supplierLeadSchema,
  type MarketplaceNeedProfile
} from "@veltact/contracts";
import { rankDiscoveredSupplierLeads } from "./candidateDiscovery.js";
import {
  createMarketplaceFixtureResearch,
  createMarketplaceFixtureSupplierLeads
} from "./findFixtures.js";

const generatedAt = new Date("2026-07-28T00:00:00.000Z");
const publicBaseUrl = "https://demo.veltact.test";

describe("selected-pathway supplier discovery", () => {
  test("ranks the Siemens PLC candidates against one selected recovery pathway", () => {
    const profile = plcNeed();
    const research = createMarketplaceFixtureResearch(
      "need-plc",
      profile,
      generatedAt
    );
    const selectedApproach = research.approaches.find((approach) =>
      approach.id.endsWith(":recovery")
    );
    assert.ok(selectedApproach);

    const ranked = rankDiscoveredSupplierLeads({
      profile,
      selectedApproach,
      candidates: createMarketplaceFixtureSupplierLeads(
        "need-plc",
        profile,
        generatedAt
      ),
      publicBaseUrl
    });

    assert.doesNotThrow(() => supplierLeadSchema.array().parse(ranked));
    assert.deepEqual(
      ranked.map((lead) => lead.companyName),
      [
        "EastGrid Automation (Demo)",
        "ControlLine Response (Demo)",
        "LineProof Controls (Demo)"
      ]
    );
    assert.ok(
      ranked.every(
        (lead, index) =>
          index === 0 || ranked[index - 1].matchScore >= lead.matchScore
      )
    );

    const strongestReasons = ranked[0].matchReasons.join(" ");
    assert.match(strongestReasons, /Selected solution fit:/);
    assert.match(strongestReasons, /PLC backup recovery/);
    assert.match(strongestReasons, /drive and I\/O diagnostics/);
    assert.match(strongestReasons, /Equipment fit:/);
    assert.match(strongestReasons, /Location fit:/);
    assert.match(strongestReasons, /Industry fit:/);
    assert.match(strongestReasons, /Buyer priority check:/);
    assert.match(ranked[0].risks.join(" "), /Availability check:/);
    assert.match(ranked[0].risks.join(" "), /Budget check:/);
    assert.ok(
      ranked.every(
        (lead) => lead.logoUrl === undefined && lead.companyName.length > 0
      )
    );
  });

  test("changes the ranking when the selected pathway changes", () => {
    const profile = plcNeed();
    const research = createMarketplaceFixtureResearch(
      "need-plc-pathways",
      profile,
      generatedAt
    );
    const candidates = createMarketplaceFixtureSupplierLeads(
      "need-plc-pathways",
      profile,
      generatedAt
    );
    const triageApproach = research.approaches.find((approach) =>
      approach.id.endsWith(":triage")
    );
    const recoveryApproach = research.approaches.find((approach) =>
      approach.id.endsWith(":recovery")
    );
    assert.ok(triageApproach);
    assert.ok(recoveryApproach);

    const triageRanking = rankDiscoveredSupplierLeads({
      profile,
      selectedApproach: triageApproach,
      candidates,
      publicBaseUrl
    });
    const recoveryRanking = rankDiscoveredSupplierLeads({
      profile,
      selectedApproach: recoveryApproach,
      candidates,
      publicBaseUrl
    });

    assert.notEqual(triageRanking[0].id, recoveryRanking[0].id);
    assert.match(
      triageRanking[0].matchReasons[0],
      new RegExp(triageApproach.title)
    );
    assert.match(
      recoveryRanking[0].matchReasons[0],
      new RegExp(recoveryApproach.title)
    );
  });

  test("adds same-origin logo URLs for the known robotics fixtures", () => {
    const profile = roboticsNeed();
    const research = createMarketplaceFixtureResearch(
      "need-robotics",
      profile,
      generatedAt
    );
    const selectedApproach = research.approaches.find((approach) =>
      approach.id.endsWith(":integration")
    );
    assert.ok(selectedApproach);

    const ranked = rankDiscoveredSupplierLeads({
      profile,
      selectedApproach,
      candidates: createMarketplaceFixtureSupplierLeads(
        "need-robotics",
        profile,
        generatedAt
      ),
      publicBaseUrl
    });

    assert.equal(ranked[0].companyName, "Harbour Motion Systems (Demo)");
    assert.ok(
      ranked.every(
        (lead) =>
          lead.logoUrl?.startsWith(`${publicBaseUrl}/logos/`) &&
          lead.companyName.length > 0
      )
    );
  });
});

function plcNeed(): MarketplaceNeedProfile {
  return {
    title: "Recover a stopped Siemens PLC packaging line",
    description:
      "The line stopped after an intermittent controller communication fault.",
    problemSummary:
      "Restore the stopped Siemens packaging line safely and preserve a verified baseline.",
    category: "Industrial automation breakdown",
    industry: "Food packaging manufacturing",
    equipmentOrTechnology: ["Siemens S7 PLC", "Packaging conveyor"],
    location: "Western Sydney, NSW",
    urgencyDays: 1,
    budgetAud: 20_000,
    buyerPriority: "speed",
    requiredCapabilities: [
      "Siemens PLC diagnostics",
      "Industrial networking"
    ]
  };
}

function roboticsNeed(): MarketplaceNeedProfile {
  return {
    title: "Mixed-carton robotic palletising cell",
    description:
      "Plan a robotic cell for mixed cartons beside the packaging line.",
    category: "Robotics integration",
    industry: "Food packaging manufacturing",
    equipmentOrTechnology: [
      "Industrial robot",
      "Packaging conveyor",
      "End-of-arm tooling"
    ],
    location: "Western Sydney, NSW",
    urgencyDays: 60,
    budgetAud: 120_000,
    buyerPriority: "technical_fit",
    requiredCapabilities: [
      "Robotic systems integration",
      "Machinery safety",
      "Commissioning"
    ]
  };
}
