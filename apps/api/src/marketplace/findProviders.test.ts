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
const originalDiscoveryProvider = env.VELTACT_DISCOVERY_PROVIDER;
const originalOpenAiKey = env.OPENAI_API_KEY;
const originalPerplexityKey = env.PERPLEXITY_API_KEY;
const originalFirecrawlKey = env.FIRECRAWL_API_KEY;
const originalFetch = globalThis.fetch;

afterEach(() => {
  Object.assign(env, {
    VELTACT_RESEARCH_PROVIDER: originalProvider,
    VELTACT_DISCOVERY_PROVIDER: originalDiscoveryProvider,
    OPENAI_API_KEY: originalOpenAiKey,
    PERPLEXITY_API_KEY: originalPerplexityKey,
    FIRECRAWL_API_KEY: originalFirecrawlKey
  });
  globalThis.fetch = originalFetch;
});

describe("supplier discovery provider reliability", () => {
  test("emits an ordered, labelled fixture activity trail", async () => {
    const profile = roboticsNeed();
    const selectedApproach = roboticsIntegrationApproach(
      "need-fixture-activity",
      profile
    );
    Object.assign(env, {
      VELTACT_RESEARCH_PROVIDER: "fixture",
      VELTACT_DISCOVERY_PROVIDER: "fixture"
    });
    const activity: Array<{ stage: string; sourceMode: string }> = [];

    await runSupplierDiscovery(
      "need-fixture-activity",
      profile,
      selectedApproach,
      [],
      (event) => activity.push(event)
    );

    assert.ok(activity.length >= 4);
    assert.equal(activity[0].stage, "query_formulation");
    assert.equal(activity.at(-1)?.stage, "completed");
    assert.ok(activity.every((event) => event.sourceMode === "fixture"));
    assert.ok(
      activity.some((event) => event.stage === "candidate_accepted")
    );
  });

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

  test("maps optional Perplexity Sonar output into the canonical cited shortlist", async () => {
    const profile = roboticsNeed();
    const selectedApproach = roboticsIntegrationApproach(
      "need-perplexity",
      profile
    );
    Object.assign(env, {
      VELTACT_DISCOVERY_PROVIDER: "perplexity",
      OPENAI_API_KEY: undefined,
      PERPLEXITY_API_KEY: "test-perplexity-key",
      FIRECRAWL_API_KEY: undefined
    });
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), "https://api.perplexity.ai/v1/sonar");
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer test-perplexity-key"
      );
      const request = JSON.parse(String(init?.body));
      assert.equal(request.model, "sonar");
      assert.equal(request.response_format.type, "json_schema");
      return jsonResponse({
        choices: [
          {
            message: {
              role: "assistant",
              content: JSON.stringify({
                suppliers: [
                  liveSupplier("Perplexity Robotics One", 94),
                  liveSupplier("Perplexity Robotics Two", 90),
                  liveSupplier("Perplexity Robotics Three", 87)
                ]
              })
            }
          }
        ]
      });
    };

    const execution = await runSupplierDiscovery(
      "need-perplexity",
      profile,
      selectedApproach
    );

    assert.equal(execution.value.length, 3);
    assert.ok(
      execution.value.every(
        (candidate) =>
          candidate.sourceMode === "live" &&
          candidate.evidence.length > 0 &&
          candidate.evidence.every(
            (evidence) =>
              evidence.provider === "perplexity" &&
              /^https?:/.test(evidence.url)
          )
      )
    );
  });

  test("rejects non-HTTP model URLs and falls back without exposing them", async () => {
    const profile = roboticsNeed();
    const selectedApproach = roboticsIntegrationApproach(
      "need-invalid-url",
      profile
    );
    Object.assign(env, {
      VELTACT_DISCOVERY_PROVIDER: "auto",
      OPENAI_API_KEY: "test-openai-key",
      PERPLEXITY_API_KEY: undefined,
      FIRECRAWL_API_KEY: undefined
    });
    const malformed = liveSupplier("Unsafe Supplier", 99);
    malformed.website = "ftp://unsafe.example";
    globalThis.fetch = async () =>
      jsonResponse({
        output_text: JSON.stringify({
          suppliers: [
            malformed,
            liveSupplier("Safe Supplier Two", 90),
            liveSupplier("Safe Supplier Three", 85)
          ]
        })
      });

    const execution = await runSupplierDiscovery(
      "need-invalid-url",
      profile,
      selectedApproach
    );

    assert.equal(execution.value.length, 3);
    assert.ok(
      execution.value.every((candidate) => candidate.sourceMode === "fixture")
    );
    assert.match(execution.warning ?? "", /HTTP\(S\)|validation|invalid/i);
    assert.ok(
      execution.value.every(
        (candidate) => !candidate.website.startsWith("ftp:")
      )
    );
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
