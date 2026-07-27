import type { AiIntakeResult } from "@veltact/contracts";
import { aiIntakeResultSchema } from "@veltact/contracts";

export type AiIntakeEvidence = {
  kind: "written" | "pdf" | "photo";
  name: string;
  mimeType?: string;
  extractedText?: string;
  dataUrl?: string;
};

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
  const isUrgent =
    /\b(?:today|urgent|immediate|stopped|down|line stop|fault)\b/.test(
      normalised
    );
  const equipmentOrTechnology = detectEquipment(normalised);
  const requiredCapabilities = detectCapabilities(
    normalised,
    equipmentOrTechnology,
    isUrgent
  );
  const location = detectLocation(normalised);
  const urgency = detectUrgency(rawRequirement, isUrgent);
  const budgetRange = detectBudget(rawRequirement);
  const constraints = detectConstraints(normalised, isUrgent, input.evidence ?? []);

  return aiIntakeResultSchema.parse({
    rawRequirement,
    generatedProfile: {
      title: titleFromRequirement(
        rawRequirement,
        equipmentOrTechnology,
        isUrgent
      ),
      problemSummary: rawRequirement,
      category: categoryFromEquipment(equipmentOrTechnology),
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

function detectEquipment(normalised: string) {
  const equipment = new Set<string>();
  if (normalised.includes("abb")) equipment.add("ABB robotic arm");
  if (normalised.includes("robot")) equipment.add("Robotic cell");
  if (/palletis|palletiz|pallet(?:\s+|-)?load/.test(normalised)) {
    equipment.add("Palletising cell");
  }
  if (normalised.includes("vision")) equipment.add("Machine vision");
  if (normalised.includes("siemens")) equipment.add("Siemens PLC");
  if (normalised.includes("plc")) equipment.add("PLC");
  if (normalised.includes("conveyor")) equipment.add("Packaging conveyor");
  if (normalised.includes("packaging line")) equipment.add("Packaging line");
  if (normalised.includes("hmi")) equipment.add("HMI");
  if (normalised.includes("scada")) equipment.add("SCADA");
  return [...equipment];
}

function detectCapabilities(
  normalised: string,
  equipmentOrTechnology: string[],
  isUrgent: boolean
) {
  const capabilities = new Set<string>();
  if (normalised.includes("robot")) {
    capabilities.add(
      isUrgent ? "Robotic cell fault recovery" : "Robotic systems integration"
    );
  }
  if (normalised.includes("abb")) {
    capabilities.add(
      isUrgent ? "ABB robot diagnostics" : "ABB robot programming"
    );
  }
  if (/palletis|palletiz|pallet(?:\s+|-)?load/.test(normalised)) {
    capabilities.add(
      isUrgent ? "Palletising cell recovery" : "Palletising cell integration"
    );
  }
  if (normalised.includes("vision")) {
    capabilities.add("Machine vision integration");
  }
  if (normalised.includes("siemens")) {
    capabilities.add(
      isUrgent ? "Siemens PLC diagnostics" : "Siemens controls integration"
    );
  }
  if (normalised.includes("plc")) {
    capabilities.add(isUrgent ? "PLC fault finding" : "PLC integration");
  }
  if (normalised.includes("conveyor")) {
    capabilities.add(
      isUrgent ? "Conveyor fault recovery" : "Conveyor integration"
    );
  }
  if (
    normalised.includes("safety") ||
    /\bsafe\s*guard|\bsafeguard|\bguarding/.test(normalised)
  ) {
    capabilities.add(
      isUrgent ? "Safety circuit diagnostics" : "Machinery safety"
    );
  }
  if (/end[- ]of[- ]arm|tooling/.test(normalised)) {
    capabilities.add("End-of-arm tooling");
  }
  if (/operator training|\btraining\b/.test(normalised)) {
    capabilities.add("Operator training");
  }
  if (!isUrgent && /commission|integration|integrated/.test(normalised)) {
    capabilities.add("Site commissioning");
  }
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

function detectUrgency(rawRequirement: string, isUrgent: boolean) {
  if (isUrgent) return "Required today";
  const relative = rawRequirement.match(
    /\bwithin\s+(\d{1,3})\s+(business\s+)?(day|week)s?\b/i
  );
  if (!relative) return undefined;
  const count = Number(relative[1]);
  const unit = relative[3]?.toLowerCase() ?? "day";
  const business = relative[2] ? "business " : "";
  return `Within ${count} ${business}${unit}${count === 1 ? "" : "s"}`;
}

function detectBudget(rawRequirement: string) {
  const numberPattern = String.raw`\d{1,3}(?:,\d{3})+|\d{3,7}`;
  const range = rawRequirement.match(
    new RegExp(
      String.raw`(?:aud\s*|\$\s*)(${numberPattern})\s*(?:to|[-–])\s*(?:aud\s*|\$\s*)?(${numberPattern})`,
      "i"
    )
  );
  if (range) {
    return `AUD ${formatAmount(range[1])} to AUD ${formatAmount(range[2])}`;
  }
  const explicit = rawRequirement.match(
    new RegExp(
      String.raw`(?:aud\s*|\$\s*)(${numberPattern})|(${numberPattern})\s*aud\b`,
      "i"
    )
  );
  const contextual = rawRequirement.match(
    new RegExp(
      String.raw`\b(?:budget|callout tolerance)\D{0,16}(${numberPattern})`,
      "i"
    )
  );
  const amount = explicit?.[1] ?? explicit?.[2] ?? contextual?.[1];
  return amount ? `Up to AUD ${formatAmount(amount)}` : undefined;
}

function detectConstraints(normalised: string, isUrgent: boolean, evidence: AiIntakeEvidence[]) {
  const constraints = new Set<string>();
  if (normalised.includes("factory") || normalised.includes("line")) constraints.add("Production environment");
  if (normalised.includes("food") || normalised.includes("packaging")) constraints.add("Packaging/food manufacturing context");
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

function titleFromRequirement(
  rawRequirement: string,
  equipmentOrTechnology: string[],
  isUrgent: boolean
) {
  if (equipmentOrTechnology.some((item) => item.includes("ABB robotic arm"))) {
    return isUrgent
      ? "Urgent robotic palletiser recovery"
      : "Robotic palletiser integration for dispatch line";
  }
  if (
    !isUrgent &&
    equipmentOrTechnology.some((item) => item.includes("Palletising cell"))
  ) {
    return "Robotic palletising cell integration";
  }
  if (equipmentOrTechnology.some((item) => item.includes("Siemens PLC"))) {
    return isUrgent
      ? "Urgent Siemens PLC fault on packaging line"
      : "Siemens PLC integration for packaging line";
  }
  const firstSentence = rawRequirement.split(/[.!?]/)[0]?.trim();
  return firstSentence ? firstSentence.slice(0, 90) : "Industrial supplier requirement";
}

function categoryFromEquipment(equipmentOrTechnology: string[]) {
  if (
    equipmentOrTechnology.some((item) =>
      /robot|palletis|machine vision/i.test(item)
    )
  ) {
    return "Robotics integration";
  }
  return equipmentOrTechnology.some((item) =>
    /plc|scada|hmi|conveyor/i.test(item)
  )
    ? "Industrial automation"
    : "Industrial services";
}

function formatAmount(value: string) {
  return Number(value.replaceAll(",", "")).toLocaleString("en-AU");
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
