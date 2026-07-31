import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type {
  MarketplaceNeedProfile,
  SolutionResearchResult
} from "@veltact/contracts";
import { createFixtureResearch } from "../v2/fixtures.js";
import {
  createMarketplaceFixtureResearch,
  createMarketplaceFixtureSupplierLeads,
  inferMarketplaceDemoScenario
} from "./findFixtures.js";

const roboticsProfile: MarketplaceNeedProfile = {
  title: "Mixed-carton robotic palletising cell",
  description:
    "Plan a robotic cell that palletises mixed cartons from the existing packaging conveyor.",
  category: "Robotics integration",
  industry: "Food and beverage manufacturing",
  equipmentOrTechnology: ["industrial robot", "conveyor"],
  location: "Western Sydney, NSW",
  urgencyDays: 60,
  budgetAud: 120_000,
  constraints: ["Maintain access to the adjacent packaging line"],
  buyerPriority: "technical_fit",
  requiredCapabilities: [
    "robotic systems integration",
    "machinery safety",
    "commissioning"
  ]
};

const processHeatingProfile: MarketplaceNeedProfile = {
  title: "Extruder barrel heating fault with high-torque alarm",
  description:
    "Zone 3 heater band on the barrel is dead; the plastic isn't melting right, causing a high-torque alarm on the screw.",
  category: "Plastics processing maintenance",
  industry: "Plastics manufacturing",
  equipmentOrTechnology: [
    "Plastics extrusion machine",
    "Extruder barrel heating zone",
    "Extruder screw drive"
  ],
  location: "Western Sydney, NSW",
  urgencyDays: 1,
  constraints: ["Production equipment unavailable"],
  buyerPriority: "technical_fit",
  requiredCapabilities: [
    "Industrial process heating diagnostics",
    "Industrial electrical fault finding",
    "Extruder screw-drive assessment"
  ]
};

const expectedOfficialSources = [
  {
    title: "Guide for safe design of plant",
    url: "https://www.safeworkaustralia.gov.au/doc/guide-safe-design-plant",
    sourceType: "standards"
  },
  {
    title:
      "ISO 10218-2:2025 — Robotics — Safety requirements — Part 2: Industrial robot applications and robot cells",
    url: "https://www.iso.org/standard/73934.html",
    sourceType: "standards"
  },
  {
    title: "ABB Robotics",
    url: "https://www.abb.com/global/en/areas/robotics",
    sourceType: "manufacturer"
  }
] as const;

const gearboxProfile: MarketplaceNeedProfile = {
  title:
    "Conveyor motor gearbox on our bottling line in Newcastle NSW is overheating and…",
  description:
    "Conveyor motor gearbox on our bottling line in Newcastle NSW is overheating and tripping thermal protection every 2-3 hours. Production down to 40% capacity.",
  category: "Industrial mechanical maintenance",
  industry: "Beverage manufacturing",
  equipmentOrTechnology: [
    "Industrial gearbox",
    "Industrial motor",
    "Packaging conveyor",
    "Bottling line"
  ],
  location: "Newcastle, NSW",
  urgencyDays: 2,
  budgetAud: 20_000,
  buyerPriority: "speed",
  requiredCapabilities: [
    "Industrial gearbox diagnostics",
    "Industrial motor diagnostics",
    "Industrial mechanical maintenance",
    "Mechanical condition assessment",
    "Conveyor fault recovery"
  ]
};

describe("marketplace fixture scenario inference", () => {
  test("selects robotics, PLC and generic scenarios explicitly", () => {
    assert.equal(inferMarketplaceDemoScenario(roboticsProfile), "robotics");
    assert.equal(
      inferMarketplaceDemoScenario({
        ...roboticsProfile,
        title: "Siemens controller fault",
        description: "A Siemens PLC stopped the filling line.",
        category: "Industrial automation",
        equipmentOrTechnology: ["Siemens PLC"],
        requiredCapabilities: ["PLC fault finding"]
      }),
      "plc"
    );
    assert.equal(inferMarketplaceDemoScenario(gearboxProfile), "general");
  });

  test("templates generic pathways and supplier matches from the requirement", () => {
    const generatedAt = new Date("2026-07-30T00:00:00.000Z");
    const research = createMarketplaceFixtureResearch(
      "marketplace-gearbox-need",
      gearboxProfile,
      generatedAt
    );
    const leads = createMarketplaceFixtureSupplierLeads(
      "marketplace-gearbox-need",
      gearboxProfile,
      generatedAt
    );
    const rendered = JSON.stringify({ research, leads });

    assert.equal(research.approaches.length, 3);
    assert.match(research.id, /research:general$/);
    assert.match(rendered, /Industrial gearbox/);
    assert.match(rendered, /Industrial gearbox diagnostics/);
    assert.match(rendered, /Newcastle/);
    assert.doesNotMatch(rendered, /Siemens|\bPLC\b|controller|backup/i);
    assert.ok(
      leads.every((lead) =>
        lead.matchReasons.some((reason) =>
          /Industrial gearbox diagnostics/i.test(reason)
        )
      )
    );
  });
});

