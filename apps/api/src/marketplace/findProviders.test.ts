import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import type {
  MarketplaceNeedProfile,
  SolutionApproach
} from "@veltact/contracts";
import { env } from "../env.js";
import { createMarketplaceFixtureResearch } from "./findFixtures.js";
import { runSupplierDiscovery } from "./findProviders.js";

const originalProvider = env.VELTACT_RESEARCH_PROVIDER;
const originalOpenAiKey = env.OPENAI_API_KEY;
const originalFirecrawlKey = env.FIRECRAWL_API_KEY;
const originalFetch = globalThis.fetch;

afterEach(() => {
  Object.assign(env, {
    VELTACT_RESEARCH_PROVIDER: originalProvider,
    OPENAI_API_KEY: originalOpenAiKey,
    FIRECRAWL_API_KEY: originalFirecrawlKey
  });
  globalThis.fetch = originalFetch;
});

describe("supplier discovery provider reliability", () => {
  test("falls back to exactly three labelled fixtures when live discovery is underfilled", async () => {
    const profile = roboticsNeed();
    const selectedApproach = roboticsIntegrationApproach(
      "need-live-underfilled",
      profile
    );
    Object.assign(env, {
      VELTACT_RESEARCH_PROVIDER: "auto",
      OPENAI_API_KEY: "test-openai-key",
      FIRECRAWL_API_KEY: undefined
    });
    globalThis.fetch = async () =>
      jsonResponse({
        output_text: JSON.stringify({
          suppliers: [
            liveSupplier("Live Robotics One", 92),
            liveSupplier("Live Robotics Two", 88)
          ]
        })
      });

    const execution = await runSupplierDiscovery(
      "need-live-underfilled",
      profile,
      selectedApproach
    );

    assert.equal(execution.value.length, 3);
    assert.ok(
      execution.value.every((candidate) => candidate.sourceMode === "fixture")
    );
    assert.match(execution.warning ?? "", /fewer than three/i);
  });

  test("keeps Firecrawl search snippets as unverified evidence instead of asserted capabilities", async () => {
    const profile = roboticsNeed();
    const selectedApproach = roboticsIntegrationApproach(
      "need-firecrawl-provenance",
      profile
    );
    Object.assign(env, {
      VELTACT_RESEARCH_PROVIDER: "auto",
      OPENAI_API_KEY: "test-openai-key",
      FIRECRAWL_API_KEY: "test-firecrawl-key"
    });
    globalThis.fetch = async (input) => {
      if (String(input).includes("api.openai.com")) {
        throw new Error("OpenAI discovery unavailable");
      }
      return jsonResponse({
        data: [
          {
            title: "Robotics Integrator One",
            url: "https://integrator-one.example/services",
            description:
              "Robotic cell commissioning and controls integration services."
          },
          {
            title: "Robotics Integrator Two",
            url: "https://integrator-two.example/automation",
            description:
              "Industrial automation and robot programming services."
          },
          {
            title: "Robotics Integrator Three",
            url: "https://integrator-three.example/projects",
            description:
              "Factory acceptance and machinery-safety project support."
          }
        ]
      });
    };

    const execution = await runSupplierDiscovery(
      "need-firecrawl-provenance",
      profile,
      selectedApproach
    );

    assert.equal(execution.value.length, 3);
    assert.ok(
      execution.value.every(
        (candidate) =>
          candidate.sourceMode === "live" &&
          candidate.evidence.every(
            (evidence) => evidence.sourceType === "other"
          ) &&
          candidate.capabilities.length === 1 &&
          !selectedApproach.requiredCapabilities.includes(
            candidate.capabilities[0]
          )
      )
    );
    assert.match(execution.warning ?? "", /Firecrawl search evidence was used/);
  });
});

function roboticsIntegrationApproach(
  needProfileId: string,
  profile: MarketplaceNeedProfile
): SolutionApproach {
  const approach = createMarketplaceFixtureResearch(
    needProfileId,
    profile,
    new Date("2026-07-28T00:00:00.000Z")
  ).approaches.find((candidate) => candidate.id.endsWith(":integration"));
  assert.ok(approach);
  return approach;
}

function liveSupplier(companyName: string, matchScore: number) {
  const slug = companyName.toLowerCase().replaceAll(" ", "-");
  return {
    companyName,
    website: `https://${slug}.example`,
    logoUrl: null,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    location: "Sydney, NSW",
    serviceRegions: ["Sydney", "NSW"],
    capabilities: ["robotic systems integration"],
    matchScore,
    matchReasons: [
      "Public evidence references robotic systems integration."
    ],
    risks: ["Current availability requires confirmation."],
    citations: [
      {
        title: `${companyName} services`,
        url: `https://${slug}.example/services`,
        sourceType: "supplier_website",
        evidenceNote:
          "The public services page references robotic systems integration."
      }
    ]
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
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
