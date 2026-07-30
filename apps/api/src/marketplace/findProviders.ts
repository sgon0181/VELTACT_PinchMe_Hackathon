import { randomUUID } from "node:crypto";
import {
  evidenceSourceTypeSchema,
  solutionResearchResultSchema,
  supplierLeadSchema,
  type AgentActivityEvent,
  type MarketplaceNeedProfile,
  type ResearchCitation,
  type SolutionApproach,
  type SolutionResearchResult,
  type SupplierLead
} from "@veltact/contracts";
import { z } from "zod";
import { env } from "../env.js";
import {
  createMarketplaceFixtureResearch,
  createMarketplaceFixtureSupplierLeads
} from "./findFixtures.js";
import {
  rankDiscoveredSupplierLeads,
  type SupplierRecommendationHistory
} from "./candidateDiscovery.js";

const httpUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Only public HTTP(S) URLs are allowed");

const liveCitationSchema = z.object({
  title: z.string().trim().min(1),
  url: httpUrlSchema,
  sourceType: evidenceSourceTypeSchema,
  evidenceNote: z.string().trim().min(1)
});

const liveResearchPayloadSchema = z.object({
  overview: z.string().trim().min(1),
  approaches: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        summary: z.string().trim().min(1),
        rationale: z.string().trim().min(1),
        localActions: z.array(z.string().trim().min(1)),
        outsourceTriggers: z.array(z.string().trim().min(1)).min(1),
        requiredCapabilities: z.array(z.string().trim().min(1)).min(1),
        risks: z.array(z.string().trim().min(1)),
        confidence: z.number().min(0).max(1),
        citations: z.array(liveCitationSchema).min(1)
      })
    )
    .min(1)
    .max(4),
  missingInformation: z.array(z.string().trim().min(1))
});

const liveDiscoveryPayloadSchema = z.object({
  suppliers: z
    .array(
      z.object({
        companyName: z.string().trim().min(1),
        website: httpUrlSchema,
        logoUrl: httpUrlSchema.nullable(),
        contactName: z.string().trim().min(1).nullable(),
        contactEmail: z.string().trim().email().nullable(),
        contactPhone: z.string().trim().min(1).nullable(),
        location: z.string().trim().min(1),
        serviceRegions: z.array(z.string().trim().min(1)),
        capabilities: z.array(z.string().trim().min(1)).min(1),
        matchScore: z.number().min(0).max(100),
        matchReasons: z.array(z.string().trim().min(1)).min(1),
        risks: z.array(z.string().trim().min(1)),
        citations: z.array(liveCitationSchema).min(1)
      })
    )
    .min(1)
    .max(8)
});

export type MarketplaceProviderExecution<T> = {
  value: T;
  warning?: string;
};

export type ProviderActivityUpdate = Pick<
  AgentActivityEvent,
  | "operation"
  | "stage"
  | "message"
  | "detail"
  | "sourceMode"
  | "sourceUrl"
>;
export type ProviderActivityReporter = (
  update: ProviderActivityUpdate
) => void;

export async function runSolutionResearch(
  needProfileId: string,
  profile: MarketplaceNeedProfile,
  onActivity?: ProviderActivityReporter
): Promise<MarketplaceProviderExecution<SolutionResearchResult>> {
  if (shouldUseFixture()) {
    const value = createMarketplaceFixtureResearch(needProfileId, profile);
    reportResearchActivity(value, onActivity);
    return {
      value
    };
  }

  onActivity?.({
    operation: "research",
    stage: "query_formulation",
    message: "Formulated industrial solution research queries.",
    detail: `${profile.category} in ${profile.location}`,
    sourceMode: "live"
  });
  try {
    const value = await researchWithOpenAi(needProfileId, profile);
    reportResearchActivity(value, onActivity, true);
    return {
      value
    };
  } catch (error) {
    if (env.VELTACT_RESEARCH_PROVIDER === "openai") {
      throw error;
    }
    onActivity?.({
      operation: "research",
      stage: "fallback",
      message: "Live research was unavailable; switched to labelled fixtures.",
      detail: errorMessage(error),
      sourceMode: "fixture"
    });
    const value = createMarketplaceFixtureResearch(needProfileId, profile);
    reportResearchActivity(value, onActivity, false, true);
    return {
      value,
      warning: `Live research was unavailable; deterministic fixture evidence was used. ${errorMessage(error)}`
    };
  }
}

