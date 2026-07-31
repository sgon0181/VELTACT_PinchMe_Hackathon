export function isIntakeUrgent(normalised) {
    return /\b(?:today|tonight|urgent|emergency|immediate|stopped|down|line stop|fault)\b/.test(normalised);
}
export function isIntakeRecoveryRequirement(normalised) {
    return (isIntakeUrgent(normalised) ||
        /\b(?:alarm|dead|failed|failure|not working|overheating|tripping|diagnose|repair)\b|(?:is not|isn't|isnt)\s+(?:heating|melting|working)/.test(normalised));
}
export function detectIntakeEquipment(normalised) {
    const equipment = new Set();
    if (isProcessHeatingRequirement(normalised)) {
        equipment.add("Plastics extrusion machine");
    }
    if (isProcessHeatingRequirement(normalised) &&
        /heater band|barrel|temperature zone|zone \d+/.test(normalised)) {
        equipment.add("Extruder barrel heating zone");
    }
    if (isProcessHeatingRequirement(normalised) &&
        /\bscrew\b|torque/.test(normalised)) {
        equipment.add("Extruder screw drive");
    }
    if (normalised.includes("gearbox"))
        equipment.add("Industrial gearbox");
    if (/\bmotor\b/.test(normalised))
        equipment.add("Industrial motor");
    if (normalised.includes("thermal protection")) {
        equipment.add("Motor thermal protection");
    }
    if (normalised.includes("abb"))
        equipment.add("ABB robotic arm");
    if (normalised.includes("robot"))
        equipment.add("Robotic cell");
    if (/palletis|palletiz|pallet(?:\s+|-)?load/.test(normalised)) {
        equipment.add("Palletising cell");
    }
    if (normalised.includes("vision"))
        equipment.add("Machine vision");
    if (normalised.includes("siemens"))
        equipment.add("Siemens PLC");
    if (normalised.includes("plc"))
        equipment.add("PLC");
    if (normalised.includes("conveyor"))
        equipment.add("Packaging conveyor");
    if (normalised.includes("packaging line"))
        equipment.add("Packaging line");
    if (normalised.includes("bottling line"))
        equipment.add("Bottling line");
    if (normalised.includes("hmi"))
        equipment.add("HMI");
    if (normalised.includes("scada"))
        equipment.add("SCADA");
    if (isIndustrialRefrigerationRequirement(normalised)) {
        equipment.add(normalised.includes("ammonia")
            ? "Ammonia refrigeration system"
            : "Industrial refrigeration system");
    }
    if (isIndustrialRefrigerationRequirement(normalised) &&
        /\bcompressor\b/.test(normalised)) {
        equipment.add("Industrial refrigeration compressor");
    }
    return [...equipment];
}
export function detectIntakeCapabilities(normalised, equipmentOrTechnology, requiresRecovery) {
    const capabilities = new Set();
    if (isProcessHeatingRequirement(normalised)) {
        capabilities.add(requiresRecovery
            ? "Plastics extrusion equipment diagnostics"
            : "Plastics extrusion process engineering");
    }
    if (/heater band|barrel|process heating|temperature zone/.test(normalised)) {
        capabilities.add("Industrial process heating diagnostics");
        capabilities.add("Temperature control and instrumentation");
    }
    if (isProcessHeatingRequirement(normalised) &&
        /\b(?:dead|failed|failure|alarm)\b|(?:is not|isn't|isnt)\s+(?:heating|melting|working)/.test(normalised)) {
        capabilities.add("Industrial electrical fault finding");
    }
    if (isProcessHeatingRequirement(normalised) &&
        /\bscrew\b|torque/.test(normalised)) {
        capabilities.add("Extruder screw-drive assessment");
    }
    if (normalised.includes("gearbox")) {
        capabilities.add("Industrial gearbox diagnostics");
    }
    if (/\bmotor\b/.test(normalised)) {
        capabilities.add("Industrial motor diagnostics");
    }
    if (/mechanical contractor|mechanical maintenance/.test(normalised)) {
        capabilities.add("Industrial mechanical maintenance");
    }
    if (/overheat|thermal protection|tripping/.test(normalised)) {
        capabilities.add("Mechanical condition assessment");
    }
    if (normalised.includes("robot")) {
        capabilities.add(requiresRecovery
            ? "Robotic cell fault recovery"
            : "Robotic systems integration");
    }
    if (normalised.includes("abb")) {
        capabilities.add(requiresRecovery ? "ABB robot diagnostics" : "ABB robot programming");
    }
    if (/palletis|palletiz|pallet(?:\s+|-)?load/.test(normalised)) {
        capabilities.add(requiresRecovery
            ? "Palletising cell recovery"
            : "Palletising cell integration");
    }
    if (normalised.includes("vision")) {
        capabilities.add("Machine vision integration");
    }
    if (normalised.includes("siemens")) {
        capabilities.add(requiresRecovery
            ? "Siemens PLC diagnostics"
            : "Siemens controls integration");
    }
    if (normalised.includes("plc")) {
        capabilities.add(requiresRecovery ? "PLC fault finding" : "PLC integration");
    }
    if (normalised.includes("conveyor")) {
        capabilities.add(requiresRecovery ? "Conveyor fault recovery" : "Conveyor integration");
    }
    if (normalised.includes("safety") ||
        /\bsafe\s*guard|\bsafeguard|\bguarding/.test(normalised)) {
        capabilities.add(requiresRecovery ? "Safety circuit diagnostics" : "Machinery safety");
    }
    if (/end[- ]of[- ]arm|tooling/.test(normalised)) {
        capabilities.add("End-of-arm tooling");
    }
    if (/operator training|\btraining\b/.test(normalised)) {
        capabilities.add("Operator training");
    }
    if (!requiresRecovery && /commission|integration|integrated/.test(normalised)) {
        capabilities.add("Site commissioning");
    }
    if (isIndustrialRefrigerationRequirement(normalised)) {
        capabilities.add(requiresRecovery
            ? "Industrial refrigeration diagnostics"
            : "Industrial refrigeration maintenance");
        if (normalised.includes("ammonia")) {
            capabilities.add("Ammonia refrigeration service");
        }
        if (/\bcompressor\b/.test(normalised)) {
            capabilities.add("Refrigeration compressor maintenance");
        }
        if (/\blicen[cs]ed\b/.test(normalised)) {
            capabilities.add("Licensed refrigeration contractor");
        }
    }
    if (normalised.includes("today") ||
        normalised.includes("tonight") ||
        normalised.includes("urgent") ||
        normalised.includes("emergency") ||
        normalised.includes("stopped") ||
        /\bwithin\s+(?:[1-9]|1\d|2[0-4])\s*hours?\b/.test(normalised)) {
        capabilities.add("Same-day onsite support");
    }
    if (equipmentOrTechnology.length && !capabilities.size) {
        capabilities.add("Industrial equipment diagnostics");
    }
    return [...capabilities];
}
export function detectIntakeLocation(rawRequirement) {
    const statePattern = "(?:[Nn][Ss][Ww]|[Vv][Ii][Cc]|[Qq][Ll][Dd]|[Ss][Aa]|[Ww][Aa]|[Tt][Aa][Ss]|[Nn][Tt]|[Aa][Cc][Tt])";
    const locationWithState = rawRequirement.match(new RegExp(String.raw `(?:^|[^A-Za-z])((?:[A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*){0,2})),?\s+(${statePattern})\b`));
    if (locationWithState) {
        return `${locationWithState[1].trim()}, ${locationWithState[2].toUpperCase()}`;
    }
    const normalised = rawRequirement.toLowerCase();
    if (normalised.includes("western sydney"))
        return "Western Sydney, NSW";
    if (normalised.includes("sydney"))
        return "Sydney, NSW";
    if (normalised.includes("melbourne"))
        return "Melbourne, VIC";
    if (normalised.includes("brisbane"))
        return "Brisbane, QLD";
    return undefined;
}
export function detectIntakeUrgency(rawRequirement, isUrgent) {
    const hours = rawRequirement.match(/\bwithin\s+(\d{1,3})\s*hours?\b/i);
    if (hours) {
        const count = Number(hours[1]);
        if (count <= 24)
            return "Required today";
        return `Within ${Math.ceil(count / 24)} days`;
    }
    const relative = rawRequirement.match(/\bwithin\s+(\d{1,3})\s+(business\s+)?(day|week)s?\b/i);
    if (relative) {
        const count = Number(relative[1]);
        const unit = relative[3]?.toLowerCase() ?? "day";
        const business = relative[2] ? "business " : "";
        return `Within ${count} ${business}${unit}${count === 1 ? "" : "s"}`;
    }
    return isUrgent ? "Required today" : undefined;
}
export function detectIntakeBudget(rawRequirement) {
    const numberPattern = String.raw `\d+(?:,\d{3})*(?:\.\d+)?\s*[kK]?`;
    const range = rawRequirement.match(new RegExp(String.raw `(?:aud\s*|\$\s*)(${numberPattern})\s*(?:to|[-–])\s*(?:aud\s*|\$\s*)?(${numberPattern})`, "i"));
    if (range) {
        return `AUD ${formatIntakeAmount(range[1])} to AUD ${formatIntakeAmount(range[2])}`;
    }
    const explicit = rawRequirement.match(new RegExp(String.raw `(?:aud\s*|\$\s*)(${numberPattern})|(${numberPattern})\s*aud\b`, "i"));
    const contextual = rawRequirement.match(new RegExp(String.raw `\b(?:budget|callout tolerance)\D{0,20}(${numberPattern})`, "i"));
    const amount = explicit?.[1] ?? explicit?.[2] ?? contextual?.[1];
    return amount ? `Up to AUD ${formatIntakeAmount(amount)}` : undefined;
}
export function parseIntakeBudgetAmount(value) {
    const matches = [
        ...value.matchAll(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*([kK])?/g)
    ];
    const match = matches.at(-1);
    if (!match)
        return undefined;
    const numeric = Number(match[1].replaceAll(",", ""));
    if (!Number.isFinite(numeric))
        return undefined;
    return Math.round(match[2] ? numeric * 1_000 : numeric);
}
export function intakeTitleFromRequirement(rawRequirement, equipmentOrTechnology, requiresRecovery) {
    if (equipmentOrTechnology.some((item) => item.includes("Plastics extrusion machine"))) {
        return requiresRecovery
            ? "Extruder barrel heating fault with high-torque alarm"
            : "Plastics extrusion process-heating support";
    }
    if (equipmentOrTechnology.some((item) => item.includes("ABB robotic arm"))) {
        return requiresRecovery
            ? "Urgent robotic palletiser recovery"
            : "Robotic palletiser integration for dispatch line";
    }
    if (!requiresRecovery &&
        equipmentOrTechnology.some((item) => item.includes("Palletising cell"))) {
        return "Robotic palletising cell integration";
    }
    if (equipmentOrTechnology.some((item) => item.includes("Siemens PLC"))) {
        return requiresRecovery
            ? "Urgent Siemens PLC fault on packaging line"
            : "Siemens PLC integration for packaging line";
    }
    if (equipmentOrTechnology.some((item) => /refrigeration|compressor/i.test(item))) {
        return requiresRecovery
            ? rawRequirement.toLowerCase().includes("ammonia")
                ? "Urgent ammonia refrigeration compressor repair"
                : "Urgent industrial refrigeration repair"
            : "Industrial refrigeration maintenance";
    }
    const firstSentence = rawRequirement.split(/[.!?]/)[0]?.trim();
    return firstSentence
        ? truncateIntakeTitle(firstSentence)
        : "Industrial supplier requirement";
}
export function intakeCategoryFromEquipment(equipmentOrTechnology) {
    if (equipmentOrTechnology.some((item) => /extrusion|barrel heating|screw drive/i.test(item))) {
        return "Plastics processing maintenance";
    }
    if (equipmentOrTechnology.some((item) => /robot|palletis|machine vision/i.test(item))) {
        return "Robotics integration";
    }
    if (equipmentOrTechnology.some((item) => /gearbox|motor|thermal protection/i.test(item))) {
        return "Industrial mechanical maintenance";
    }
    if (equipmentOrTechnology.some((item) => /refrigeration|compressor/i.test(item))) {
        return "Industrial refrigeration maintenance";
    }
    return equipmentOrTechnology.some((item) => /plc|scada|hmi|conveyor/i.test(item))
        ? "Industrial automation"
        : "Industrial services";
}
export function truncateIntakeTitle(value) {
    const trimmed = value.trim();
    if (trimmed.length <= 90)
        return trimmed;
    const candidate = trimmed.slice(0, 87).trimEnd();
    const lastBoundary = candidate.lastIndexOf(" ");
    const truncated = lastBoundary > 0 ? candidate.slice(0, lastBoundary).trimEnd() : candidate;
    return `${truncated}…`;
}
function formatIntakeAmount(value) {
    const compact = value.replaceAll(",", "").replace(/\s+/g, "");
    const usesThousands = /k$/i.test(compact);
    const numeric = Number(compact.replace(/k$/i, ""));
    const amount = usesThousands ? numeric * 1_000 : numeric;
    return Math.round(amount).toLocaleString("en-AU");
}
function isProcessHeatingRequirement(normalised) {
    return /extrud|heater band|barrel heating|plastic processing|polymer processing|(?:plastic|polymer).{0,40}(?:melt|barrel|screw)|(?:screw|barrel).{0,40}(?:torque|heater|plastic|polymer)/.test(normalised);
}
function isIndustrialRefrigerationRequirement(normalised) {
    return /\bammonia\b|\brefrigerat(?:ion|ed|or)\b|\bcold store\b|\bcold-storage\b|\bfreezer\b|\bindustrial chiller\b/.test(normalised);
}
//# sourceMappingURL=intakeExtraction.js.map