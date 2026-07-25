import type { AiIntakeResult } from "@veltact/contracts";

export type StructureRequirementInput = {
  rawRequirement: string;
  evidence?: IntakeEvidence[];
};

export type IntakeEvidence = {
  kind: "written" | "pdf" | "photo";
  name: string;
  extractedText?: string;
};

export interface AiIntakeAdapter {
  structureRequirement(input: StructureRequirementInput): Promise<AiIntakeResult>;
}

export class DemoAiIntakeService implements AiIntakeAdapter {
  async structureRequirement(input: StructureRequirementInput): Promise<AiIntakeResult> {
    // Replace this deterministic adapter with a POST to the future AI intake endpoint.
    await delay(320);
    const evidenceText = (input.evidence ?? [])
      .map((item) => item.extractedText)
      .filter((item): item is string => Boolean(item?.trim()))
      .join("\n");
    const rawRequirement = [input.rawRequirement.trim(), evidenceText].filter(Boolean).join("\n\n");
    if (!rawRequirement) {
      throw new Error("Enter the factory problem or attach intake evidence before structuring the requirement.");
    }

    const normalised = rawRequirement.toLowerCase();
    const isUrgent = /today|urgent|immediate|stopped|down|line stop|fault/.test(normalised);
    const equipmentOrTechnology = detectEquipment(normalised);
    const requiredCapabilities = detectCapabilities(normalised, equipmentOrTechnology);
    const location = detectLocation(normalised);
    const budgetRange = detectBudget(rawRequirement);
    const constraints = detectConstraints(normalised, isUrgent, input.evidence ?? []);

    return {
      rawRequirement,
      generatedProfile: {
        title: titleFromRequirement(rawRequirement, equipmentOrTechnology),
        problemSummary: rawRequirement,
        category: equipmentOrTechnology.some((item) => /plc|scada|hmi|conveyor/i.test(item))
          ? "Industrial automation"
          : "Industrial services",
        equipmentOrTechnology,
        requiredCapabilities,
        location,
        urgency: isUrgent ? "Required today" : undefined,
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
        isUrgent,
        evidence: input.evidence ?? []
      })
    };
  }
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function detectEquipment(normalised: string) {
  const equipment = new Set<string>();
  if (normalised.includes("siemens")) equipment.add("Siemens PLC");
  if (normalised.includes("plc")) equipment.add("PLC");
  if (normalised.includes("conveyor")) equipment.add("Packaging conveyor");
  if (normalised.includes("packaging line")) equipment.add("Packaging line");
  if (normalised.includes("hmi")) equipment.add("HMI");
  if (normalised.includes("scada")) equipment.add("SCADA");
  return [...equipment];
}

function detectCapabilities(normalised: string, equipmentOrTechnology: string[]) {
  const capabilities = new Set<string>();
  if (normalised.includes("siemens")) capabilities.add("Siemens PLC diagnostics");
  if (normalised.includes("plc")) capabilities.add("PLC fault finding");
  if (normalised.includes("conveyor")) capabilities.add("Conveyor fault recovery");
  if (normalised.includes("safety")) capabilities.add("Safety circuit diagnostics");
  if (normalised.includes("today") || normalised.includes("urgent") || normalised.includes("stopped")) {
    capabilities.add("Same-day onsite support");
  }
  if (equipmentOrTechnology.length && !capabilities.size) {
    capabilities.add("Industrial equipment diagnostics");
  }
  return [...capabilities];
}

function detectLocation(normalised: string) {
  if (normalised.includes("western sydney")) return "Western Sydney, NSW";
  if (normalised.includes("sydney")) return "Sydney, NSW";
  if (normalised.includes("melbourne")) return "Melbourne, VIC";
  if (normalised.includes("brisbane")) return "Brisbane, QLD";
  return undefined;
}

function detectBudget(rawRequirement: string) {
  const match = rawRequirement.match(/\$?\s?(\d{3,5})(?:\s?aud)?/i);
  return match ? `Up to AUD ${Number(match[1]).toLocaleString("en-AU")}` : undefined;
}

function detectConstraints(normalised: string, isUrgent: boolean, evidence: IntakeEvidence[]) {
  const constraints = new Set<string>();
  if (normalised.includes("factory") || normalised.includes("line")) constraints.add("Production environment");
  if (normalised.includes("food") || normalised.includes("packaging")) constraints.add("Packaging/food manufacturing context");
  if (isUrgent) constraints.add("Minimal downtime");
  if (evidence.some((item) => item.kind === "pdf")) constraints.add("PDF evidence attached for supplier review");
  if (evidence.some((item) => item.kind === "photo")) constraints.add("Photo evidence attached; visual details require OCR/vision service confirmation");
  return [...constraints];
}

function titleFromRequirement(rawRequirement: string, equipmentOrTechnology: string[]) {
  if (equipmentOrTechnology.some((item) => item.includes("Siemens PLC"))) {
    return "Urgent Siemens PLC fault on packaging line";
  }
  const firstSentence = rawRequirement.split(/[.!?]/)[0]?.trim();
  return firstSentence ? firstSentence.slice(0, 90) : "Industrial supplier requirement";
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
  isUrgent: boolean;
  evidence: IntakeEvidence[];
}) {
  const missing: string[] = [];
  if (!input.location) missing.push("site location");
  if (!input.isUrgent) missing.push("required response timing");
  if (!input.budgetRange) missing.push("budget or callout tolerance");
  if (!input.equipmentOrTechnology.length) missing.push("equipment or technology");
  if (!input.requiredCapabilities.length) missing.push("required supplier capability");
  if (input.evidence.some((item) => item.kind === "photo" && !item.extractedText)) {
    missing.push("photo OCR or visual interpretation");
  }
  if (input.evidence.some((item) => item.kind === "pdf" && !item.extractedText)) {
    missing.push("PDF text extraction");
  }
  return missing;
}