export async function runSupplierDiscovery(
  needProfileId: string,
  profile: MarketplaceNeedProfile,
  selectedApproach: SolutionApproach,
  registryCandidates: SupplierLead[] = [],
  onActivity?: ProviderActivityReporter,
  recommendationHistoryBySupplierId: ReadonlyMap<
    string,
    SupplierRecommendationHistory
  > = new Map()
): Promise<MarketplaceProviderExecution<SupplierLead[]>> {
  const rankCandidates = (candidates: SupplierLead[]) =>
    rankDiscoveredSupplierLeads({
      profile,
      selectedApproach,
      candidates,
      publicBaseUrl: env.PUBLIC_BASE_URL,
      recommendationHistoryBySupplierId
    });
  const requireCompleteShortlist = (
    provider: string,
    candidates: SupplierLead[]
  ) => {
    const rankedCandidates = rankCandidates(candidates);
    if (rankedCandidates.length !== 3) {
      throw new Error(
        `${provider} returned fewer than three distinct supplier candidates.`
      );
    }
    return rankedCandidates;
  };

  const discoveryProvider = selectedDiscoveryProvider();
  if (discoveryProvider === "fixture") {
    const fixtures = createMarketplaceFixtureSupplierLeads(
      needProfileId,
      profile
    );
    const value = rankCandidates([...registryCandidates, ...fixtures]);
    reportDiscoveryActivity({
      rawCandidates: [...registryCandidates, ...fixtures],
      acceptedCandidates: value,
      sourceMode: "fixture",
      onActivity
    });
    return {
      value
    };
  }

  onActivity?.({
    operation: "discovery",
    stage: "query_formulation",
    message: "Formulated supplier discovery queries for the selected pathway.",
    detail: selectedApproach.requiredCapabilities.join(", "),
    sourceMode: "live"
  });
  const discoverySignal = AbortSignal.timeout(20_000);
  try {
    const discovered =
      discoveryProvider === "perplexity"
        ? await discoverWithPerplexity(
            needProfileId,
            profile,
            selectedApproach,
            discoverySignal
          )
        : await discoverWithOpenAi(
            needProfileId,
            profile,
            selectedApproach,
            discoverySignal
          );
    const rawCandidates = [...registryCandidates, ...discovered];
    const value = requireCompleteShortlist(
      `${discoveryProvider} supplier discovery`,
      rawCandidates
    );
    reportDiscoveryActivity({
      rawCandidates,
      acceptedCandidates: value,
      sourceMode: "live",
      onActivity,
      skipQuery: true
    });
    return { value };
  } catch (error) {
    if (
      env.VELTACT_DISCOVERY_PROVIDER === "auto" &&
      env.FIRECRAWL_API_KEY
    ) {
      try {
        const firecrawlLeads = await discoverWithFirecrawl(
          needProfileId,
          profile,
          selectedApproach.requiredCapabilities,
          discoverySignal
        );
        const rankedFirecrawlLeads = rankCandidates([
          ...registryCandidates,
          ...firecrawlLeads
        ]);
        if (rankedFirecrawlLeads.length === 3) {
          onActivity?.({
            operation: "discovery",
            stage: "fallback",
            message: "OpenAI discovery was unavailable; used Firecrawl search evidence.",
            detail: errorMessage(error),
            sourceMode: "live"
          });
          reportDiscoveryActivity({
            rawCandidates: [...registryCandidates, ...firecrawlLeads],
            acceptedCandidates: rankedFirecrawlLeads,
            sourceMode: "live",
            onActivity,
            skipQuery: true
          });
          return {
            value: rankedFirecrawlLeads,
            warning:
              "OpenAI discovery was unavailable; Firecrawl search evidence was used. Candidate identity and contact details require buyer review."
          };
        }
      } catch {
        // Deterministic fixtures remain the final fallback in auto mode.
      }
    }
    if (env.VELTACT_DISCOVERY_PROVIDER !== "auto") {
      throw error;
    }
    onActivity?.({
      operation: "discovery",
      stage: "fallback",
      message: "Live discovery was unavailable; switched to labelled fixtures.",
      detail: errorMessage(error),
      sourceMode: "fixture"
    });
    const fixtures = createMarketplaceFixtureSupplierLeads(
      needProfileId,
      profile
    );
    const rawCandidates = [...registryCandidates, ...fixtures];
    const value = rankCandidates(rawCandidates);
    reportDiscoveryActivity({
      rawCandidates,
      acceptedCandidates: value,
      sourceMode: "fixture",
      onActivity,
      skipQuery: true
    });
    return {
      value,
      warning: `Live supplier discovery was unavailable; deterministic fixture candidates were used. ${errorMessage(error)}`
    };
  }
}

