const runtimeWindow = window;
const API_BASE = runtimeWindow.API_BASE_URL ?? defaultApiBase();
const FRONTEND_BASE = runtimeWindow.FRONTEND_BASE_URL ?? window.location.origin;
export class RapidMatchService {
    apiNeeds = new Map();
    buyerAccessTokens = new Map();
    engagementNeedIds = new Map();
    async createNeedProfile(input) {
        const profile = {
            title: input.title || "Industrial supplier requirement",
            description: input.description,
            category: input.category || inferCategory(input.description),
            industry: "Food manufacturing",
            location: input.location,
            urgencyDays: urgencyDays(input.requiredBy),
            budgetAud: input.budgetAmount || parseBudgetAmount(input.budgetRange),
            requiredCapabilities: input.requiredCapabilities.length
                ? input.requiredCapabilities
                : inferCapabilities(input.description)
        };
        const payload = await requestJson("/need-profiles", {
            method: "POST",
            body: {
                buyerEmail: input.contactEmail || "demo.buyer@example.com",
                profile
            }
        });
        const need = payload.need ?? payload.needProfile;
        if (!need) {
            throw new Error("The API did not return a Need Profile.");
        }
        this.apiNeeds.set(need.id, need);
        if (payload.buyerAccessToken) {
            this.buyerAccessTokens.set(need.id, payload.buyerAccessToken);
        }
        return mapNeedProfile(need, input);
    }
    buyerAccessTokenForNeed(needId) {
        return this.buyerAccessTokens.get(needId);
    }
    async submitPriority(needProfile, priority) {
        const need = await this.loadNeed(needProfile.id);
        const responses = await this.loadResponses(need.id);
        return this.toWorkspace(need, needProfile, priority, responses);
    }
    async refreshWorkspace(workspace, priority) {
        const need = await this.loadNeed(workspace.needProfile.id);
        const responses = await this.loadResponses(need.id);
        const engagement = workspace.engagement
            ? await this.loadEngagement(workspace.engagement.id)
            : undefined;
        return {
            ...this.toWorkspace(need, workspace.needProfile, priority, responses),
            engagement,
            hostedCheckoutUrl: engagement?.hostedCheckoutUrl ?? workspace.hostedCheckoutUrl
        };
    }
    async sendSupplierOutreach(workspace, priority) {
        const payload = await requestJson(`/need-profiles/${encodeURIComponent(workspace.needProfile.id)}/invitations/send`, {
            method: "POST",
            body: {},
            buyerAccessToken: this.buyerAccessTokens.get(workspace.needProfile.id)
        });
        const need = payload.need ?? payload.needProfile ?? (await this.loadNeed(workspace.needProfile.id));
        const responses = await this.loadResponses(need.id);
        return this.toWorkspace(need, workspace.needProfile, priority, responses, payload.supplierOutreachDeliveries);
    }
    async selectSupplier(workspace, supplierResponseId) {
        const payload = await requestJson(`/need-profiles/${encodeURIComponent(workspace.needProfile.id)}/engagements`, {
            method: "POST",
            body: { supplierResponseId },
            buyerAccessToken: this.buyerAccessTokens.get(workspace.needProfile.id)
        });
        this.engagementNeedIds.set(payload.engagement.id, workspace.needProfile.id);
        return {
            ...workspace,
            needProfile: { ...workspace.needProfile, status: "selected", updatedAt: payload.engagement.updatedAt },
            engagement: mapEngagement(payload.engagement)
        };
    }
    async createPaymentLink(workspace) {
        if (!workspace.engagement) {
            throw new Error("Create an engagement before starting payment.");
        }
        const payload = await requestJson(`/engagements/${encodeURIComponent(workspace.engagement.id)}/payment-link`, {
            method: "POST",
            body: {},
            buyerAccessToken: this.buyerAccessTokens.get(workspace.needProfile.id)
        });
        const engagement = mapEngagement(payload.engagement);
        this.engagementNeedIds.set(engagement.id, workspace.needProfile.id);
        return {
            ...workspace,
            needProfile: {
                ...workspace.needProfile,
                status: engagement.status === "supplier_secured" ? "secured" : "payment_pending",
                updatedAt: engagement.updatedAt
            },
            engagement,
            hostedCheckoutUrl: payload.hostedCheckoutUrl ?? engagement.hostedCheckoutUrl
        };
    }
    async confirmSupplierSecured(workspace) {
        if (!workspace.engagement) {
            throw new Error("Payment cannot be confirmed without an engagement.");
        }
        const engagement = await this.loadEngagement(workspace.engagement.id);
        return {
            ...workspace,
            needProfile: {
                ...workspace.needProfile,
                status: engagement.status === "supplier_secured" ? "secured" : workspace.needProfile.status,
                updatedAt: engagement.updatedAt
            },
            engagement
        };
    }
    async refreshEngagement(workspace) {
        return this.confirmSupplierSecured(workspace);
    }
    async completeDemoPayment(workspace) {
        if (!workspace.engagement) {
            throw new Error("Create an engagement before completing the demo payment.");
        }
        const payload = await requestJson(`/engagements/${encodeURIComponent(workspace.engagement.id)}/demo-payment`, {
            method: "POST",
            body: {},
            buyerAccessToken: this.buyerAccessTokens.get(workspace.needProfile.id)
        });
        const engagement = mapEngagement(payload.engagement);
        return {
            ...workspace,
            needProfile: {
                ...workspace.needProfile,
                status: "secured",
                updatedAt: engagement.updatedAt
            },
            engagement
        };
    }
    async loadNeed(needId) {
        const payload = await requestJson(`/need-profiles/${encodeURIComponent(needId)}`, {
            method: "GET",
            buyerAccessToken: this.buyerAccessTokens.get(needId)
        });
        this.apiNeeds.set(payload.needProfile.id, payload.needProfile);
        return payload.needProfile;
    }
    async loadResponses(needId) {
        const payload = await requestJson(`/need-profiles/${encodeURIComponent(needId)}/responses`, {
            method: "GET",
            buyerAccessToken: this.buyerAccessTokens.get(needId)
        });
        return payload.supplierResponses ?? payload.responses ?? [];
    }
    async loadEngagement(engagementId) {
        const needId = this.engagementNeedIds.get(engagementId);
        const payload = await requestJson(`/engagements/${encodeURIComponent(engagementId)}`, {
            method: "GET",
            buyerAccessToken: needId ? this.buyerAccessTokens.get(needId) : undefined
        });
        return mapEngagement(payload.engagement);
    }
    toWorkspace(need, needProfile, priority, responses, outreachDeliveriesOverride) {
        const suppliers = mapSuppliers(need);
        const responseViews = responses.map((response) => mapSupplierResponse(response, need));
        const matches = mapMatches(need, priority, responseViews);
        return {
            needProfile: {
                ...needProfile,
                status: responseViews.length ? "selection_ready" : "responses_open",
                updatedAt: new Date().toISOString()
            },
            suppliers,
            matches,
            invitations: need.invitations.map((invitation, index) => mapInvitation(invitation, index)),
            outreachDeliveries: (outreachDeliveriesOverride ?? need.supplierOutreachDeliveries ?? []).map(mapOutreachDelivery),
            responses: responseViews
        };
    }
}
async function requestJson(path, options) {
    let response;
    try {
        const headers = new Headers();
        if (options.body !== undefined) {
            headers.set("content-type", "application/json");
        }
        if (options.buyerAccessToken) {
            headers.set("x-veltact-buyer-token", options.buyerAccessToken);
        }
        response = await fetch(`${API_BASE}${path}`, {
            method: options.method,
            headers,
            body: options.body === undefined ? undefined : JSON.stringify(options.body)
        });
    }
    catch {
        throw new Error("Cannot reach the Veltact API. Run `npm run dev` and open http://localhost:4000/.");
    }
    const payload = (await response.json());
    if (!response.ok) {
        throw new Error(payload.message ?? "Veltact API request failed.");
    }
    return payload;
}
function defaultApiBase() {
    if (["localhost", "127.0.0.1"].includes(window.location.hostname) &&
        window.location.port !== "4000") {
        return "http://localhost:4000/api";
    }
    return `${window.location.origin}/api`;
}
function mapNeedProfile(need, input) {
    return {
        id: need.id,
        companyName: input.companyName || "Demo buyer",
        contactName: input.contactName || undefined,
        contactEmail: input.contactEmail || "demo.buyer@example.com",
        title: need.profile.title,
        description: need.profile.description,
        category: need.profile.category,
        location: need.profile.location,
        priority: "urgent",
        requiredBy: input.requiredBy || availabilityLabel(need.profile.urgencyDays),
        budget: need.profile.budgetAud === undefined
            ? undefined
            : { amount: need.profile.budgetAud * 100, currency: "AUD" },
        mustHaves: [
            ...(input.equipmentOrTechnology.length
                ? input.equipmentOrTechnology.map((item) => `Equipment: ${item}`)
                : []),
            ...(need.profile.requiredCapabilities ?? [])
        ],
        niceToHaves: ["Comparable supplier response", "Clear availability and commercial conditions"],
        constraints: [
            need.profile.industry,
            availabilityLabel(need.profile.urgencyDays),
            ...input.constraints
        ].filter(Boolean),
        status: "submitted",
        createdAt: need.createdAt,
        updatedAt: need.createdAt
    };
}
function mapSuppliers(need) {
    if (need.suppliers?.length) {
        return need.suppliers;
    }
    return need.matches.map((match) => ({
        id: match.supplierId,
        companyName: match.supplierName || match.supplierId,
        contactEmail: `${match.supplierId}@veltact-demo.example`,
        categories: [need.profile.category],
        serviceRegions: [need.profile.location],
        capabilities: need.profile.requiredCapabilities ?? [],
        verified: false,
        createdAt: need.createdAt,
        updatedAt: need.createdAt
    }));
}
function mapMatches(need, priority, responses) {
    return need.matches
        .map((match, index) => {
        const supplier = mapSuppliers(need).find((item) => item.id === match.supplierId);
        if (!supplier) {
            throw new Error(`Missing supplier for ${match.supplierId}`);
        }
        const response = responses.find((item) => item.supplierId === match.supplierId);
        const status = response ? "responded" : "invited";
        return {
            id: `${need.id}-match-${match.supplierId}`,
            needProfileId: need.id,
            supplierId: match.supplierId,
            score: match.score,
            reasons: match.explanation,
            risks: match.score < 70 ? ["Lower confidence match; review response conditions carefully."] : [],
            status,
            createdAt: need.createdAt,
            updatedAt: response?.updatedAt ?? need.createdAt,
            supplier,
            weightedScore: weightedScore(match.score, priority, index),
            priorityReason: priorityReason(priority, match, response)
        };
    })
        .sort((left, right) => right.weightedScore - left.weightedScore);
}
function mapInvitation(invitation, index) {
    const status = invitation.status === "invited" ? "sent" : invitation.status === "viewed" ? "opened" : "responded";
    const id = invitation.id ?? `${invitation.needId}-invitation-${index + 1}`;
    return {
        id,
        needProfileId: invitation.needId,
        supplierId: invitation.supplierId,
        matchId: `${invitation.needId}-match-${invitation.supplierId}`,
        token: invitation.token,
        responseUrl: `${FRONTEND_BASE}/supplier.html?token=${encodeURIComponent(invitation.token)}`,
        status,
        sentAt: invitation.createdAt,
        expiresAt: new Date(Date.parse(invitation.createdAt) + 3 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: invitation.createdAt,
        updatedAt: invitation.respondedAt ?? invitation.viewedAt ?? invitation.createdAt
    };
}
function mapOutreachDelivery(delivery) {
    return {
        invitationId: delivery.invitationId,
        supplierId: delivery.supplierId,
        channel: delivery.channel,
        destination: delivery.destination,
        deliveryStatus: delivery.deliveryStatus,
        sentAt: delivery.sentAt,
        errorMessage: delivery.errorMessage
    };
}
function mapSupplierResponse(response, need) {
    const invitation = need.invitations.find((item) => item.supplierId === response.supplierId);
    const canHelp = response.canHelp ?? response.decision === "can_help";
    const availability = response.earliestAvailability ?? response.availability;
    const indicativePrice = response.indicativePrice ??
        (response.indicativePriceAud === undefined
            ? undefined
            : { amount: response.indicativePriceAud * 100, currency: "AUD" });
    const conditions = Array.isArray(response.conditions)
        ? response.conditions
        : response.conditions
            ? [response.conditions]
            : [];
    return {
        id: response.id,
        needProfileId: response.needId ?? response.needProfileId ?? need.id,
        supplierId: response.supplierId,
        invitationId: response.invitationId ??
            (invitation ? `${need.id}-invitation-${need.invitations.indexOf(invitation) + 1}` : response.supplierId),
        decision: canHelp ? "can_help" : "cannot_help",
        availability,
        indicativePrice,
        relevantExperience: response.relevantExperience,
        conditions,
        message: canHelp ? `${response.supplierName ?? "Supplier"} has confirmed commercial intent.` : undefined,
        status: "submitted",
        submittedAt: response.submittedAt,
        createdAt: response.submittedAt,
        updatedAt: response.submittedAt
    };
}
function mapEngagement(engagement) {
    return {
        id: engagement.id,
        needProfileId: engagement.needId,
        supplierId: engagement.supplierId,
        supplierResponseId: engagement.supplierResponseId,
        status: engagement.status,
        paymentStatus: engagement.paymentStatus,
        paymentLinkId: engagement.paymentLinkId,
        hostedCheckoutUrl: engagement.hostedCheckoutUrl,
        pinchPayerId: engagement.pinchPayerId,
        pinchPaymentId: engagement.pinchPaymentId,
        securedAt: engagement.securedAt,
        createdAt: engagement.createdAt,
        updatedAt: engagement.updatedAt
    };
}
function inferCategory(description) {
    const normalised = description.toLowerCase();
    if (normalised.includes("robot") ||
        normalised.includes("plc") ||
        normalised.includes("automation") ||
        normalised.includes("conveyor")) {
        return "Industrial automation";
    }
    return "Industrial services";
}
function inferCapabilities(description) {
    const normalised = description.toLowerCase();
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
        capabilities.add("PLC diagnostics");
    if (normalised.includes("conveyor"))
        capabilities.add("Conveyor fault recovery");
    if (normalised.includes("safety"))
        capabilities.add("Safety circuits");
    capabilities.add("Onsite support");
    return [...capabilities];
}
function urgencyDays(requiredBy) {
    const normalised = requiredBy.toLowerCase();
    if (normalised.includes("today") || normalised.includes("immediate"))
        return 1;
    if (normalised.includes("week"))
        return 7;
    return undefined;
}
function parseBudgetAmount(budgetRange) {
    const match = budgetRange.match(/(\d[\d,]*)/);
    return match ? Number(match[1].replaceAll(",", "")) : undefined;
}
function availabilityLabel(days) {
    if (!days)
        return "Availability not specified";
    if (days === 1)
        return "Required today";
    return `Required within ${days} days`;
}
function weightedScore(score, priority, index) {
    const priorityBoost = {
        speed: 4,
        technical_fit: 3,
        quality: 2,
        trust: 2,
        price: 1
    };
    return Math.max(0, Math.min(100, score + priorityBoost[priority] - index));
}
function priorityReason(priority, match, response) {
    if (response) {
        return `${match.supplierName} has responded with availability, price and conditions for comparison.`;
    }
    const labels = {
        speed: "Ranked for urgent response potential and location fit.",
        technical_fit: "Ranked for capability fit against the Need Profile.",
        quality: "Ranked for relevant industrial evidence and match strength.",
        trust: "Ranked for confidence signals in the supplier match.",
        price: "Ranked for likely commercial fit against the stated budget."
    };
    return labels[priority];
}
