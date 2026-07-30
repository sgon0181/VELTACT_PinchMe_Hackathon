import type { StructureRequirementRequest } from "./localAiIntakeAdapter.js";

export type IntakePreflightResult =
  | { allowed: true; normalizedText: string }
  | { allowed: false; reason: string };

const industrialTerms = [
  "automation",
  "bearing",
  "breakdown",
  "callout",
  "compressor",
  "conveyor",
  "downtime",
  "electrical",
  "equipment",
  "factory",
  "fault",
  "gearbox",
  "heater band",
  "hmi",
  "hydraulic",
  "industrial",
  "injection molding",
  "injection moulding",
  "line",
  "machine",
  "maintenance",
  "manufacturing",
  "motor",
  "packaging",
  "panel",
  "plc",
  "pneumatic",
  "plastic processing",
  "polymer processing",
  "process heating",
  "pump",
  "robot",
  "scada",
  "sensor",
  "siemens",
  "site",
  "supplier",
  "technician",
  "temperature zone",
  "thermocouple",
  "torque alarm",
  "extruder",
  "extrusion"
];

export function preflightAiIntake(input: StructureRequirementRequest): IntakePreflightResult {
  const evidence = input.evidence ?? [];
  const evidenceHasFileContent = evidence.some((item) => Boolean(item.dataUrl));
  const normalizedText = [
    input.rawRequirement,
    ...evidence.map((item) => item.extractedText ?? ""),
    ...evidence.map((item) => item.name)
  ]
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalizedText) {
    return {
      allowed: false,
      reason: "Enter a short factory problem statement before using AI structuring."
    };
  }

  const lowerText = normalizedText.toLowerCase();
  const hasIndustrialSignal = industrialTerms.some((term) => lowerText.includes(term));

  if (evidenceHasFileContent && hasIndustrialSignal) {
    return {
      allowed: true,
      normalizedText
    };
  }

  if (normalizedText.length < 24 || normalizedText.split(/\s+/).length < 5) {
    return {
      allowed: false,
      reason: "Add a little more context, such as the equipment, fault, location, or timing."
    };
  }

  if (isLowSignalText(normalizedText)) {
    return {
      allowed: false,
      reason: "This does not look like a supplier requirement yet. Add the factory problem in plain language."
    };
  }

  if (!hasIndustrialSignal) {
    return {
      allowed: false,
      reason: "This does not look like an industrial supplier request. Add the machine, process, fault, or site context."
    };
  }

  return {
    allowed: true,
    normalizedText
  };
}

function isLowSignalText(text: string) {
  const alphanumeric = text.replace(/[^a-z0-9]/gi, "");
  if (alphanumeric.length < 18) return true;

  const uniqueCharacters = new Set(alphanumeric.toLowerCase()).size;
  if (uniqueCharacters < 6) return true;

  const repeatedCharacterRun = /(.)\1{8,}/.test(alphanumeric);
  if (repeatedCharacterRun) return true;

  const urlOnly = /^https?:\/\/\S+$/i.test(text);
  if (urlOnly) return true;

  return false;
}
