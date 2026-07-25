import { aiIntakeResultSchema, type AiIntakeResult } from "@veltact/contracts";
import { env } from "../env.js";
import type { StructureRequirementRequest } from "./localAiIntakeAdapter.js";

type OpenAiStructuredPayload = {
  rawRequirement: string;
  generatedProfile: {
    title: string;
    problemSummary: string;
    category: string;
    equipmentOrTechnology: string[];
    requiredCapabilities: string[];
    location: string | null;
    urgency: string | null;
    budgetRange: string | null;
    certificationsOrConstraints: string[];
    buyerPriority: "speed" | "technical_fit" | "quality" | "trust" | "price" | null;
  };
  confidence: number | null;
  missingFields: string[];
};

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["rawRequirement", "generatedProfile", "confidence", "missingFields"],
  properties: {
    rawRequirement: { type: "string" },
    generatedProfile: {
      type: "object",
      additionalProperties: false,
      required: [
        "title",
        "problemSummary",
        "category",
        "equipmentOrTechnology",
        "requiredCapabilities",
        "location",
        "urgency",
        "budgetRange",
        "certificationsOrConstraints",
        "buyerPriority"
      ],
      properties: {
        title: { type: "string" },
        problemSummary: { type: "string" },
        category: { type: "string" },
        equipmentOrTechnology: { type: "array", items: { type: "string" } },
        requiredCapabilities: { type: "array", items: { type: "string" } },
        location: { type: ["string", "null"] },
        urgency: { type: ["string", "null"] },
        budgetRange: { type: ["string", "null"] },
        certificationsOrConstraints: { type: "array", items: { type: "string" } },
        buyerPriority: {
          type: ["string", "null"],
          enum: ["speed", "technical_fit", "quality", "trust", "price", null]
        }
      }
    },
    confidence: { type: ["number", "null"], minimum: 0, maximum: 1 },
    missingFields: { type: "array", items: { type: "string" } }
  }
} as const;

export async function structureRequirementWithOpenAi(input: StructureRequirementRequest): Promise<AiIntakeResult> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You structure messy industrial buyer intake into a supplier-ready RFQ need profile. Do not diagnose the machine. Do not invent unknown facts. Mark missing commercial, timing, location, equipment, and capability fields explicitly."
            }
          ]
        },
        {
          role: "user",
          content: buildOpenAiContent(input)
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "veltact_ai_intake_result",
          strict: true,
          schema: responseSchema
        }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI intake request failed (${response.status}): ${errorText.slice(0, 600)}`);
  }

  const payload = (await response.json()) as { output_text?: string; output?: unknown[] };
  const outputText = payload.output_text ?? extractOutputText(payload.output);
  if (!outputText) {
    throw new Error("OpenAI intake response did not include structured output text.");
  }

  const parsed = JSON.parse(outputText) as OpenAiStructuredPayload;
  return aiIntakeResultSchema.parse(normalizeStructuredPayload(parsed));
}

function buildOpenAiContent(input: StructureRequirementRequest) {
  const content: Array<Record<string, unknown>> = [
    {
      type: "input_text",
      text: JSON.stringify(
        {
          rawRequirement: input.rawRequirement,
          evidence: (input.evidence ?? []).map((item) => ({
            kind: item.kind,
            name: item.name,
            mimeType: item.mimeType,
            extractedText: item.extractedText
          }))
        },
        null,
        2
      )
    }
  ];

  for (const item of input.evidence ?? []) {
    if (!item.dataUrl) continue;
    if (item.kind === "photo") {
      content.push({ type: "input_image", image_url: item.dataUrl });
    }
    if (item.kind === "pdf") {
      content.push({ type: "input_file", filename: item.name, file_data: item.dataUrl, detail: "auto" });
    }
  }

  return content;
}

function normalizeStructuredPayload(payload: OpenAiStructuredPayload): AiIntakeResult {
  const generatedProfile = {
    ...payload.generatedProfile,
    location: payload.generatedProfile.location ?? undefined,
    urgency: payload.generatedProfile.urgency ?? undefined,
    budgetRange: payload.generatedProfile.budgetRange ?? undefined,
    buyerPriority: payload.generatedProfile.buyerPriority ?? undefined
  };

  return {
    rawRequirement: payload.rawRequirement,
    generatedProfile,
    confidence: payload.confidence ?? undefined,
    missingFields: payload.missingFields
  };
}

function extractOutputText(output: unknown) {
  if (!Array.isArray(output)) return undefined;
  for (const item of output) {
    if (!item || typeof item !== "object" || !("content" in item) || !Array.isArray(item.content)) continue;
    for (const contentItem of item.content) {
      if (
        contentItem &&
        typeof contentItem === "object" &&
        "type" in contentItem &&
        contentItem.type === "output_text" &&
        "text" in contentItem &&
        typeof contentItem.text === "string"
      ) {
        return contentItem.text;
      }
    }
  }
  return undefined;
}
