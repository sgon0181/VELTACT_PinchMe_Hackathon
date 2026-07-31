import { AI_INTAKE_RAW_REQUIREMENT_MAX_LENGTH, AI_INTAKE_RAW_REQUIREMENT_MAX_MESSAGE, AI_INTAKE_RAW_REQUIREMENT_MIN_LENGTH, aiIntakeEvidenceSchema, aiIntakeResultSchema, buyerPrioritySchema } from "@veltact/contracts";
export const PRE_NEED_INTAKE_DRAFT_KEY = "veltact:rapidmatch:pre-need-intake-draft";
export function validateIntakeRawRequirement(value) {
    const length = value.trim().length;
    if (length < AI_INTAKE_RAW_REQUIREMENT_MIN_LENGTH) {
        return `Add at least ${AI_INTAKE_RAW_REQUIREMENT_MIN_LENGTH} characters of factory context before analysis.`;
    }
    if (length > AI_INTAKE_RAW_REQUIREMENT_MAX_LENGTH) {
        return AI_INTAKE_RAW_REQUIREMENT_MAX_MESSAGE;
    }
    return "";
}
export function intakeRawRequirementGuidance(value) {
    const length = value.trim().length;
    if (length === 0) {
        return `Add at least ${AI_INTAKE_RAW_REQUIREMENT_MIN_LENGTH} characters describing the equipment, problem, site or timing.`;
    }
    if (length < AI_INTAKE_RAW_REQUIREMENT_MIN_LENGTH) {
        const remaining = AI_INTAKE_RAW_REQUIREMENT_MIN_LENGTH - length;
        return `Add ${remaining} more character${remaining === 1 ? "" : "s"} so Veltact has enough factory context.`;
    }
    if (length > AI_INTAKE_RAW_REQUIREMENT_MAX_LENGTH) {
        const excess = length - AI_INTAKE_RAW_REQUIREMENT_MAX_LENGTH;
        return `${AI_INTAKE_RAW_REQUIREMENT_MAX_MESSAGE} Remove ${excess.toLocaleString("en-AU")} character${excess === 1 ? "" : "s"}.`;
    }
    return `${length.toLocaleString("en-AU")} of ${AI_INTAKE_RAW_REQUIREMENT_MAX_LENGTH.toLocaleString("en-AU")} characters used.`;
}
export function serializePreNeedIntakeDraft(draft) {
    const value = {
        version: 1,
        requirementInput: cloneRequirementInput(draft.requirementInput),
        priority: draft.priority,
        intakeSourceMode: draft.intakeSourceMode,
        intakeResult: draft.intakeResult,
        evidence: draft.evidence.slice(0, 6).map(stripBinaryEvidence)
    };
    return JSON.stringify(value);
}
export function parsePreNeedIntakeDraft(raw) {
    if (!raw)
        return undefined;
    try {
        const value = JSON.parse(raw);
        if (value.version !== 1)
            return undefined;
        const requirementInput = parseBuyerRequirementInput(value.requirementInput);
        const priority = buyerPrioritySchema.safeParse(value.priority);
        const intakeResult = aiIntakeResultSchema.safeParse(value.intakeResult);
        const intakeSourceMode = value.intakeSourceMode === "live" ||
            value.intakeSourceMode === "fixture"
            ? value.intakeSourceMode
            : undefined;
        if (!requirementInput || !priority.success || !intakeSourceMode) {
            return undefined;
        }
        const evidence = Array.isArray(value.evidence)
            ? value.evidence
                .slice(0, 6)
                .flatMap((item) => {
                const parsed = aiIntakeEvidenceSchema.safeParse(item);
                return parsed.success
                    ? [stripBinaryEvidence(parsed.data)]
                    : [];
            })
            : [];
        return {
            requirementInput,
            priority: priority.data,
            intakeSourceMode,
            intakeResult: intakeResult.success
                ? intakeResult.data
                : undefined,
            evidence
        };
    }
    catch {
        return undefined;
    }
}
export function parseBuyerRequirementInput(value) {
    if (!value || typeof value !== "object")
        return undefined;
    const input = value;
    if (typeof input.description !== "string" ||
        input.description.trim().length > AI_INTAKE_RAW_REQUIREMENT_MAX_LENGTH ||
        typeof input.title !== "string") {
        return undefined;
    }
    return {
        companyName: stringValue(input.companyName),
        contactName: stringValue(input.contactName),
        contactEmail: stringValue(input.contactEmail),
        title: input.title,
        description: input.description,
        category: stringValue(input.category),
        equipmentOrTechnology: stringArray(input.equipmentOrTechnology),
        requiredCapabilities: stringArray(input.requiredCapabilities),
        location: stringValue(input.location),
        requiredBy: stringValue(input.requiredBy),
        budgetRange: stringValue(input.budgetRange),
        budgetAmount: typeof input.budgetAmount === "number" &&
            Number.isFinite(input.budgetAmount)
            ? input.budgetAmount
            : 0,
        constraints: stringArray(input.constraints)
    };
}
function stripBinaryEvidence(item) {
    return {
        kind: item.kind,
        name: item.name,
        mimeType: item.mimeType,
        extractedText: item.extractedText
    };
}
function cloneRequirementInput(input) {
    return {
        ...input,
        equipmentOrTechnology: [...input.equipmentOrTechnology],
        requiredCapabilities: [...input.requiredCapabilities],
        constraints: [...input.constraints]
    };
}
function stringValue(value) {
    return typeof value === "string" ? value : "";
}
function stringArray(value) {
    return Array.isArray(value)
        ? value.filter((item) => typeof item === "string")
        : [];
}
