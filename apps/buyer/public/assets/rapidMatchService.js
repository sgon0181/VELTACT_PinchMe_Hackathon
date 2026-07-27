import { deploymentSummarySchema, rapidMatchApiRoute, rapidMatchBuyerWorkspaceSchema, solutionDecisionSchema, solutionResearchResultSchema, supplierResponseSchema } from "@veltact/contracts";
import { parseUrgencyDays } from "./urgency.js";
const runtimeWindow = window;
const API_BASE = runtimeWindow.API_BASE_URL ?? defaultApiBase();
const FRONTEND_BASE = runtimeWindow.FRONTEND_BASE_URL ?? window.location.origin;
export class RapidMatchService {
    buyerAccessTokens = new Map();
    marketplaceProfiles = new Map();
    setBuyerAccessToken(needProfileId, token) {
        if (token) {
            this.buyerAccessTokens.set(needProfileId, token);
        }
    }
    buyerAccessTokenForNeed(needProfileId) {
        return this.buyerAccessTokens.get(needProfileId);
    }
    async createNeedProfile(input, priority, evidence) {
        const profile = requirementToMarketplaceProfile(input, priority);
        const payload = await requestJson(rapidMatchApiRoute.createNeedProfile, {
            method: "POST",
            body: {
                buyerEmail: input.contactEmail || "demo.buyer@example.com",
                profile
            }
        });
        const need = payload.need ?? payload.needProfile;
        const canonical = canonicalWorkspaceFrom(payload);
        if (!need && !canonical?.needProfile) {
            throw new Error("The API did not return a Need Profile.");
        }
        const needProfileId = canonical?.needProfile?.id ?? need?.id;
        if (!needProfileId) {
            throw new Error("The API returned a Need Profile without an ID.");
        }
        if (payload.buyerAccessToken) {
            this.setBuyerAccessToken(needProfileId, payload.buyerAccessToken);
        }
        this.marketplaceProfiles.set(needProfileId, profile);
        const workspace = canonical ??
            legacyWorkspace(need, {
                phase: "find",
                status: "need_profile_review",
                nextAction: "confirm_need_profile",
                intakeEvidence: evidence
            });
        return {
            buyerAccessToken: payload.buyerAccessToken,
            workspace: {
                ...workspace,
                phase: "find",
                status: "need_profile_review",
                nextAction: "confirm_need_profile",
                intakeEvidence: evidence
            }
        };
    }
    async restoreWorkspace(needProfileId, current, engagementId) {
        const payload = await requestJson(routeFor(rapidMatchApiRoute.needWorkspace, { needProfileId }), {
            method: "GET",
            buyerAccessToken: this.buyerAccessTokens.get(needProfileId)
        });
        const need = payload.need ?? payload.needProfile;
        if (need?.profile) {
            this.marketplaceProfiles.set(needProfileId, need.profile);
        }
        const canonical = canonicalWorkspaceFrom(payload);
        let workspace = canonical
            ? {
                ...canonical,
                intakeEvidence: canonical.intakeEvidence.length
                    ? canonical.intakeEvidence
                    : current?.intakeEvidence ?? [],
                researchResult: canonical.researchResult ?? current?.researchResult,
                solutionDecision: canonical.solutionDecision ?? current?.solutionDecision,
                engagement: canonical.engagement ?? current?.engagement,
                deployment: canonical.deployment ?? current?.deployment
            }
            : need
                ? legacyWorkspace(need, current)
                : undefined;
        if (!workspace) {
            throw new Error("The API did not return the buyer workspace.");
        }
        workspace = await this.loadResponses(workspace);
        if (workspace.engagement?.id || engagementId) {
            workspace = await this.loadEngagement(workspace, workspace.engagement?.id ?? engagementId);
        }
        return reconcileWorkspace(workspace);
    }
    async researchRequirement(workspace) {
        const needProfile = requiredNeedProfile(workspace);
        try {
            const payload = await requestJson(routeFor(rapidMatchApiRoute.research, {
                needProfileId: needProfile.id
            }), {
                method: "POST",
                body: {},
                buyerAccessToken: this.buyerAccessTokens.get(needProfile.id)
            });
            const canonical = canonicalWorkspaceFrom(payload);
            const researchResult = canonical?.researchResult ??
                parseResearch(payload.researchResult);
            if (!researchResult) {
                throw new Error("Research completed without a structured result.");
            }
            return {
                ...(canonical ?? workspace),
                phase: "find",
                status: "solution_review",
                nextAction: "find_specialist",
                researchResult
            };
        }
        catch (error) {
            if (!isUnavailableRoute(error))
                throw error;
            const profile = this.marketplaceProfiles.get(needProfile.id) ??
                marketplaceProfileFromNeed(needProfile);
            return {
                ...workspace,
                phase: "find",
                status: "solution_review",
                nextAction: "find_specialist",
                researchResult: fixtureResearch(needProfile.id, profile)
            };
        }
    }
    async recordSolutionDecision(workspace, decision) {
        const needProfile = requiredNeedProfile(workspace);
        const research = workspace.researchResult;
        if (!research) {
            throw new Error("Analyse the requirement before choosing an outcome.");
        }
        const selectedApproachIds = [recommendedApproach(research).id];
        try {
            const payload = await requestJson(routeFor(rapidMatchApiRoute.solutionDecision, {
                needProfileId: needProfile.id
            }), {
                method: "POST",
                body: {
                    decision,
                    selectedApproachIds,
                    approvedBy: needProfile.contactName ?? "Buyer"
                },
                buyerAccessToken: this.buyerAccessTokens.get(needProfile.id)
            });
            const canonical = canonicalWorkspaceFrom(payload);
            const solutionDecision = canonical?.solutionDecision ??
                parseDecision(payload.solutionDecision);
            if (!solutionDecision) {
                throw new Error("The API did not return the solution decision.");
            }
            return decisionWorkspace(canonical ?? workspace, solutionDecision);
        }
        catch (error) {
            if (!isUnavailableRoute(error))
                throw error;
            return decisionWorkspace(workspace, fixtureDecision(workspace, decision));
        }
    }
    async discoverSuppliers(workspace) {
        const needProfile = requiredNeedProfile(workspace);
        try {
            const payload = await requestJson(routeFor(rapidMatchApiRoute.discoverSuppliers, {
                needProfileId: needProfile.id
            }), {
                method: "POST",
                body: {},
                buyerAccessToken: this.buyerAccessTokens.get(needProfile.id)
            });
            const canonical = canonicalWorkspaceFrom(payload);
            if (canonical) {
                return {
                    ...canonical,
                    phase: "connect",
                    status: "supplier_outreach",
                    nextAction: "approve_outreach"
                };
            }
            return this.restoreWorkspace(needProfile.id, {
                ...workspace,
                phase: "connect",
                status: "supplier_outreach",
                nextAction: "approve_outreach"
            });
        }
        catch (error) {
            if (!isUnavailableRoute(error))
                throw error;
            const restored = await this.restoreWorkspace(needProfile.id, workspace);
            return {
                ...restored,
                phase: "connect",
                status: "supplier_outreach",
                nextAction: "approve_outreach"
            };
        }
    }
    async sendSupplierOutreach(workspace) {
        const needProfile = requiredNeedProfile(workspace);
        await requestJson(routeFor(rapidMatchApiRoute.sendInvitations, {
            needProfileId: needProfile.id
        }), {
            method: "POST",
            body: {},
            buyerAccessToken: this.buyerAccessTokens.get(needProfile.id)
        });
        const restored = await this.restoreWorkspace(needProfile.id, workspace);
        return {
            ...restored,
            phase: "connect",
            status: restored.responses.length ? "supplier_responses" : "supplier_outreach",
            nextAction: restored.responses.length ? "compare_responses" : "await_responses"
        };
    }
    async refreshWorkspace(workspace) {
        const needProfile = requiredNeedProfile(workspace);
        return this.restoreWorkspace(needProfile.id, workspace, workspace.engagement?.id);
    }
    async selectSupplier(workspace, supplierResponseId) {
        const needProfile = requiredNeedProfile(workspace);
        const payload = await requestJson(routeFor(rapidMatchApiRoute.createEngagement, {
            needProfileId: needProfile.id
        }), {
            method: "POST",
            body: { supplierResponseId },
            buyerAccessToken: this.buyerAccessTokens.get(needProfile.id)
        });
        const canonical = canonicalWorkspaceFrom(payload);
        const engagement = canonical?.engagement ?? payload.engagement;
        if (!engagement) {
            throw new Error("The API did not create a supplier engagement.");
        }
        return {
            ...(canonical ?? workspace),
            phase: "deploy",
            status: "commitment_pending",
            nextAction: "open_pinch_checkout",
            engagement
        };
    }
    async createPaymentLink(workspace) {
        const needProfile = requiredNeedProfile(workspace);
        const engagement = requiredEngagement(workspace);
        const payload = await requestJson(routeFor(rapidMatchApiRoute.paymentLink, {
            engagementId: engagement.id
        }), {
            method: "POST",
            body: {},
            buyerAccessToken: this.buyerAccessTokens.get(needProfile.id)
        });
        const nextEngagement = {
            ...(payload.engagement ?? engagement),
            hostedCheckoutUrl: payload.hostedCheckoutUrl ??
                payload.engagement?.hostedCheckoutUrl ??
                engagement.hostedCheckoutUrl
        };
        let next = {
            ...workspace,
            phase: "deploy",
            status: "commitment_pending",
            nextAction: "await_payment_confirmation",
            engagement: nextEngagement
        };
        next = await this.loadDeployment(next);
        return next;
    }
    async refreshEngagement(workspace) {
        const engagement = requiredEngagement(workspace);
        return this.loadEngagement(workspace, engagement.id);
    }
    async completeDemoPayment(workspace) {
        const needProfile = requiredNeedProfile(workspace);
        const engagement = requiredEngagement(workspace);
        const payload = await requestJson(`/api/engagements/${encodeURIComponent(engagement.id)}/demo-payment`, {
            method: "POST",
            body: {},
            buyerAccessToken: this.buyerAccessTokens.get(needProfile.id)
        });
        if (!payload.engagement) {
            throw new Error("The local demo did not return payment evidence.");
        }
        return this.loadDeployment({
            ...workspace,
            phase: "deploy",
            status: "supplier_secured",
            nextAction: "track_delivery",
            engagement: payload.engagement
        });
    }
    async loadResponses(workspace) {
        const needProfile = requiredNeedProfile(workspace);
        try {
            const payload = await requestJson(routeFor(rapidMatchApiRoute.responses, {
                needProfileId: needProfile.id
            }), {
                method: "GET",
                buyerAccessToken: this.buyerAccessTokens.get(needProfile.id)
            });
            const responsePayload = payload.supplierResponses ?? payload.responses ?? [];
            const responses = responsePayload.flatMap((item) => {
                const parsed = supplierResponseSchema.safeParse(item);
                return parsed.success ? [parsed.data] : [];
            });
            return {
                ...workspace,
                responses
            };
        }
        catch (error) {
            if (!isUnavailableRoute(error))
                throw error;
            return workspace;
        }
    }
    async loadEngagement(workspace, engagementId) {
        const needProfile = requiredNeedProfile(workspace);
        const payload = await requestJson(routeFor(rapidMatchApiRoute.engagement, { engagementId }), {
            method: "GET",
            buyerAccessToken: this.buyerAccessTokens.get(needProfile.id)
        });
        const canonical = canonicalWorkspaceFrom(payload);
        const engagement = canonical?.engagement ?? payload.engagement;
        if (!engagement) {
            throw new Error("The API did not return the supplier engagement.");
        }
        return this.loadDeployment(reconcileWorkspace({
            ...(canonical ?? workspace),
            engagement
        }));
    }
    async loadDeployment(workspace) {
        const engagement = workspace.engagement;
        if (!engagement)
            return workspace;
        const needProfile = requiredNeedProfile(workspace);
        try {
            const payload = await requestJson(routeFor(rapidMatchApiRoute.deployment, {
                engagementId: engagement.id
            }), {
                method: "GET",
                buyerAccessToken: this.buyerAccessTokens.get(needProfile.id)
            });
            const canonical = canonicalWorkspaceFrom(payload);
            const deployment = canonical?.deployment ??
                parseDeployment(isRecord(payload) ? payload.deployment : undefined) ??
                parseDeployment(payload);
            return {
                ...(canonical ?? workspace),
                deployment
            };
        }
        catch (error) {
            if (!isUnavailableRoute(error))
                throw error;
            return {
                ...workspace,
                deployment: fixtureDeployment(workspace)
            };
        }
    }
}
async function requestJson(route, options) {
    let response;
    try {
        const headers = new Headers();
        if (options.body !== undefined) {
            headers.set("content-type", "application/json");
        }
        if (options.buyerAccessToken) {
            headers.set("x-veltact-buyer-token", options.buyerAccessToken);
        }
        response = await fetch(canonicalApiUrl(route), {
            method: options.method,
            headers,
            body: options.body === undefined ? undefined : JSON.stringify(options.body)
        });
    }
    catch {
        throw new Error("Cannot reach the Veltact API. Start the API and retry this buyer action.");
    }
    const payload = (await response.json().catch(() => ({})));
    if (!response.ok) {
        throw new ApiRequestError(response.status, payload.message ?? `Veltact API request failed (${response.status}).`);
    }
    return payload;
}
class ApiRequestError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
function isUnavailableRoute(error) {
    return (error instanceof ApiRequestError &&
        [404, 405, 501].includes(error.status));
}
function canonicalApiUrl(route) {
    const base = API_BASE.replace(/\/$/, "");
    return base.endsWith("/api") ? `${base}${route.slice(4)}` : `${base}${route}`;
}
function routeFor(template, values) {
    return Object.entries(values).reduce((route, [key, value]) => route.replace(`:${key}`, encodeURIComponent(value)), template);
}
function canonicalWorkspaceFrom(value) {
    const candidates = [
        value,
        isRecord(value) ? value.workspace : undefined,
        isRecord(value) ? value.buyerWorkspace : undefined
    ];
    for (const candidate of candidates) {
        const parsed = rapidMatchBuyerWorkspaceSchema.safeParse(candidate);
        if (parsed.success)
            return parsed.data;
    }
    return undefined;
}
function legacyWorkspace(need, current = {}) {
    const needProfile = need.needProfile ??
        legacyNeedProfile(need);
    const responses = current.responses ?? [];
    const invitations = need.supplierInvitations ?? [];
    return {
        phase: current.phase ?? "find",
        status: current.status ?? "need_profile_review",
        nextAction: current.nextAction ?? "confirm_need_profile",
        needProfile,
        intakeEvidence: current.intakeEvidence ?? [],
        researchResult: current.researchResult,
        solutionDecision: current.solutionDecision,
        discoveredSuppliers: current.discoveredSuppliers ?? [],
        suppliers: need.suppliers ?? current.suppliers ?? [],
        matches: need.supplierMatches ?? current.matches ?? [],
        invitations: invitations.map((invitation) => ({
            ...invitation,
            responseUrl: invitation.responseUrl ||
                `${FRONTEND_BASE}/supplier.html?token=${encodeURIComponent(invitation.token)}`
        })),
        outreachDeliveries: need.supplierOutreachDeliveries ??
            current.outreachDeliveries ??
            [],
        responses,
        engagement: current.engagement,
        deployment: current.deployment
    };
}
function legacyNeedProfile(need) {
    const profile = need.profile;
    const createdAt = need.createdAt;
    return {
        id: need.id,
        companyName: companyNameFromEmail(need.buyerEmail),
        contactEmail: need.buyerEmail,
        title: profile.title,
        description: profile.problemSummary ?? profile.description,
        category: profile.category,
        location: profile.location,
        priority: contractNeedPriority(profile),
        requiredBy: availabilityLabel(profile.urgencyDays),
        budget: profile.budgetAud === undefined
            ? undefined
            : { amount: profile.budgetAud * 100, currency: "AUD" },
        mustHaves: [
            ...(profile.equipmentOrTechnology ?? profile.equipmentTechnology ?? []).map((item) => `Equipment: ${item}`),
            ...(profile.requiredCapabilities ?? profile.requiredCapability ?? [])
        ],
        niceToHaves: [
            "Comparable supplier response",
            "Clear commercial assumptions"
        ],
        constraints: profile.constraints ?? [],
        status: needStatus(need.status),
        createdAt,
        updatedAt: need.updatedAt ?? createdAt
    };
}
function reconcileWorkspace(workspace) {
    const engagement = workspace.engagement;
    if (engagement?.status === "supplier_secured") {
        return {
            ...workspace,
            phase: "deploy",
            status: workspace.deployment?.status === "completed"
                ? "delivery_complete"
                : workspace.deployment?.status === "active"
                    ? "delivery_active"
                    : "supplier_secured",
            nextAction: "track_delivery"
        };
    }
    if (engagement) {
        return {
            ...workspace,
            phase: "deploy",
            status: "commitment_pending",
            nextAction: engagement.hostedCheckoutUrl
                ? "await_payment_confirmation"
                : "open_pinch_checkout"
        };
    }
    if (workspace.responses.length >= 2) {
        return {
            ...workspace,
            phase: "connect",
            status: "supplier_selection",
            nextAction: "select_supplier"
        };
    }
    if (workspace.responses.length > 0) {
        return {
            ...workspace,
            phase: "connect",
            status: "supplier_responses",
            nextAction: "compare_responses"
        };
    }
    return workspace;
}
function decisionWorkspace(workspace, solutionDecision) {
    const internal = solutionDecision.decision === "local_trial";
    return {
        ...workspace,
        phase: "find",
        status: internal ? "internal_plan_ready" : "supplier_matching",
        nextAction: internal ? "none" : "find_specialist",
        solutionDecision
    };
}
function parseResearch(value) {
    const parsed = solutionResearchResultSchema.safeParse(value);
    return parsed.success ? parsed.data : undefined;
}
function parseDecision(value) {
    const parsed = solutionDecisionSchema.safeParse(value);
    return parsed.success ? parsed.data : undefined;
}
function parseDeployment(value) {
    const parsed = deploymentSummarySchema.safeParse(value);
    return parsed.success ? parsed.data : undefined;
}
function requiredNeedProfile(workspace) {
    if (!workspace.needProfile) {
        throw new Error("Create a Need Profile before continuing.");
    }
    return workspace.needProfile;
}
function requiredEngagement(workspace) {
    if (!workspace.engagement) {
        throw new Error("Select a supplier before starting the commitment.");
    }
    return workspace.engagement;
}
function requirementToMarketplaceProfile(input, priority) {
    return {
        title: input.title || "Industrial supplier requirement",
        description: input.description,
        problemSummary: input.description,
        category: input.category || inferCategory(input.description),
        industry: "Manufacturing",
        equipmentOrTechnology: input.equipmentOrTechnology,
        location: input.location,
        urgencyDays: parseUrgencyDays(input.requiredBy),
        budgetAud: input.budgetAmount || parseBudgetAmount(input.budgetRange),
        constraints: input.constraints,
        buyerPriority: priority,
        requiredCapabilities: input.requiredCapabilities.length
            ? input.requiredCapabilities
            : inferCapabilities(input.description)
    };
}
function marketplaceProfileFromNeed(needProfile) {
    return {
        title: needProfile.title,
        description: needProfile.description,
        problemSummary: needProfile.description,
        category: needProfile.category,
        industry: "Manufacturing",
        equipmentOrTechnology: needProfile.mustHaves
            .filter((item) => item.startsWith("Equipment: "))
            .map((item) => item.slice("Equipment: ".length)),
        location: needProfile.location,
        urgencyDays: needProfile.priority === "urgent" ? 1 : undefined,
        budgetAud: needProfile.budget
            ? Math.round(needProfile.budget.amount / 100)
            : undefined,
        constraints: needProfile.constraints,
        buyerPriority: needProfile.priority === "urgent" ? "speed" : "technical_fit",
        requiredCapabilities: needProfile.mustHaves.filter((item) => !item.startsWith("Equipment: "))
    };
}
function fixtureResearch(needProfileId, profile) {
    const robotics = isRobotics(profile);
    const generatedAt = new Date().toISOString();
    const citations = robotics
        ? [
            fixtureCitation(`${needProfileId}-citation-safety`, "Guide to machinery and equipment safety", "https://www.safeworkaustralia.gov.au/doc/guide-machinery-and-equipment-safety", "Safe Work Australia guidance supports identifying machinery hazards and controlling risk across design, operation and maintenance.", generatedAt),
            fixtureCitation(`${needProfileId}-citation-standard`, "ISO 10218-2:2025 Robotics - Safety requirements", "https://www.iso.org/standard/73934.html", "The standard identifies safety requirements for industrial robot applications and robot cells.", generatedAt),
            fixtureCitation(`${needProfileId}-citation-manufacturer`, "ABB robotics application engineering", "https://new.abb.com/products/robotics", "Manufacturer material illustrates the tooling, software and service disciplines involved in robot integration.", generatedAt)
        ]
        : [
            fixtureCitation(`${needProfileId}-citation-safety`, "Electrical work", "https://www.safework.nsw.gov.au/hazards-a-z/electrical-and-power/electrical-work", "SafeWork NSW guidance supports using competent, authorised workers and controlling electrical risks.", generatedAt),
            fixtureCitation(`${needProfileId}-citation-controller`, "SIMATIC controllers", "https://www.siemens.com/global/en/products/automation/systems/industrial/plc.html", "Manufacturer material supports checking controller family, tooling and lifecycle compatibility before recovery.", generatedAt)
        ];
    const citationIds = citations.map((citation) => citation.id);
    const approaches = robotics
        ? [
            {
                id: `${needProfileId}-approach-recommended`,
                needProfileId,
                title: "Staged integration with safety-led acceptance",
                summary: "Validate the use case and safety concept, prove the handling process, then commission against measurable acceptance criteria.",
                rationale: "A staged integrator-led path contains technical and production risk while preserving clear commercial milestones.",
                localActions: [
                    "Capture carton variants, cycle-time targets and available footprint.",
                    "Nominate operations, maintenance and safety stakeholders."
                ],
                outsourceTriggers: [
                    "Formal machinery risk assessment or guarding design is required.",
                    "The cell needs robot simulation, tooling design or controls integration."
                ],
                requiredCapabilities: [
                    "robotic systems integration",
                    "machinery safety",
                    "commissioning"
                ],
                risks: [
                    "Process variation is not represented in early trials.",
                    "Site interfaces are discovered after equipment selection."
                ],
                confidence: 0.9,
                citationIds
            },
            {
                id: `${needProfileId}-approach-alternative-1`,
                needProfileId,
                title: "Proof of process before full cell design",
                summary: "Trial the highest-risk handling, sensing and end-of-arm tooling assumptions before committing to full fabrication.",
                rationale: "A focused trial reduces integration risk where product variation or tooling performance is uncertain.",
                localActions: [
                    "Provide representative cartons and failure examples.",
                    "Agree measurable pass/fail trial outcomes."
                ],
                outsourceTriggers: [
                    "Specialist vision or custom tooling is required."
                ],
                requiredCapabilities: [
                    "robot programming",
                    "end-of-arm tooling",
                    "machine vision"
                ],
                risks: ["Trial samples may not represent production variability."],
                confidence: 0.83,
                citationIds
            }
        ]
        : [
            {
                id: `${needProfileId}-approach-recommended`,
                needProfileId,
                title: "Safe evidence capture and controlled recovery",
                summary: "Preserve alarms, controller state and recent change history, then have an authorised controls specialist compare diagnostics with an approved baseline.",
                rationale: "This shortens specialist fault-finding without encouraging unreviewed changes or unsafe bypasses.",
                localActions: [
                    "Follow the site's isolation and authorisation procedure.",
                    "Capture non-sensitive alarm evidence and locate approved backups without loading them."
                ],
                outsourceTriggers: [
                    "Safety-related controls or unknown program changes may be involved.",
                    "No verified backup or compatible engineering environment is available."
                ],
                requiredCapabilities: [
                    "industrial electrical fault finding",
                    "PLC diagnostics",
                    "safe isolation"
                ],
                risks: [
                    "Unrecorded changes may overwrite useful fault evidence.",
                    "The visible PLC alarm may be a symptom of another subsystem."
                ],
                confidence: 0.91,
                citationIds
            },
            {
                id: `${needProfileId}-approach-alternative-1`,
                needProfileId,
                title: "Stabilisation and recurrence prevention",
                summary: "After recovery, capture the validated baseline and convert the incident into backup, spares and monitoring actions.",
                rationale: "Recovery is incomplete until the factory reduces the likelihood and impact of repeat downtime.",
                localActions: [
                    "Record approved firmware and hardware configuration.",
                    "Schedule a short incident review."
                ],
                outsourceTriggers: [
                    "The cause remains unconfirmed after restoration."
                ],
                requiredCapabilities: [
                    "controls lifecycle planning",
                    "industrial network health"
                ],
                risks: ["A temporary recovery may become an undocumented baseline."],
                confidence: 0.84,
                citationIds
            }
        ];
    return solutionResearchResultSchema.parse({
        id: `${needProfileId}-fixture-research`,
        needProfileId,
        sourceMode: "fixture",
        overview: robotics
            ? "A robotic cell is best framed as a staged integration project with early process, safety and acceptance validation."
            : "An urgent PLC outage should separate safe evidence gathering from restoration work and escalate quickly when authorised controls expertise is unavailable.",
        approaches,
        citations,
        missingInformation: robotics
            ? [
                "Representative carton range and target cycle time",
                "Available footprint and site service constraints",
                "Required safety and quality acceptance evidence"
            ]
            : [
                "Controller make, model and visible fault state",
                "Availability and provenance of the last verified backup",
                "Whether safety-related controls are affected"
            ],
        safetyNotice: "This is AI-assisted procurement analysis, not a diagnosis or instruction to alter industrial equipment. Only authorised personnel should inspect, isolate, program or restart machinery.",
        generatedAt
    });
}
function fixtureCitation(id, title, url, evidenceNote, accessedAt) {
    return {
        id,
        title,
        url,
        sourceType: title.includes("ABB") || title.includes("SIMATIC")
            ? "manufacturer"
            : "standards",
        provider: "fixture",
        evidenceNote,
        accessedAt
    };
}
function fixtureDecision(workspace, decision) {
    const needProfile = requiredNeedProfile(workspace);
    const research = workspace.researchResult;
    if (!research)
        throw new Error("Research is required.");
    return solutionDecisionSchema.parse({
        id: `${needProfile.id}-fixture-decision`,
        needProfileId: needProfile.id,
        researchResultId: research.id,
        decision,
        selectedApproachIds: [recommendedApproach(research).id],
        approvedBy: needProfile.contactName ?? "Buyer",
        approvedAt: new Date().toISOString()
    });
}
function fixtureDeployment(workspace) {
    const engagement = requiredEngagement(workspace);
    const needProfile = requiredNeedProfile(workspace);
    const robotics = /robot|palletis/i.test(`${needProfile.title} ${needProfile.description} ${needProfile.category}`);
    const titles = robotics
        ? ["Site assessment", "Design", "Installation", "Commissioning"]
        : ["Diagnosis", "Recovery", "Validation", "Handover"];
    const secured = engagement.status === "supplier_secured";
    const paymentPending = engagement.paymentStatus !== "not_started";
    const updatedAt = engagement.updatedAt;
    return deploymentSummarySchema.parse({
        engagementId: engagement.id,
        title: robotics
            ? "Robotic integration delivery"
            : "PLC recovery delivery",
        status: secured ? "active" : paymentPending ? "commitment_pending" : "not_started",
        progressPercentage: 0,
        currentMilestoneId: `${engagement.id}-fixture-milestone-1`,
        nextMilestoneId: `${engagement.id}-fixture-milestone-2`,
        milestones: titles.map((title, index) => ({
            id: `${engagement.id}-fixture-milestone-${index + 1}`,
            engagementId: engagement.id,
            sequence: index + 1,
            title,
            status: index === 0
                ? secured
                    ? "funded"
                    : paymentPending
                        ? "awaiting_payment"
                        : "not_started"
                : "not_started",
            paymentStatus: index === 0 ? engagement.paymentStatus : "not_started",
            progressPercentage: 0,
            latestUpdate: index === 0 && secured
                ? "Commitment funded; engineering work has not been marked complete."
                : undefined,
            updatedAt
        })),
        latestUpdate: secured
            ? "Supplier commitment verified. Current milestone is ready to begin."
            : "Deployment projection is waiting for authoritative payment evidence.",
        updatedAt
    });
}
function recommendedApproach(research) {
    return [...research.approaches].sort((left, right) => right.confidence - left.confidence)[0];
}
function isRobotics(profile) {
    return /robot|palletis|cobot|manipulator/i.test([
        profile.title,
        profile.description,
        profile.category,
        ...(profile.equipmentOrTechnology ?? [])
    ].join(" "));
}
function inferCategory(description) {
    return /robot|plc|automation|conveyor/i.test(description)
        ? "Industrial automation"
        : "Industrial services";
}
function inferCapabilities(description) {
    const capabilities = new Set();
    const normalised = description.toLowerCase();
    if (normalised.includes("robot"))
        capabilities.add("Robotic systems integration");
    if (normalised.includes("abb"))
        capabilities.add("ABB robotics");
    if (normalised.includes("siemens"))
        capabilities.add("Siemens PLC diagnostics");
    if (normalised.includes("plc"))
        capabilities.add("PLC diagnostics");
    if (normalised.includes("safety"))
        capabilities.add("Machinery safety");
    capabilities.add("Industrial onsite support");
    return [...capabilities];
}
function parseBudgetAmount(value) {
    const match = value.match(/(\d[\d,]*)/);
    return match ? Number(match[1].replaceAll(",", "")) : undefined;
}
function availabilityLabel(days) {
    if (!days)
        return undefined;
    if (days === 1)
        return "Required today";
    return `Required within ${days} days`;
}
function contractNeedPriority(profile) {
    if (profile.buyerPriority === "speed" ||
        (profile.urgencyDays !== undefined && profile.urgencyDays <= 1)) {
        return "urgent";
    }
    if (profile.urgencyDays !== undefined &&
        profile.urgencyDays <= 14) {
        return "soon";
    }
    return "planned";
}
function needStatus(value) {
    const statuses = [
        "draft",
        "submitted",
        "matching",
        "inviting",
        "responses_open",
        "selection_ready",
        "selected",
        "payment_pending",
        "secured",
        "cancelled"
    ];
    return statuses.includes(value)
        ? value
        : "submitted";
}
function companyNameFromEmail(email) {
    const domain = email.split("@")[1]?.split(".")[0];
    return domain
        ? domain.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
        : "Buyer organisation";
}
function defaultApiBase() {
    if (["localhost", "127.0.0.1"].includes(window.location.hostname) &&
        window.location.port !== "4000") {
        return "http://localhost:4000/api";
    }
    return `${window.location.origin}/api`;
}
function isRecord(value) {
    return Boolean(value) && typeof value === "object";
}