function reportResearchActivity(
  result: SolutionResearchResult,
  onActivity: ProviderActivityReporter | undefined,
  skipQuery = false,
  fallback = false
) {
  if (!onActivity) return;
  if (!skipQuery) {
    onActivity({
      operation: "research",
      stage: "query_formulation",
      message: fallback
        ? "Prepared deterministic fallback research for this requirement."
        : "Prepared industrial solution research for this requirement.",
      sourceMode: result.sourceMode
    });
  }
  for (const citation of result.citations.slice(0, 2)) {
    onActivity({
      operation: "research",
      stage: "source_read",
      message: `Read ${citation.title}.`,
      detail: citation.evidenceNote,
      sourceMode: result.sourceMode,
      sourceUrl: citation.url
    });
  }
  for (const approach of result.approaches.slice(0, 3)) {
    onActivity({
      operation: "research",
      stage: "candidate_considered",
      message: `Evaluated pathway: ${approach.title}.`,
      detail: approach.rationale,
      sourceMode: result.sourceMode
    });
  }
  onActivity({
    operation: "research",
    stage: "completed",
    message: `Prepared ${result.approaches.length} buyer-reviewable solution pathways.`,
    sourceMode: result.sourceMode
  });
}

function reportDiscoveryActivity(input: {
  rawCandidates: SupplierLead[];
  acceptedCandidates: SupplierLead[];
  sourceMode: "live" | "fixture";
  onActivity?: ProviderActivityReporter;
  skipQuery?: boolean;
}) {
  if (!input.onActivity) return;
  if (!input.skipQuery) {
    input.onActivity({
      operation: "discovery",
      stage: "query_formulation",
      message: "Prepared supplier queries from the approved solution pathway.",
      sourceMode: input.sourceMode
    });
  }
  const evidence = input.rawCandidates
    .flatMap((candidate) => candidate.evidence)
    .filter(
      (citation, index, values) =>
        values.findIndex((item) => item.url === citation.url) === index
    )
    .slice(0, 2);
  for (const citation of evidence) {
    input.onActivity({
      operation: "discovery",
      stage: "source_read",
      message: `Read supplier source: ${citation.title}.`,
      detail: citation.evidenceNote,
      sourceMode: input.sourceMode,
      sourceUrl: citation.url
    });
  }
  for (const candidate of input.rawCandidates.slice(0, 8)) {
    input.onActivity({
      operation: "discovery",
      stage: "candidate_considered",
      message: `Considered ${candidate.companyName}.`,
      detail:
        candidate.matchReasons[0] ??
        "Candidate fit required further review.",
      sourceMode: input.sourceMode,
      sourceUrl: candidate.website
    });
  }
  const acceptedIds = new Set(
    input.acceptedCandidates.map((candidate) => candidate.id)
  );
  for (const candidate of input.acceptedCandidates) {
    input.onActivity({
      operation: "discovery",
      stage: "candidate_accepted",
      message: `Accepted ${candidate.companyName} for buyer review.`,
      detail:
        candidate.matchReasons[0] ??
        "Candidate met the shortlist threshold.",
      sourceMode: input.sourceMode,
      sourceUrl: candidate.website
    });
  }
  for (const candidate of input.rawCandidates.filter(
    (item) => !acceptedIds.has(item.id)
  )) {
    input.onActivity({
      operation: "discovery",
      stage: "candidate_rejected",
      message: `Held ${candidate.companyName} outside the shortlist.`,
      detail:
        candidate.risks[0] ??
        "Other candidates showed stronger selected-pathway fit.",
      sourceMode: input.sourceMode,
      sourceUrl: candidate.website
    });
  }
  input.onActivity({
    operation: "discovery",
    stage: "completed",
    message: `Prepared ${input.acceptedCandidates.length} explainable supplier matches.`,
    sourceMode: input.sourceMode
  });
}

