export const demoCommercialFillAction = "fill-demo-commercial-response";
export function emptySupplierCommercialDraft() {
    return {
        source: "blank",
        availability: "",
        indicativePriceAud: "",
        relevantExperience: "",
        proposedApproach: "",
        assumptions: "",
        conditions: ""
    };
}
export function demoCommercialDraftForAction(action, demoControlsAvailable, robotics) {
    if (action !== demoCommercialFillAction ||
        demoControlsAvailable !== true) {
        return undefined;
    }
    return robotics
        ? {
            source: "demo_fixture",
            availability: "Discovery workshop within five business days",
            indicativePriceAud: "78000",
            relevantExperience: "Comparable robotic cell feasibility, tooling, safety and commissioning delivery.",
            proposedApproach: "Validate the process and safety concept, prove the highest-risk handling assumptions, then deliver design, build, factory acceptance, commissioning and handover as separately accepted milestones.",
            assumptions: "Representative products available, site services and access window to be confirmed",
            conditions: "Final equipment selection subject to feasibility and machinery risk assessment"
        }
        : {
            source: "demo_fixture",
            availability: "Site review within four hours",
            indicativePriceAud: "6500",
            relevantExperience: "Comparable industrial controls and packaging-line recovery.",
            proposedApproach: "Review the supplied evidence, verify scope and safety controls, then execute the buyer-approved recovery plan with milestone acceptance evidence.",
            assumptions: "Site representative available, access window confirmed",
            conditions: "Work subject to site isolation and permit procedures"
        };
}
