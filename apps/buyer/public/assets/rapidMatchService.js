const now = new Date("2026-07-25T01:10:00.000Z").toISOString();
const later = new Date("2026-07-25T01:14:00.000Z").toISOString();
const suppliers = [
    {
        id: "sup-kinetic-controls",
        companyName: "Kinetic Controls",
        contactName: "Maya Patel",
        contactEmail: "maya@kinetic-controls.example",
        categories: ["Industrial automation", "PLC retrofit", "Control panels"],
        serviceRegions: ["NSW", "VIC", "QLD"],
        capabilities: ["PLC migration", "24-hour site callout", "Safety interlocks", "SCADA integration"],
        verified: true,
        createdAt: now,
        updatedAt: now
    },
    {
        id: "sup-axis-industrial",
        companyName: "Axis Industrial Systems",
        contactName: "Jordan Lee",
        contactEmail: "jordan@axis-industrial.example",
        categories: ["Industrial automation", "Packaging lines", "Commissioning"],
        serviceRegions: ["NSW", "SA"],
        capabilities: ["Servo tuning", "Production line commissioning", "Preventive maintenance", "Documentation"],
        verified: true,
        createdAt: now,
        updatedAt: now
    },
    {
        id: "sup-northstar-engineering",
        companyName: "Northstar Engineering",
        contactName: "Amelia Wong",
        contactEmail: "amelia@northstar-eng.example",
        categories: ["Mechanical fabrication", "Industrial automation", "Reliability"],
        serviceRegions: ["NSW", "ACT"],
        capabilities: ["Machine guarding", "Root cause analysis", "Food-grade fabrication", "Emergency repair"],
        verified: false,
        createdAt: now,
        updatedAt: now
    }
];
const baseMatches = [
    {
        id: "match-kinetic",
        needProfileId: "need-demo",
        supplierId: "sup-kinetic-controls",
        score: 94,
        reasons: [
            "Strong PLC migration and safety interlock capability for automation faults.",
            "Verified supplier with 24-hour site callout coverage in NSW.",
            "Best availability for urgent production recovery."
        ],
        risks: ["Premium emergency rates apply after hours."],
        status: "responded",
        createdAt: now,
        updatedAt: later
    },
    {
        id: "match-axis",
        needProfileId: "need-demo",
        supplierId: "sup-axis-industrial",
        score: 87,
        reasons: [
            "Deep experience commissioning packaging and material handling lines.",
            "Competitive price signal and strong documentation practices.",
            "Verified supplier with relevant servo tuning capability."
        ],
        risks: ["Earliest site visit is the next business morning."],
        status: "responded",
        createdAt: now,
        updatedAt: later
    },
    {
        id: "match-northstar",
        needProfileId: "need-demo",
        supplierId: "sup-northstar-engineering",
        score: 78,
        reasons: [
            "Good fit where mechanical guarding or emergency fabrication is part of the fault.",
            "Local NSW coverage with reliability engineering background."
        ],
        risks: ["Trust score is lower until Veltact verification completes."],
        status: "declined",
        createdAt: now,
        updatedAt: later
    }
];
const invitations = [
    {
        id: "invite-kinetic",
        needProfileId: "need-demo",
        supplierId: "sup-kinetic-controls",
        matchId: "match-kinetic",
        token: "kinetic-controls-demo-token-2026",
        responseUrl: "https://demo.veltact.com/supplier-invitations/kinetic-controls-demo-token-2026",
        status: "responded",
        sentAt: now,
        expiresAt: "2026-07-28T01:10:00.000Z",
        createdAt: now,
        updatedAt: later
    },
    {
        id: "invite-axis",
        needProfileId: "need-demo",
        supplierId: "sup-axis-industrial",
        matchId: "match-axis",
        token: "axis-industrial-demo-token-2026",
        responseUrl: "https://demo.veltact.com/supplier-invitations/axis-industrial-demo-token-2026",
        status: "responded",
        sentAt: now,
        expiresAt: "2026-07-28T01:10:00.000Z",
        createdAt: now,
        updatedAt: later
    },
    {
        id: "invite-northstar",
        needProfileId: "need-demo",
        supplierId: "sup-northstar-engineering",
        matchId: "match-northstar",
        token: "northstar-engineering-demo-token-2026",
        responseUrl: "https://demo.veltact.com/supplier-invitations/northstar-engineering-demo-token-2026",
        status: "sent",
        sentAt: now,
        expiresAt: "2026-07-28T01:10:00.000Z",
        createdAt: now,
        updatedAt: now
    }
];
const responses = [
    {
        id: "response-kinetic",
        needProfileId: "need-demo",
        supplierId: "sup-kinetic-controls",
        invitationId: "invite-kinetic",
        decision: "can_help",
        availability: "Engineer can be onsite within 6 hours.",
        indicativePrice: { amount: 168000, currency: "AUD" },
        relevantExperience: "Recovered three failed Siemens PLC-controlled conveyor cells for food and beverage sites this quarter.",
        conditions: ["Requires safe access to main panel", "Buyer to provide latest electrical drawings if available"],
        message: "We can start diagnostics today and carry common PLC and safety relay spares.",
        status: "submitted",
        submittedAt: "2026-07-25T01:13:00.000Z",
        createdAt: now,
        updatedAt: later
    },
    {
        id: "response-axis",
        needProfileId: "need-demo",
        supplierId: "sup-axis-industrial",
        invitationId: "invite-axis",
        decision: "can_help",
        availability: "Remote triage today, onsite tomorrow morning.",
        indicativePrice: { amount: 124000, currency: "AUD" },
        relevantExperience: "Commissioned similar packaging conveyors and servo drives for two NSW manufacturing plants.",
        conditions: ["Remote access preferred for first diagnostic pass", "Parts charged at cost if replacement is required"],
        message: "Best value option if the line can tolerate overnight onsite attendance.",
        status: "submitted",
        submittedAt: "2026-07-25T01:14:00.000Z",
        createdAt: now,
        updatedAt: later
    }
];
const delay = (ms = 450) => new Promise((resolve) => window.setTimeout(resolve, ms));
export class RapidMatchService {
    async createNeedProfile(input) {
        await delay();
        return {
            id: "need-demo",
            companyName: input.companyName,
            contactName: input.contactName,
            contactEmail: input.contactEmail,
            title: input.title,
            description: input.description,
            category: input.category,
            location: input.location,
            priority: "urgent",
            requiredBy: input.requiredBy,
            budget: { amount: input.budgetAmount * 100, currency: "AUD" },
            mustHaves: ["Restore production safely", "PLC and safety circuit diagnostics", "NSW onsite coverage"],
            niceToHaves: ["Carry common spares", "Remote triage before dispatch"],
            constraints: ["Food-grade production environment", "Minimal line downtime", "Work outside shift changeover"],
            status: "submitted",
            createdAt: now,
            updatedAt: now
        };
    }
    async submitPriority(needProfile, priority) {
        await delay();
        return {
            needProfile: { ...needProfile, status: "selection_ready", updatedAt: later },
            suppliers,
            matches: rankMatches(priority),
            invitations,
            responses
        };
    }
    async selectSupplier(workspace, supplierResponseId) {
        await delay();
        const selectedResponse = workspace.responses.find((response) => response.id === supplierResponseId);
        if (!selectedResponse) {
            throw new Error("Select a supplier response before creating the engagement.");
        }
        const engagement = {
            id: "engagement-demo",
            needProfileId: workspace.needProfile.id,
            supplierId: selectedResponse.supplierId,
            supplierResponseId: selectedResponse.id,
            status: "supplier_selected",
            paymentStatus: "not_started",
            createdAt: later,
            updatedAt: later
        };
        return {
            ...workspace,
            needProfile: { ...workspace.needProfile, status: "selected", updatedAt: later },
            engagement
        };
    }
    async createPaymentLink(workspace) {
        await delay();
        if (!workspace.engagement) {
            throw new Error("Create an engagement before starting payment.");
        }
        const engagement = {
            ...workspace.engagement,
            status: "payment_link_created",
            paymentStatus: "link_created",
            paymentLinkId: "pinch-link-demo",
            hostedCheckoutUrl: "https://sandbox.getpinch.com.au/checkout/veltact-demo",
            updatedAt: new Date("2026-07-25T01:16:00.000Z").toISOString()
        };
        return {
            ...workspace,
            needProfile: { ...workspace.needProfile, status: "payment_pending", updatedAt: engagement.updatedAt },
            engagement,
            hostedCheckoutUrl: engagement.hostedCheckoutUrl
        };
    }
    async confirmSupplierSecured(workspace) {
        await delay(700);
        if (!workspace.engagement) {
            throw new Error("Payment cannot be confirmed without an engagement.");
        }
        const securedAt = new Date("2026-07-25T01:18:00.000Z").toISOString();
        return {
            ...workspace,
            needProfile: { ...workspace.needProfile, status: "secured", updatedAt: securedAt },
            engagement: {
                ...workspace.engagement,
                status: "supplier_secured",
                paymentStatus: "paid",
                pinchPaymentId: "pinch-payment-demo",
                securedAt,
                updatedAt: securedAt
            }
        };
    }
}
function rankMatches(priority) {
    const weights = {
        speed: { "sup-kinetic-controls": 7, "sup-axis-industrial": -2, "sup-northstar-engineering": 0 },
        technical_fit: { "sup-kinetic-controls": 4, "sup-axis-industrial": 5, "sup-northstar-engineering": 1 },
        quality: { "sup-kinetic-controls": 3, "sup-axis-industrial": 4, "sup-northstar-engineering": 2 },
        trust: { "sup-kinetic-controls": 5, "sup-axis-industrial": 4, "sup-northstar-engineering": -6 },
        price: { "sup-kinetic-controls": -4, "sup-axis-industrial": 8, "sup-northstar-engineering": 2 }
    };
    const reasons = {
        speed: {
            "sup-kinetic-controls": "Ranked first because same-day onsite recovery is the strongest speed signal.",
            "sup-axis-industrial": "Lower speed rank because onsite attendance starts tomorrow.",
            "sup-northstar-engineering": "Held back because automation response is less certain."
        },
        technical_fit: {
            "sup-kinetic-controls": "PLC, safety and SCADA coverage map tightly to the Need Profile.",
            "sup-axis-industrial": "Strongest production-line commissioning evidence.",
            "sup-northstar-engineering": "Useful mechanical coverage, but narrower automation depth."
        },
        quality: {
            "sup-kinetic-controls": "High confidence from recent recovery work and spares readiness.",
            "sup-axis-industrial": "Strong documentation and commissioning process.",
            "sup-northstar-engineering": "Quality signal depends on whether mechanical fault scope expands."
        },
        trust: {
            "sup-kinetic-controls": "Verified supplier with named accountable contact.",
            "sup-axis-industrial": "Verified supplier and transparent response conditions.",
            "sup-northstar-engineering": "Verification is still pending."
        },
        price: {
            "sup-kinetic-controls": "Emergency response premium increases expected cost.",
            "sup-axis-industrial": "Best submitted price among suppliers who can help.",
            "sup-northstar-engineering": "No price submitted yet, so pricing confidence remains low."
        }
    };
    return baseMatches
        .map((match) => {
        const supplier = suppliers.find((item) => item.id === match.supplierId);
        if (!supplier) {
            throw new Error(`Missing supplier fixture for ${match.supplierId}`);
        }
        return {
            ...match,
            supplier,
            weightedScore: Math.max(0, Math.min(100, match.score + weights[priority][match.supplierId])),
            priorityReason: reasons[priority][match.supplierId]
        };
    })
        .sort((left, right) => right.weightedScore - left.weightedScore);
}