async function researchWithOpenAi(
  needProfileId: string,
  profile: MarketplaceNeedProfile
): Promise<SolutionResearchResult> {
  const payload = liveResearchPayloadSchema.parse(
    await requestOpenAiJson({
      name: "rapidmatch_solution_research",
      schema: researchJsonSchema,
      system:
        "You are Veltact's industrial procurement research assistant. Research credible, high-level solution pathways for an Australian factory requirement. Do not diagnose a fault, provide PLC code, suggest bypassing safeguards, or instruct the user to alter live machinery. Distinguish safe evidence gathering from work requiring authorised specialists. Cite every approach with public primary or authoritative sources and return only the requested JSON.",
      user: JSON.stringify(profile)
    })
  );
  const generatedAt = new Date().toISOString();
  const citationsByUrl = new Map<string, ResearchCitation>();
  const approaches = payload.approaches.map((approach) => {
    const citationIds = approach.citations.map((citation) => {
      const existing = citationsByUrl.get(citation.url);
      if (existing) return existing.id;
      const source = normaliseCitation(
        citation,
        "openai_web_search",
        generatedAt
      );
      citationsByUrl.set(citation.url, source);
      return source.id;
    });
    return {
      id: randomUUID(),
      needProfileId,
      title: approach.title,
      summary: approach.summary,
      rationale: approach.rationale,
      localActions: approach.localActions,
      outsourceTriggers: approach.outsourceTriggers,
      requiredCapabilities: approach.requiredCapabilities,
      risks: approach.risks,
      confidence: approach.confidence,
      citationIds
    };
  });

  return solutionResearchResultSchema.parse({
    id: randomUUID(),
    needProfileId,
    sourceMode: "live",
    overview: payload.overview,
    approaches,
    citations: [...citationsByUrl.values()],
    missingInformation: payload.missingInformation,
    safetyNotice:
      "AI-assisted procurement research only. This is not a diagnosis or an instruction to inspect, isolate, program, bypass safeguards or restart industrial equipment.",
    generatedAt
  });
}

async function discoverWithOpenAi(
  needProfileId: string,
  profile: MarketplaceNeedProfile,
  selectedApproach: SolutionApproach,
  signal: AbortSignal
): Promise<SupplierLead[]> {
  const payload = liveDiscoveryPayloadSchema.parse(
    await requestOpenAiJson({
      name: "rapidmatch_supplier_discovery",
      schema: discoveryJsonSchema,
      system:
        "You are Veltact's Australian industrial supplier discovery assistant. Find at least 3 and up to 8 relevant real supplier businesses using public web evidence for the single buyer-selected solution pathway. Prefer official supplier websites. Provide an official logo URL only when that exact image URL is supported by the cited supplier website; otherwise return null. Do not infer certifications, availability, consent, verification, enrolment or contact details. Return contact fields only when explicitly published on a cited source; otherwise return null. Return public discovery evidence only; the buyer must review every candidate before outreach. Return only the requested JSON.",
      user: JSON.stringify({ profile, selectedApproach }),
      signal
    })
  );
  return mapLiveSuppliers(
    needProfileId,
    payload,
    "openai_web_search"
  );
}

async function discoverWithPerplexity(
  needProfileId: string,
  profile: MarketplaceNeedProfile,
  selectedApproach: SolutionApproach,
  signal: AbortSignal
): Promise<SupplierLead[]> {
  if (!env.PERPLEXITY_API_KEY) {
    throw new Error("PERPLEXITY_API_KEY is not configured");
  }
  const response = await fetch("https://api.perplexity.ai/v1/sonar", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [
        {
          role: "system",
          content:
            "Find 3 to 8 relevant real Australian industrial suppliers for the buyer-selected pathway using public evidence. Prefer official supplier websites. Never infer consent, verification, enrolment, certifications, current availability or unpublished contact details. Return only the requested JSON."
        },
        {
          role: "user",
          content: JSON.stringify({ profile, selectedApproach })
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          schema: discoveryJsonSchema
        }
      }
    }),
    signal
  });
  const responsePayload = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(
      `Perplexity returned HTTP ${response.status}: ${providerError(responsePayload)}`
    );
  }
  const outputText = extractPerplexityOutputText(responsePayload);
  if (!outputText) {
    throw new Error("Perplexity response did not contain structured output");
  }
  const payload = liveDiscoveryPayloadSchema.parse(JSON.parse(outputText));
  return mapLiveSuppliers(needProfileId, payload, "perplexity");
}

