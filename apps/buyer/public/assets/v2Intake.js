import { parseUrgencyDays } from "./urgency.js";
export function emptyV2Intake() {
    return {
        rawRequirement: "",
        title: "",
        location: "",
        urgencyDays: undefined,
        budgetAud: undefined,
        category: "",
        industry: "",
        equipment: "",
        capabilities: "",
        constraints: "",
        buyerPriority: "technical_fit",
        buyerEmail: "",
        buyerName: "",
        companyName: ""
    };
}
export function applyAiIntakeToDraft(current, result) {
    const generated = result.generatedProfile;
    return {
        ...current,
        rawRequirement: result.rawRequirement,
        title: generated.title,
        location: generated.location ?? "",
        urgencyDays: parseUrgencyDays(generated.urgency ?? ""),
        budgetAud: budgetUpperBoundAud(generated.budgetRange),
        category: generated.category,
        industry: "",
        equipment: generated.equipmentOrTechnology.join(", "),
        capabilities: generated.requiredCapabilities.join(", "),
        constraints: generated.certificationsOrConstraints.join(", "),
        buyerPriority: generated.buyerPriority ?? current.buyerPriority
    };
}
export function budgetUpperBoundAud(value) {
    if (!value?.trim())
        return undefined;
    const amounts = [...value.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*([km])?\b/gi)]
        .map((match) => {
        const amount = Number(match[1]?.replaceAll(",", ""));
        const multiplier = match[2]?.toLowerCase() === "m"
            ? 1_000_000
            : match[2]?.toLowerCase() === "k"
                ? 1_000
                : 1;
        return amount * multiplier;
    })
        .filter((amount) => Number.isFinite(amount) && amount > 0);
    if (!amounts.length)
        return undefined;
    return Math.round(Math.max(...amounts));
}
export function optionalPositiveInteger(value, label) {
    const raw = String(value ?? "").trim();
    if (!raw)
        return undefined;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`${label} must be a positive whole number`);
    }
    return parsed;
}
