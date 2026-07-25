const runtimeWindow = window;
const API_BASE = runtimeWindow.API_BASE_URL ?? "http://localhost:4000/api";
export class BackendAiIntakeService {
    fallback = new DemoAiIntakeService();
    async structureRequirement(input) {
        try {
            const response = await fetch(`${API_BASE}/ai-intake/structure`, {
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
            const result = payload.aiIntakeResult ?? payload.result;
            if (!result) {
                throw new Error("AI intake service returned an empty result.");
            }
            return result;
        }
        catch (error) {
            if (error instanceof TypeError) {
                return this.fallback.structureRequirement(input);
            }
            throw error;
        }
    }
}
export class DemoAiIntakeService {
    async structureRequirement(input) {
        // Local-only fallback for demo environments where the API server is not running.
        await delay(320);
        const evidenceText = (input.evidence ?? [])
            .map((item) => item.extractedText)
            .filter((item) => Boolean(item?.trim()))
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
                category: equipmentOrTechnology.some((item) => /robot|plc|scada|hmi|conveyor/i.test(item))
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
function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}
function detectEquipment(normalised) {
    const equipment = new Set();
    if (normalised.includes("abb"))
        equipment.add("ABB robotic arm");
    if (normalised.includes("robot"))
        equipment.add("Robotic cell");
    if (normalised.includes("palletis"))
        equipment.add("Palletising cell");
    if (normalised.includes("siemens"))
        equipment.add("Siemens PLC");
    if (normalised.includes("plc"))
        equipment.add("PLC");
    if (normalised.includes("conveyor"))
        equipment.add("Packaging conveyor");
    if (normalised.includes("packaging line"))
        equipment.add("Packaging line");
    if (normalised.includes("hmi"))
        equipment.add("HMI");
    if (normalised.includes("scada"))
        equipment.add("SCADA");
    return [...equipment];
}
function detectCapabilities(normalised, equipmentOrTechnology) {
    const capabilities = new Set();
    if (normalised.includes("robot"))
        capabilities.add("Robotic cell fault recovery");
    if (normalised.includes("abb"))
        capabilities.add("ABB robot diagnostics");
    if (normalised.includes("palletis"))
        capabilities.add("Palletising cell recovery");
    if (normalised.includes("siemens"))
        capabilities.add("Siemens PLC diagnostics");
    if (normalised.includes("plc"))
        capabilities.add("PLC fault finding");
    if (normalised.includes("conveyor"))
        capabilities.add("Conveyor fault recovery");
    if (normalised.includes("safety"))
        capabilities.add("Safety circuit diagnostics");
    if (normalised.includes("today") || normalised.includes("urgent") || normalised.includes("stopped")) {
        capabilities.add("Same-day onsite support");
    }
    if (equipmentOrTechnology.length && !capabilities.size) {
        capabilities.add("Industrial equipment diagnostics");
    }
    return [...capabilities];
}
function detectLocation(normalised) {
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
function detectBudget(rawRequirement) {
    const match = rawRequirement.match(/\$?\s?(\d{3,5})(?:\s?aud)?/i);
    return match ? `Up to AUD ${Number(match[1]).toLocaleString("en-AU")}` : undefined;
}
function detectConstraints(normalised, isUrgent, evidence) {
    const constraints = new Set();
    if (normalised.includes("factory") || normalised.includes("line"))
        constraints.add("Production environment");
    if (normalised.includes("food") || normalised.includes("packaging"))
        constraints.add("Packaging/food manufacturing context");
    if (isUrgent)
        constraints.add("Minimal downtime");
    if (evidence.some((item) => item.kind === "pdf"))
        constraints.add("PDF evidence attached for supplier review");
    if (evidence.some((item) => item.kind === "photo"))
        constraints.add("Photo evidence attached; visual details require OCR/vision service confirmation");
    return [...constraints];
}
function titleFromRequirement(rawRequirement, equipmentOrTechnology) {
    if (equipmentOrTechnology.some((item) => item.includes("ABB robotic arm"))) {
        return "Robotic palletiser stopped before dispatch";
    }
    if (equipmentOrTechnology.some((item) => item.includes("Siemens PLC"))) {
        return "Urgent Siemens PLC fault on packaging line";
    }
    const firstSentence = rawRequirement.split(/[.!?]/)[0]?.trim();
    return firstSentence ? firstSentence.slice(0, 90) : "Industrial supplier requirement";
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
    if (!input.isUrgent)
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
