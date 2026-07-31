import {
  aiIntakeResultSchema,
  detectIntakeBudget,
  detectIntakeCapabilities,
  detectIntakeEquipment,
  detectIntakeLocation,
  detectIntakeUrgency,
  intakeCategoryFromEquipment,
  intakeTitleFromRequirement,
  isIntakeRecoveryRequirement,
  isIntakeUrgent,
  type AiIntakeEvidence,
  type AiIntakeResult
} from "@veltact/contracts";

export type StructureRequirementRequest = {
  rawRequirement: string;
  evidence?: AiIntakeEvidence[];
};

export function structureRequirementLocally(input: StructureRequirementRequest): AiIntakeResult {
  const evidenceText = (input.evidence ?? [])
    .map((item) => item.extractedText)
    .filter((item): item is string => Boolean(item?.trim()))
    .join("\n");
  const suppliedRequirement = input.rawRequirement.trim();
  const rawRequirement = [suppliedRequirement, evidenceText]
    .filter(Boolean)
    .join("\n\n");

  if (!rawRequirement) {
    throw new Error(
      "Local intake cannot read binary-only PDF or photo evidence. Add a written factory description or extracted text."
    );
  }

  const normalised = rawRequirement.toLowerCase();
  const isUrgent = isIntakeUrgent(normalised);
  const requiresRecovery = isIntakeRecoveryRequirement(normalised);
  const equipmentOrTechnology = detectIntakeEquipment(normalised);
  const requiredCapabilities = detectIntakeCapabilities(
    normalised,
    equipmentOrTechnology,
    requiresRecovery
  );
  const location = detectIntakeLocation(rawRequirement);
  const urgency = detectIntakeUrgency(rawRequirement, isUrgent);
  const budgetRange = detectIntakeBudget(rawRequirement);
  const constraints = detectConstraints(normalised, isUrgent, input.evidence ?? []);

  return aiIntakeResultSchema.parse({
    rawRequirement,
    generatedProfile: {
      title: intakeTitleFromRequirement(
        rawRequirement,
        equipmentOrTechnology,
        requiresRecovery
      ),
      problemSummary: rawRequirement,
      category: intakeCategoryFromEquipment(equipmentOrTechnology),
      equipmentOrTechnology,
      requiredCapabilities,
      location,
      urgency,
      budgetRange,
      certificationsOrConstraints: constraints,
      buyerPriority: isUrgent ? "speed" : undefined
    },
    confidence: confidenceScore({ location, budgetRange, requiredCapabilities, equipmentOrTechnology }),
    missingFields: missingFields({
      location,
      budgetRange,
      requiredCapabilities,
      equipmentOrTechnology,
      urgency,
      evidence: input.evidence ?? []
    })
  });
}

function detectConstraints(normalised: string, isUrgent: boolean, evidence: AiIntakeEvidence[]) {
  const constraints = new Set<string>();
  if (normalised.includes("factory") || normalised.includes("line")) constraints.add("Production environment");
  if (normalised.includes("packaging")) {
    constraints.add("Packaging manufacturing context");
  } else if (/\bfood\b|\bseafood\b|\bdairy\b/.test(normalised)) {
    constraints.add("Food handling environment");
  }
  if (
    /\bgrain\b/.test(normalised) &&
    /\bcontaminat(?:e|ed|es|ing|ion)\b/.test(normalised)
  ) {
    constraints.add("Grain handling contamination controls");
  }
  if (/\bcold store\b|\bcold-storage\b|\bfreezer\b|-\d+\s*°?c\b/.test(normalised)) {
    constraints.add("Temperature-critical cold storage");
  }
  if (isUrgent) constraints.add("Minimal downtime");
  if (
    /adjacent production|avoid(?:s|ing)? disrupting|maintain(?:ing)? production|staged installation/.test(
      normalised
    )
  ) {
    constraints.add("Maintain adjacent production access");
  }
  if (/operator training|\btraining\b/.test(normalised)) {
    constraints.add("Operator training required");
  }
  if (evidence.some((item) => item.kind === "pdf")) constraints.add("PDF evidence attached for RFQ structuring");
  if (evidence.some((item) => item.kind === "photo")) constraints.add("Photo evidence attached for RFQ structuring");
  return [...constraints];
}

function confidenceScore(input: {
  location?: string;
  budgetRange?: string;
  requiredCapabilities: string[];
  equipmentOrTechnology: string[];
}) {
  let score = 0.42;
  if (input.location) score += 0.16;
  if (input.budgetRange) score += 0.1;
  if (input.requiredCapabilities.length) score += 0.16;
  if (input.equipmentOrTechnology.length) score += 0.16;
  return Math.min(0.92, Number(score.toFixed(2)));
}

function missingFields(input: {
  location?: string;
  budgetRange?: string;
  requiredCapabilities: string[];
  equipmentOrTechnology: string[];
  urgency?: string;
  evidence: AiIntakeEvidence[];
}) {
  const missing: string[] = [];
  if (!input.location) missing.push("site location");
  if (!input.urgency) missing.push("required response timing");
  if (!input.budgetRange) missing.push("budget or callout tolerance");
  if (!input.equipmentOrTechnology.length) missing.push("equipment or technology");
  if (!input.requiredCapabilities.length) missing.push("required supplier capability");
  if (input.evidence.some((item) => item.kind === "photo" && !item.dataUrl && !item.extractedText)) {
    missing.push("photo evidence content");
  }
  if (input.evidence.some((item) => item.kind === "pdf" && !item.dataUrl && !item.extractedText)) {
    missing.push("PDF evidence content");
  }
  return missing;
}
