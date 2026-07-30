import { aiIntakeResultSchema, detectIntakeBudget, detectIntakeCapabilities, detectIntakeEquipment, detectIntakeLocation, detectIntakeUrgency, intakeCategoryFromEquipment, intakeTitleFromRequirement, isIntakeRecoveryRequirement, isIntakeUrgent, rapidMatchApiRoute } from "@veltact/contracts";
import { apiBaseUrl } from "./apiBase.js";
const API_BASE = apiBaseUrl();
export class BackendAiIntakeService {
    fallback = new DemoAiIntakeService();
    lastSourceMode = "fixture";
    sourceMode() {
        return this.lastSourceMode;
    }
    async structureRequirement(input) {
        try {
            const response = await fetch(canonicalApiUrl(rapidMatchApiRoute.structureRequirement), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(input)
            });
            const payload = (await response.json());
            if (!response.ok) {
                throw new Error(payload.message ?? "Unable to structure the requirement.");
            }
            const parsedResult = aiIntakeResultSchema.safeParse(payload.aiIntakeResult ?? payload.result);
            if (!parsedResult.success) {
                throw new Error("AI intake service returned an empty result.");
            }
            this.lastSourceMode =
                payload.source === "openai" || payload.source === "live"
                    ? "live"
                    : "fixture";
            return parsedResult.data;
        }
        catch (error) {
            if (error instanceof TypeError) {
                this.lastSourceMode = "fixture";
                return this.fallback.structureRequirement(input);
            }
            throw error;
        }
    }
}
export class DemoAiIntakeService {
    sourceMode() {
        return "fixture";
    }
    async structureRequirement(input) {
        // Local-only fallback for demo environments where the API server is not running.
        await delay(320);
        const evidenceText = (input.evidence ?? [])
            .map((item) => item.extractedText)
            .filter((item) => Boolean(item?.trim()))
            .join("\n");
        const suppliedRequirement = input.rawRequirement.trim();
        const rawRequirement = [suppliedRequirement, evidenceText]
            .filter(Boolean)
            .join("\n\n");
        if (!rawRequirement) {
            throw new Error("Local intake cannot read binary-only PDF or photo evidence. Add a written factory description or extracted text.");
        }
        const normalised = rawRequirement.toLowerCase();
        const isUrgent = isIntakeUrgent(normalised);
        const requiresRecovery = isIntakeRecoveryRequirement(normalised);
        const equipmentOrTechnology = detectIntakeEquipment(normalised);
        const requiredCapabilities = detectIntakeCapabilities(normalised, equipmentOrTechnology, requiresRecovery);
        const location = detectIntakeLocation(rawRequirement);
        const urgency = detectIntakeUrgency(rawRequirement, isUrgent);
        const budgetRange = detectIntakeBudget(rawRequirement);
        const constraints = detectConstraints(normalised, isUrgent, input.evidence ?? []);
        return aiIntakeResultSchema.parse({
            rawRequirement,
            generatedProfile: {
                title: intakeTitleFromRequirement(rawRequirement, equipmentOrTechnology, requiresRecovery),
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
}
function canonicalApiUrl(route) {
    const base = API_BASE.replace(/\/$/, "");
    return base.endsWith("/api") ? `${base}${route.slice(4)}` : `${base}${route}`;
}
function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}
function detectConstraints(normalised, isUrgent, evidence) {
    const constraints = new Set();
    if (normalised.includes("factory") || normalised.includes("line"))
        constraints.add("Production environment");
    if (normalised.includes("food") || normalised.includes("packaging"))
        constraints.add("Packaging/food manufacturing context");
    if (isUrgent)
        constraints.add("Minimal downtime");
    if (/adjacent production|avoid(?:s|ing)? disrupting|maintain(?:ing)? production|staged installation/.test(normalised)) {
        constraints.add("Maintain adjacent production access");
    }
    if (/operator training|\btraining\b/.test(normalised)) {
        constraints.add("Operator training required");
    }
    if (evidence.some((item) => item.kind === "pdf"))
        constraints.add("PDF evidence attached for supplier review");
    if (evidence.some((item) => item.kind === "photo"))
        constraints.add("Photo evidence attached; visual details require OCR/vision service confirmation");
    return [...constraints];
}
function confidenceScore(input) {
    let score = 0.42;
    if (input.location)
        score += 0.16;
    if (input.budgetRange)
        score += 0.1;
    if (input.requiredCapabilities.length)
        score += 0.16;
    if (input.equipmentOrTechnology.length)
        score += 0.16;
    return Math.min(0.92, Number(score.toFixed(2)));
}
function missingFields(input) {
    const missing = [];
    if (!input.location)
        missing.push("site location");
    if (!input.urgency)
        missing.push("required response timing");
    if (!input.budgetRange)
        missing.push("budget or callout tolerance");
    if (!input.equipmentOrTechnology.length)
        missing.push("equipment or technology");
    if (!input.requiredCapabilities.length)
        missing.push("required supplier capability");
    if (input.evidence.some((item) => item.kind === "photo" && !item.extractedText)) {
        missing.push("photo OCR or visual interpretation");
    }
    if (input.evidence.some((item) => item.kind === "pdf" && !item.extractedText)) {
        missing.push("PDF text extraction");
    }
    return missing;
}
