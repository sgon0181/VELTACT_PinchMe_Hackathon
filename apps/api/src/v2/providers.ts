import { randomUUID } from "node:crypto";
import {
  evidenceSourceTypeSchema,
  type MarketplaceNeedProfile,
  type ResearchCitation,
  solutionResearchResultSchema,
  supplierLeadSchema,
  type SolutionResearchResult,
  type SupplierLead
} from "@veltact/contracts";
import { z } from "zod";
import { env } from "../env.js";
import {
  createFixtureResearch,
  createFixtureSupplierLeads
} from "./fixtures.js";

const liveCitationSchema = z.object({
  title: z.string().trim().min(1),
  url: z.string().url(),
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
        website: z.string().url(),
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
    .max(10)
});

export type ProviderExecution<T> = {
  value: T;
  warning?: string;
};

export async function researchSolutions(
  needProfileId: string,
  profile: MarketplaceNeedProfile
): Promise<ProviderExecution<SolutionResearchResult>> {
  if (shouldUseFixture()) {
    return { value: createFixtureResearch(needProfileId, profile) };
  }

  try {
    return {
      value: await researchWithOpenAi(needProfileId, profile)
    };
  } catch (error) {
    if (env.VELTACT_RESEARCH_PROVIDER === "openai") {
      throw error;
    }
    return {
      value: createFixtureResearch(needProfileId, profile),
      warning: `Live research was unavailable; deterministic fixture evidence was used. ${errorMessage(error)}`
    };
  }
}

export async function discoverSuppliers(
  needProfileId: string,
  profile: MarketplaceNeedProfile,
  requiredCapabilities: string[]
): Promise<ProviderExecution<SupplierLead[]>> {
  if (shouldUseFixture()) {
    return { value: createFixtureSupplierLeads(needProfileId, profile) };
  }

  try {
    return {
      value: await discoverWithOpenAi(
        needProfileId,
        profile,
        requiredCapabilities
      )
    };
  } catch (error) {
    if (env.FIRECRAWL_API_KEY) {
      try {
        const firecrawlLeads = await discoverWithFirecrawl(
          needProfileId,
          profile,
          requiredCapabilities
        );
        if (firecrawlLeads.length > 0) {
          return {
            value: firecrawlLeads,
            warning:
              "OpenAI discovery was unavailable; Firecrawl search evidence was used. Contact details require buyer review."
          };
        }
      } catch {
        // The deterministic fallback below remains the reliable final provider.
      }
    }
    if (env.VELTACT_RESEARCH_PROVIDER === "openai") {
      throw error;
    }
    return {
      value: createFixtureSupplierLeads(needProfileId, profile),
      warning: `Live supplier discovery was unavailable; deterministic fixture candidates were used. ${errorMessage(error)}`
    };
  }
}

async function researchWithOpenAi(
  needProfileId: string,
  profile: MarketplaceNeedProfile
): Promise<SolutionResearchResult> {
  const payload = liveResearchPayloadSchema.parse(
    await requestOpenAiJson({
      name: "veltact_solution_research",
      schema: researchJsonSchema,
      system:
        "You are Veltact's industrial procurement research assistant. Research credible, high-level solution approaches for an Australian factory requirement. Do not diagnose a fault, give PLC code, suggest bypassing safeguards, or instruct the user to alter live machinery. Distinguish safe evidence gathering from work requiring authorised specialists. Cite every approach with public primary or authoritative sources and return only the requested JSON.",
      user: JSON.stringify(profile)
    })
  );
  const generatedAt = new Date().toISOString();
  const citationsByUrl = new Map<string, ResearchCitation>();
  const approaches = payload.approaches.map((approach) => {
    const citationIds = approach.citations.map((citation) => {
      const existing = citationsByUrl.get(citation.url);
      if (existing) return existing.id;
      const source = normaliseCitation(citation, "openai_web_search", generatedAt);
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
      "AI-assisted procurement analysis only. This is not a diagnosis or instruction to inspect, isolate, program or restart industrial equipment.",
    generatedAt
  });
}

async function discoverWithOpenAi(
  needProfileId: string,
  profile: MarketplaceNeedProfile,
  requiredCapabilities: string[]
): Promise<SupplierLead[]> {
  const payload = liveDiscoveryPayloadSchema.parse(
    await requestOpenAiJson({
      name: "veltact_supplier_discovery",
      schema: discoveryJsonSchema,
      system:
        "You are Veltact's Australian industrial supplier discovery assistant. Find up to 10 relevant real supplier businesses using public web evidence. Prefer official supplier websites. Do not infer certifications, availability, consent, or contact details. Omit contact fields unless explicitly published on a cited source. Return public discovery evidence only; the buyer will review every candidate before outreach. Return only the requested JSON.",
      user: JSON.stringify({ profile, requiredCapabilities })
    })
  );
  const now = new Date().toISOString();

  return payload.suppliers.map((supplier) =>
    supplierLeadSchema.parse({
      id: randomUUID(),
      needProfileId,
      companyName: supplier.companyName,
      website: supplier.website,
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
        "Public-web discovery is not verification, consent, or proof of current availability."
      ],
      evidence: supplier.citations.map((citation) =>
        normaliseCitation(citation, "openai_web_search", now)
      ),
      sourceMode: "live",
      lifecycleStatus: "discovered",
      createdAt: now,
      updatedAt: now
    })
  );
}

async function discoverWithFirecrawl(
  needProfileId: string,
  profile: MarketplaceNeedProfile,
  requiredCapabilities: string[]
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
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) {
    throw new Error(`Firecrawl returned HTTP ${response.status}`);
  }
  const payload = (await response.json()) as unknown;
  const results = extractFirecrawlResults(payload);
  const now = new Date().toISOString();

  return results.slice(0, 8).map((result, index) =>
    supplierLeadSchema.parse({
      id: randomUUID(),
      needProfileId,
      companyName: result.title,
      website: result.url,
      location: "Australia - location requires review",
      serviceRegions: ["Australia - requires review"],
      capabilities: requiredCapabilities,
      matchScore: Math.max(55, 82 - index * 3),
      matchReasons: [
        result.description || "Search result matched the requested capabilities."
      ],
      risks: [
        "Search result requires identity, capability, location and contact verification before outreach."
      ],
      evidence: [
        {
          id: randomUUID(),
          title: result.title,
          url: result.url,
          sourceType: "supplier_website",
          provider: "firecrawl",
          evidenceNote:
            result.description || "Firecrawl search result matched the discovery query.",
          accessedAt: now
        }
      ],
      sourceMode: "live",
      lifecycleStatus: "discovered",
      createdAt: now,
      updatedAt: now
    })
  );
}

async function requestOpenAiJson(input: {
  name: string;
  schema: Record<string, unknown>;
  system: string;
  user: string;
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
    signal: AbortSignal.timeout(30_000)
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
  provider: "openai_web_search" | "firecrawl",
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

function extractFirecrawlResults(payload: unknown) {
  const resultSchema = z.object({
    title: z.string().trim().min(1),
    url: z.string().url(),
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
    url: { type: "string", format: "uri" },
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
      minItems: 1,
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "companyName",
          "website",
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
          website: { type: "string", format: "uri" },
          contactName: { type: ["string", "null"] },
          contactEmail: { type: ["string", "null"], format: "email" },
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
