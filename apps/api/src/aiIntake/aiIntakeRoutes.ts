import { Router } from "express";
import { z } from "zod";
import { env } from "../env.js";
import { preflightAiIntake } from "./intakePreflight.js";
import { structureRequirementLocally } from "./localAiIntakeAdapter.js";
import { structureRequirementWithOpenAi } from "./openAiIntakeClient.js";

const evidenceSchema = z.object({
  kind: z.enum(["written", "pdf", "photo"]),
  name: z.string().trim().min(1),
  mimeType: z.string().trim().min(1).optional(),
  extractedText: z.string().trim().optional(),
  dataUrl: z.string().trim().startsWith("data:").max(5_600_000).optional()
});

const structureRequirementSchema = z.object({
  rawRequirement: z.string().trim().default(""),
  evidence: z.array(evidenceSchema).max(6).default([])
});

export const aiIntakeRouter = Router();

aiIntakeRouter.post("/structure", async (request, response) => {
  const parsed = structureRequirementSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: "invalid_ai_intake_request",
      message: parsed.error.issues.map((issue) => issue.message).join(", ")
    });
    return;
  }

  const hasContent =
    parsed.data.rawRequirement.length > 0 ||
    parsed.data.evidence.some((item) => Boolean(item.extractedText?.trim() || item.dataUrl));

  if (!hasContent) {
    response.status(400).json({
      error: "empty_ai_intake_request",
      message: "Enter the factory problem or attach PDF/photo/written evidence before structuring the requirement."
    });
    return;
  }

  const preflight = preflightAiIntake(parsed.data);
  if (!preflight.allowed) {
    response.status(400).json({
      error: "low_signal_ai_intake_request",
      message: preflight.reason
    });
    return;
  }

  try {
    const forceLocalDemo = request.headers["x-veltact-ai-intake-source"] === "local_demo";
    const source = env.OPENAI_API_KEY && env.NODE_ENV !== "test" && !forceLocalDemo ? "openai" : "local_demo";
    const hasLocallyReadableText =
      parsed.data.rawRequirement.length > 0 ||
      parsed.data.evidence.some((item) => Boolean(item.extractedText?.trim()));
    if (source === "local_demo" && !hasLocallyReadableText) {
      response.status(422).json({
        error: "binary_evidence_requires_live_ai",
        message:
          "Local intake cannot read binary-only PDF or photo evidence. Add a written factory description or extracted text."
      });
      return;
    }
    const aiIntakeResult =
      source === "openai"
        ? await structureRequirementWithOpenAi(parsed.data)
        : structureRequirementLocally(parsed.data);

    response.json({
      source,
      aiIntakeResult
    });
  } catch (error) {
    response.status(502).json({
      error: "ai_intake_failed",
      message: error instanceof Error ? error.message : "Unable to structure the requirement."
    });
  }
});