function mapLiveSuppliers(
  needProfileId: string,
  payload: z.infer<typeof liveDiscoveryPayloadSchema>,
  provider: "openai_web_search" | "perplexity"
) {
  const now = new Date().toISOString();
  return supplierLeadSchema.array().parse(
    payload.suppliers.slice(0, 8).map((supplier) => ({
      id: randomUUID(),
      needProfileId,
      companyName: supplier.companyName,
      website: supplier.website,
      logoUrl: supplier.logoUrl ?? undefined,
      contactName: supplier.contactName ?? undefined,
      contactEmail: supplier.contactEmail ?? undefined,
      contactPhone: supplier.contactPhone ?? undefined,
      location: supplier.location,
      serviceRegions: supplier.serviceRegions,
      capabilities: supplier.capabilities,
      matchScore: supplier.matchScore,
      matchReasons: supplier.matchReasons,
      risks: [
        ...supplier.risks,
        "Public evidence produced this candidate; it is not a verified or enrolled supplier."
      ],
      evidence: supplier.citations.map((citation) =>
        normaliseCitation(citation, provider, now)
      ),
      sourceMode: "live",
      lifecycleStatus: "discovered",
      createdAt: now,
      updatedAt: now
    }))
  );
}

async function discoverWithFirecrawl(
  needProfileId: string,
  profile: MarketplaceNeedProfile,
  requiredCapabilities: string[],
  signal: AbortSignal
): Promise<SupplierLead[]> {
  const query = [
    ...requiredCapabilities,
    profile.location,
    "Australia industrial supplier integrator"
  ].join(" ");
  const response = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query, limit: 8 }),
    signal
  });
  if (!response.ok) {
    throw new Error(`Firecrawl returned HTTP ${response.status}`);
  }
  const results = extractFirecrawlResults(await response.json());
  const now = new Date().toISOString();

  return supplierLeadSchema.array().parse(
    results.slice(0, 8).map((result, index) => ({
      id: randomUUID(),
      needProfileId,
      companyName: result.title,
      website: result.url,
      location: "Australia - location requires review",
      serviceRegions: ["Australia - requires review"],
      capabilities: [
        result.description ||
          "Supplier capabilities require review against the selected pathway."
      ],
      matchScore: Math.max(55, 82 - index * 3),
      matchReasons: [
        result.description ||
          "The search result appeared for the selected-pathway discovery query; direct capability evidence requires review."
      ],
      risks: [
        "Search result requires identity, capability, location and contact verification before buyer-approved outreach."
      ],
      evidence: [
        {
          id: randomUUID(),
          title: result.title,
          url: result.url,
          sourceType: "other",
          provider: "firecrawl",
          evidenceNote:
            result.description ||
            "Firecrawl returned this page for the selected-pathway discovery query; the page type and supplier capabilities require review.",
          accessedAt: now
        }
      ],
      sourceMode: "live",
      lifecycleStatus: "discovered",
      createdAt: now,
      updatedAt: now
    }))
  );
}

async function requestOpenAiJson(input: {
  name: string;
  schema: Record<string, unknown>;
  system: string;
  user: string;
  signal?: AbortSignal;
}) {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      tools: [{ type: "web_search" }],
      input: [
        { role: "system", content: input.system },
        { role: "user", content: input.user }
      ],
      text: {
        format: {
          type: "json_schema",
          name: input.name,
          strict: true,
          schema: input.schema
        }
      }
    }),
    signal: input.signal ?? AbortSignal.timeout(30_000)
  });
  const responsePayload = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(
      `OpenAI returned HTTP ${response.status}: ${providerError(responsePayload)}`
    );
  }
  const outputText = extractOpenAiOutputText(responsePayload);
  if (!outputText) {
    throw new Error("OpenAI response did not contain structured output");
  }
  return JSON.parse(outputText) as unknown;
}

function normaliseCitation(
  citation: z.infer<typeof liveCitationSchema>,
  provider: "openai_web_search" | "perplexity" | "firecrawl",
  accessedAt: string
): ResearchCitation {
  return {
    id: randomUUID(),
    title: citation.title,
    url: citation.url,
    sourceType: citation.sourceType,
    provider,
    evidenceNote: citation.evidenceNote,
    accessedAt
  };
}

function shouldUseFixture() {
  return (
    env.VELTACT_RESEARCH_PROVIDER === "fixture" ||
    (env.VELTACT_RESEARCH_PROVIDER === "auto" && !env.OPENAI_API_KEY)
  );
}