describe("robotics research fixture citations", () => {
  test("uses current official primary sources in both canonical fixture paths", () => {
    const generatedAt = new Date("2026-07-27T00:00:00.000Z");
    const results: SolutionResearchResult[] = [
      createMarketplaceFixtureResearch(
        "marketplace-robotics-need",
        roboticsProfile,
        generatedAt
      ),
      createFixtureResearch("v2-robotics-need", roboticsProfile, generatedAt)
    ];

    for (const result of results) {
      assert.deepEqual(
        result.citations.map(({ title, url, sourceType }) => ({
          title,
          url,
          sourceType
        })),
        expectedOfficialSources
      );
      assert.ok(
        result.citations.every(
          (citation) =>
            citation.provider === "fixture" &&
            new URL(citation.url).protocol === "https:"
        )
      );
      assert.ok(
        result.approaches.every((approach) =>
          approach.citationIds.every((citationId) =>
            result.citations.some((citation) => citation.id === citationId)
          )
        )
      );
    }
  });
});

describe("fixture supplier lead commercial context", () => {
  test("uses the current need budget instead of leaking another scenario's budget", () => {
    const plcProfile: MarketplaceNeedProfile = {
      ...roboticsProfile,
      title: "Urgent Siemens PLC fault",
      description: "Restore a stopped packaging line after a Siemens PLC fault.",
      category: "Industrial automation",
      equipmentOrTechnology: ["Siemens PLC"],
      requiredCapabilities: ["Siemens PLC diagnostics"],
      urgencyDays: 1,
      budgetAud: 1_800
    };

    const leads = createMarketplaceFixtureSupplierLeads(
      "marketplace-plc-need",
      plcProfile,
      new Date("2026-07-27T00:00:00.000Z")
    );
    const risks = leads.flatMap((lead) => lead.risks);

    assert.ok(risks.some((risk) => risk.includes("AUD 1,800 budget")));
    assert.ok(risks.every((risk) => !risk.includes("AUD 20,000")));
    assert.ok(risks.every((risk) => !risk.includes("AUD 120,000")));
  });

  test("does not invent a budget when the need has none", () => {
    const profileWithoutBudget: MarketplaceNeedProfile = {
      ...roboticsProfile,
      budgetAud: undefined
    };

    const risks = createMarketplaceFixtureSupplierLeads(
      "marketplace-no-budget-need",
      profileWithoutBudget,
      new Date("2026-07-27T00:00:00.000Z")
    ).flatMap((lead) => lead.risks);

    assert.ok(risks.some((risk) => risk === "Commercial fit requires a supplier response."));
    assert.ok(risks.every((risk) => !/AUD [\d,]+ budget/.test(risk)));
  });
});

describe("plastics extrusion fixture path", () => {
  test("returns relevant solution pathways, citations and supplier leads", () => {
    const generatedAt = new Date("2026-07-30T00:00:00.000Z");
    const research = createMarketplaceFixtureResearch(
      "marketplace-process-heating-need",
      processHeatingProfile,
      generatedAt
    );
    const leads = createMarketplaceFixtureSupplierLeads(
      "marketplace-process-heating-need",
      processHeatingProfile,
      generatedAt
    );

    assert.match(research.id, /research:process_heating$/);
    assert.match(research.overview, /extrusion heating loss/i);
    assert.ok(
      research.approaches.some(
        (approach) =>
          approach.title === "Authorised heating-zone and extrusion assessment"
      )
    );
    assert.ok(
      research.approaches.every(
        (approach) => !/Siemens|PLC|robotic pallet/i.test(approach.title)
      )
    );
    assert.deepEqual(
      research.citations.map((citation) => new URL(citation.url).hostname),
      [
        "www.safeworkaustralia.gov.au",
        "www.safework.nsw.gov.au",
        "www.watlow.com"
      ]
    );
    assert.equal(leads.length, 3);
    assert.ok(
      leads.some((lead) =>
        lead.capabilities.includes("industrial process heating diagnostics")
      )
    );
    assert.ok(
      leads.some((lead) =>
        lead.capabilities.includes("plastics extrusion equipment diagnostics")
      )
    );
    assert.ok(
      leads.every(
        (lead) => !lead.capabilities.some((capability) => /\bPLC\b|robot/i.test(capability))
      )
    );
  });
});