function selectedDiscoveryProvider():
  | "openai"
  | "perplexity"
  | "fixture" {
  if (env.VELTACT_DISCOVERY_PROVIDER !== "auto") {
    return env.VELTACT_DISCOVERY_PROVIDER;
  }
  if (env.VELTACT_RESEARCH_PROVIDER === "fixture") {
    return "fixture";
  }
  if (env.OPENAI_API_KEY) return "openai";
  if (env.PERPLEXITY_API_KEY) return "perplexity";
  return "fixture";
}

function extractOpenAiOutputText(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text;
  if (!Array.isArray(record.output)) return undefined;
  for (const item of record.output) {
    if (typeof item !== "object" || item === null) continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (typeof part !== "object" || part === null) continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string") return text;
    }
  }
  return undefined;
}

function extractPerplexityOutputText(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const choices = (payload as Record<string, unknown>).choices;
  if (!Array.isArray(choices)) return undefined;
  for (const choice of choices) {
    if (typeof choice !== "object" || choice === null) continue;
    const message = (choice as Record<string, unknown>).message;
    if (typeof message !== "object" || message === null) continue;
    const content = (message as Record<string, unknown>).content;
    if (typeof content === "string") return content;
  }
  return undefined;
}

function extractFirecrawlResults(payload: unknown) {
  const resultSchema = z.object({
    title: z.string().trim().min(1),
    url: httpUrlSchema,
    description: z.string().trim().optional()
  });
  if (typeof payload !== "object" || payload === null) return [];
  const data = (payload as Record<string, unknown>).data;
  const values =
    Array.isArray(data)
      ? data
      : typeof data === "object" && data !== null
        ? (data as Record<string, unknown>).web
        : undefined;
  if (!Array.isArray(values)) return [];
  return values.flatMap((value) => {
    const parsed = resultSchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
}

function providerError(payload: unknown) {
  if (typeof payload !== "object" || payload === null) return "unknown error";
  const error = (payload as Record<string, unknown>).error;
  if (typeof error !== "object" || error === null) return "unknown error";
  const message = (error as Record<string, unknown>).message;
  return typeof message === "string" ? message : "unknown error";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown provider error";
}

const citationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "url", "sourceType", "evidenceNote"],
  properties: {
    title: { type: "string" },
    url: { type: "string" },
    sourceType: {
      type: "string",
      enum: [
        "manufacturer",
        "integrator",
        "standards",
        "industry_publication",
        "supplier_website",
        "directory",
        "other"
      ]
    },
    evidenceNote: { type: "string" }
  }
};

const researchJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["overview", "approaches", "missingInformation"],
  properties: {
    overview: { type: "string" },
    approaches: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "summary",
          "rationale",
          "localActions",
          "outsourceTriggers",
          "requiredCapabilities",
          "risks",
          "confidence",
          "citations"
        ],
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          rationale: { type: "string" },
          localActions: { type: "array", items: { type: "string" } },
          outsourceTriggers: {
            type: "array",
            minItems: 1,
            items: { type: "string" }
          },
          requiredCapabilities: {
            type: "array",
            minItems: 1,
            items: { type: "string" }
          },
          risks: { type: "array", items: { type: "string" } },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          citations: {
            type: "array",
            minItems: 1,
            items: citationJsonSchema
          }
        }
      }
    },
    missingInformation: { type: "array", items: { type: "string" } }
  }
};

const discoveryJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["suppliers"],
  properties: {
    suppliers: {
      type: "array",
      minItems: 3,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "companyName",
          "website",
          "logoUrl",
          "contactName",
          "contactEmail",
          "contactPhone",
          "location",
          "serviceRegions",
          "capabilities",
          "matchScore",
          "matchReasons",
          "risks",
          "citations"
        ],
        properties: {
          companyName: { type: "string" },
          website: { type: "string" },
          logoUrl: { type: ["string", "null"] },
          contactName: { type: ["string", "null"] },
          contactEmail: { type: ["string", "null"] },
          contactPhone: { type: ["string", "null"] },
          location: { type: "string" },
          serviceRegions: { type: "array", items: { type: "string" } },
          capabilities: {
            type: "array",
            minItems: 1,
            items: { type: "string" }
          },
          matchScore: { type: "number", minimum: 0, maximum: 100 },
          matchReasons: {
            type: "array",
            minItems: 1,
            items: { type: "string" }
          },
          risks: { type: "array", items: { type: "string" } },
          citations: {
            type: "array",
            minItems: 1,
            items: citationJsonSchema
          }
        }
      }
    }
  }
};
