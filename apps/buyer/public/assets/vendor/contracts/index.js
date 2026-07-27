import { z } from "zod";
export const needPrioritySchema = z.enum(["urgent", "soon", "planned"]);
export const buyerPrioritySchema = z.enum([
    "speed",
    "technical_fit",
    "quality",
    "trust",
    "price"
]);
export const needProfileStatusSchema = z.enum([
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
]);
export const supplierMatchStatusSchema = z.enum([
    "matched",
    "invited",
    "responded",
    "declined",
    "expired",
    "selected",
    "not_selected"
]);
export const supplierInvitationStatusSchema = z.enum([
    "pending",
    "sent",
    "opened",
    "responded",
    "expired",
    "cancelled"
]);
export const outreachChannelSchema = z.enum(["email", "sms"]);
export const outreachDeliveryStatusSchema = z.enum([
    "not_sent",
    "queued",
    "sent",
    "failed"
]);
export const supplierResponseDecisionSchema = z.enum(["can_help", "cannot_help"]);
export const supplierResponseStatusSchema = z.enum(["draft", "submitted", "withdrawn"]);
export const engagementStatusSchema = z.enum([
    "supplier_selected",
    "payment_link_created",
    "payment_pending",
    "supplier_secured",
    "payment_failed",
    "cancelled"
]);
export const paymentStatusSchema = z.enum([
    "not_started",
    "link_created",
    "awaiting_payment",
    "pending",
    "paid",
    "failed",
    "cancelled",
    "refunded"
]);
export const isoDateTimeSchema = z.string().datetime();
export const moneySchema = z.object({
    amount: z.number().int().nonnegative(),
    currency: z.string().length(3).default("AUD")
});
export const marketplaceNeedProfileSchema = z.object({
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
    problemSummary: z.string().trim().min(1).optional(),
    category: z.string().trim().min(1),
    industry: z.string().trim().min(1),
    equipmentOrTechnology: z.array(z.string().trim().min(1)).optional(),
    equipmentTechnology: z.array(z.string().trim().min(1)).optional(),
    location: z.string().trim().min(1),
    urgencyDays: z.coerce.number().int().positive().optional(),
    budgetAud: z.coerce.number().int().positive().optional(),
    constraints: z.array(z.string().trim().min(1)).optional(),
    buyerPriority: buyerPrioritySchema.optional(),
    requiredCapabilities: z.array(z.string().trim().min(1)).optional(),
    requiredCapability: z.array(z.string().trim().min(1)).optional()
});
export const needProfileSchema = z.object({
    id: z.string().min(1),
    buyerId: z.string().min(1).optional(),
    companyName: z.string().trim().min(1),
    contactName: z.string().trim().min(1).optional(),
    contactEmail: z.string().trim().email().optional(),
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
    category: z.string().trim().min(1),
    location: z.string().trim().min(1),
    priority: needPrioritySchema,
    requiredBy: z.string().trim().min(1).optional(),
    budget: moneySchema.optional(),
    mustHaves: z.array(z.string().trim().min(1)).default([]),
    niceToHaves: z.array(z.string().trim().min(1)).default([]),
    constraints: z.array(z.string().trim().min(1)).default([]),
    status: needProfileStatusSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
});
export const supplierSchema = z.object({
    id: z.string().min(1),
    companyName: z.string().trim().min(1),
    contactName: z.string().trim().min(1).optional(),
    contactEmail: z.string().trim().email(),
    categories: z.array(z.string().trim().min(1)).default([]),
    serviceRegions: z.array(z.string().trim().min(1)).default([]),
    capabilities: z.array(z.string().trim().min(1)).default([]),
    verified: z.boolean().default(false),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
});
export const supplierVerificationStatusSchema = z.enum([
    "unverified",
    "demo_verified",
    "verified"
]);
export const supplierCatalogEntrySchema = supplierSchema.extend({
    contactPhone: z.string().trim().min(1).optional(),
    industries: z.array(z.string().trim().min(1)).default([]),
    equipmentBrands: z.array(z.string().trim().min(1)).default([]),
    certifications: z.array(z.string().trim().min(1)).default([]),
    trustSignals: z.array(z.string().trim().min(1)).default([]),
    availabilityDays: z.number().int().nonnegative(),
    minimumBudgetAud: z.number().int().nonnegative(),
    maximumBudgetAud: z.number().int().positive(),
    verificationStatus: supplierVerificationStatusSchema.default("unverified"),
    verificationSource: z.string().trim().min(1).optional(),
    verifiedAt: isoDateTimeSchema.optional()
});
export const supplierMatchSchema = z.object({
    id: z.string().min(1),
    needProfileId: z.string().min(1),
    supplierId: z.string().min(1),
    score: z.number().min(0).max(100),
    reasons: z.array(z.string().trim().min(1)).min(1),
    risks: z.array(z.string().trim().min(1)).default([]),
    status: supplierMatchStatusSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
});
export const supplierInvitationSchema = z.object({
    id: z.string().min(1),
    needProfileId: z.string().min(1),
    supplierId: z.string().min(1),
    matchId: z.string().min(1),
    token: z.string().min(16),
    responseUrl: z.string().url(),
    status: supplierInvitationStatusSchema,
    sentAt: isoDateTimeSchema.optional(),
    expiresAt: isoDateTimeSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
});
export const supplierOutreachDeliverySchema = z.object({
    invitationId: z.string().min(1),
    supplierId: z.string().min(1),
    channel: outreachChannelSchema,
    destination: z.string().trim().min(1),
    deliveryStatus: outreachDeliveryStatusSchema,
    sentAt: isoDateTimeSchema.optional(),
    errorMessage: z.string().trim().min(1).optional()
});
export const supplierResponseSchema = z.object({
    id: z.string().min(1),
    needProfileId: z.string().min(1),
    supplierId: z.string().min(1),
    invitationId: z.string().min(1),
    supplierProfileId: z.string().min(1).optional(),
    decision: supplierResponseDecisionSchema,
    availability: z.string().trim().min(1).optional(),
    indicativePrice: moneySchema.optional(),
    relevantExperience: z.string().trim().min(1).optional(),
    proposedApproach: z.string().trim().min(1).optional(),
    assumptions: z.array(z.string().trim().min(1)).optional(),
    conditions: z.array(z.string().trim().min(1)).default([]),
    message: z.string().trim().min(1).optional(),
    status: supplierResponseStatusSchema,
    submittedAt: isoDateTimeSchema.optional(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
});
export const engagementSchema = z.object({
    id: z.string().min(1),
    needProfileId: z.string().min(1),
    supplierId: z.string().min(1),
    supplierResponseId: z.string().min(1),
    status: engagementStatusSchema,
    paymentStatus: paymentStatusSchema,
    paymentLinkId: z.string().min(1).optional(),
    hostedCheckoutUrl: z.string().url().optional(),
    pinchPayerId: z.string().min(1).optional(),
    pinchPaymentId: z.string().min(1).optional(),
    localDemoPaymentId: z.string().min(1).optional(),
    paymentEvidenceProvider: z.enum(["pinch", "local_demo"]).optional(),
    paymentEvidenceSource: z
        .enum(["pinch_webhook", "pinch_reconciliation", "local_demo"])
        .optional(),
    paymentEvidenceAuthoritative: z.boolean().optional(),
    securedAt: isoDateTimeSchema.optional(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
});
export const aiIntakeProfileSchema = z.object({
    title: z.string().trim().min(1),
    problemSummary: z.string().trim().min(1),
    category: z.string().trim().min(1),
    equipmentOrTechnology: z.array(z.string().trim().min(1)).default([]),
    requiredCapabilities: z.array(z.string().trim().min(1)).default([]),
    location: z.string().trim().min(1).optional(),
    urgency: z.string().trim().min(1).optional(),
    budgetRange: z.string().trim().min(1).optional(),
    certificationsOrConstraints: z.array(z.string().trim().min(1)).default([]),
    buyerPriority: buyerPrioritySchema.optional()
});
export const aiIntakeResultSchema = z.object({
    rawRequirement: z.string().trim().min(1),
    generatedProfile: aiIntakeProfileSchema,
    confidence: z.number().min(0).max(1).optional(),
    missingFields: z.array(z.string().trim().min(1)).default([])
});
export const marketplaceAuditEventSchema = z.object({
    id: z.string().min(1),
    eventType: z.string().trim().min(1),
    actorType: z.enum(["buyer", "supplier", "system", "payment_provider"]),
    actorId: z.string().trim().min(1).optional(),
    entityType: z.enum(["need", "invitation", "outreach", "response", "engagement", "payment"]),
    entityId: z.string().trim().min(1),
    occurredAt: isoDateTimeSchema,
    metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({})
});
export const rapidMatchSocketEvent = {
    joinNeedProfile: "rapidmatch:need.join",
    leaveNeedProfile: "rapidmatch:need.leave",
    matchCreated: "rapidmatch:match.created",
    researchUpdated: "rapidmatch:research.updated",
    solutionDecisionUpdated: "rapidmatch:solution_decision.updated",
    supplierDiscoveryUpdated: "rapidmatch:supplier.discovery_updated",
    invitationSent: "rapidmatch:invitation.sent",
    outreachDeliveryUpdated: "rapidmatch:outreach.delivery_updated",
    aiIntakeStructured: "rapidmatch:ai_intake.structured",
    supplierResponseSubmitted: "rapidmatch:response.submitted",
    supplierSelected: "rapidmatch:supplier.selected",
    paymentStatusUpdated: "rapidmatch:payment.status_updated",
    engagementSecured: "rapidmatch:engagement.secured",
    deploymentUpdated: "rapidmatch:deployment.updated"
};
export const evidenceProviderSchema = z.enum([
    "openai_web_search",
    "firecrawl",
    "fixture",
    "manual"
]);
export const evidenceSourceTypeSchema = z.enum([
    "manufacturer",
    "integrator",
    "standards",
    "industry_publication",
    "supplier_website",
    "directory",
    "other"
]);
export const researchCitationSchema = z.object({
    id: z.string().min(1),
    title: z.string().trim().min(1),
    url: z.string().url(),
    sourceType: evidenceSourceTypeSchema,
    provider: evidenceProviderSchema,
    evidenceNote: z.string().trim().min(1),
    publishedAt: isoDateTimeSchema.optional(),
    accessedAt: isoDateTimeSchema
});
export const solutionApproachSchema = z.object({
    id: z.string().min(1),
    needProfileId: z.string().min(1),
    title: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    rationale: z.string().trim().min(1),
    localActions: z.array(z.string().trim().min(1)).default([]),
    outsourceTriggers: z.array(z.string().trim().min(1)).min(1),
    requiredCapabilities: z.array(z.string().trim().min(1)).min(1),
    risks: z.array(z.string().trim().min(1)).default([]),
    confidence: z.number().min(0).max(1),
    citationIds: z.array(z.string().min(1)).min(1)
});
export const solutionResearchResultSchema = z.object({
    id: z.string().min(1),
    needProfileId: z.string().min(1),
    sourceMode: z.enum(["live", "fixture"]),
    overview: z.string().trim().min(1),
    approaches: z.array(solutionApproachSchema).min(1),
    citations: z.array(researchCitationSchema).min(1),
    missingInformation: z.array(z.string().trim().min(1)).default([]),
    safetyNotice: z.string().trim().min(1),
    generatedAt: isoDateTimeSchema
});
export const solutionDecisionTypeSchema = z.enum([
    "local_trial",
    "outsource",
    "hybrid"
]);
export const solutionDecisionSchema = z.object({
    id: z.string().min(1),
    needProfileId: z.string().min(1),
    researchResultId: z.string().min(1),
    decision: solutionDecisionTypeSchema,
    selectedApproachIds: z.array(z.string().min(1)).min(1),
    buyerNote: z.string().trim().min(1).optional(),
    approvedBy: z.string().trim().min(1),
    approvedAt: isoDateTimeSchema
});
export const supplierLifecycleStatusSchema = z.enum([
    "discovered",
    "approved_for_outreach",
    "invited",
    "claimed",
    "supplier_profile_approved",
    "buyer_approved",
    "active_supplier",
    "declined",
    "archived"
]);
export const supplierLeadSchema = z.object({
    id: z.string().min(1),
    needProfileId: z.string().min(1),
    companyName: z.string().trim().min(1),
    website: z.string().url(),
    contactName: z.string().trim().min(1).optional(),
    contactEmail: z.string().trim().email().optional(),
    contactPhone: z.string().trim().min(1).optional(),
    location: z.string().trim().min(1),
    serviceRegions: z.array(z.string().trim().min(1)).default([]),
    capabilities: z.array(z.string().trim().min(1)).min(1),
    matchScore: z.number().min(0).max(100),
    matchReasons: z.array(z.string().trim().min(1)).min(1),
    risks: z.array(z.string().trim().min(1)).default([]),
    evidence: z.array(researchCitationSchema).min(1),
    sourceMode: z.enum(["live", "fixture"]),
    lifecycleStatus: supplierLifecycleStatusSchema,
    approvedForOutreachAt: isoDateTimeSchema.optional(),
    invitedAt: isoDateTimeSchema.optional(),
    claimedAt: isoDateTimeSchema.optional(),
    activatedSupplierId: z.string().min(1).optional(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
});
export const supplierClaimStatusSchema = z.enum([
    "pending",
    "claimed",
    "expired",
    "revoked"
]);
export const supplierClaimSchema = z.object({
    id: z.string().min(1),
    supplierLeadId: z.string().min(1),
    invitationId: z.string().min(1),
    token: z.string().min(16),
    status: supplierClaimStatusSchema,
    claimantName: z.string().trim().min(1).optional(),
    claimantEmail: z.string().trim().email().optional(),
    claimedAt: isoDateTimeSchema.optional(),
    expiresAt: isoDateTimeSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
});
export const supplierProfileSchema = z.object({
    id: z.string().min(1),
    supplierLeadId: z.string().min(1),
    companyName: z.string().trim().min(1),
    website: z.string().url(),
    contactName: z.string().trim().min(1),
    contactEmail: z.string().trim().email(),
    contactPhone: z.string().trim().min(1).optional(),
    location: z.string().trim().min(1),
    categories: z.array(z.string().trim().min(1)).min(1),
    industries: z.array(z.string().trim().min(1)).min(1),
    serviceRegions: z.array(z.string().trim().min(1)).min(1),
    capabilities: z.array(z.string().trim().min(1)).min(1),
    certifications: z.array(z.string().trim().min(1)).default([]),
    profileSummary: z.string().trim().min(1),
    sourceDisclosure: z.string().trim().min(1),
    supplierApprovedAt: isoDateTimeSchema.optional(),
    buyerApprovedAt: isoDateTimeSchema.optional(),
    activeAt: isoDateTimeSchema.optional(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
});
const supplierCommercialResponseBaseSchema = z.object({
    id: z.string().min(1),
    needProfileId: z.string().min(1),
    supplierLeadId: z.string().min(1),
    assumptions: z.array(z.string().trim().min(1)).default([]),
    conditions: z.array(z.string().trim().min(1)).default([]),
    submittedAt: isoDateTimeSchema
});
const canHelpCommercialResponseSchema = supplierCommercialResponseBaseSchema.extend({
    supplierProfileId: z.string().min(1),
    decision: z.literal("can_help"),
    availability: z.string().trim().min(1),
    indicativePrice: moneySchema.extend({
        amount: z.number().int().positive()
    }),
    proposedApproach: z.string().trim().min(1),
    relevantExperience: z.string().trim().min(1)
});
const cannotHelpCommercialResponseSchema = supplierCommercialResponseBaseSchema.extend({
    supplierProfileId: z.string().min(1).optional(),
    decision: z.literal("cannot_help"),
    availability: z.string().trim().min(1).optional(),
    indicativePrice: moneySchema.optional(),
    proposedApproach: z.string().trim().min(1).optional(),
    relevantExperience: z.string().trim().min(1).optional(),
    declineReason: z.string().trim().min(1).optional()
});
export const supplierCommercialResponseSchema = z.discriminatedUnion("decision", [canHelpCommercialResponseSchema, cannotHelpCommercialResponseSchema]);
export const projectTemplateTypeSchema = z.enum([
    "urgent_plc_recovery",
    "planned_robotic_arm_integration"
]);
export const projectStatusSchema = z.enum([
    "planning",
    "awaiting_supplier",
    "active",
    "at_risk",
    "completed",
    "cancelled"
]);
export const projectMilestoneStatusSchema = z.enum([
    "draft",
    "awaiting_payment",
    "funded",
    "in_progress",
    "awaiting_acceptance",
    "accepted",
    "payment_failed",
    "cancelled"
]);
export const projectTaskStatusSchema = z.enum([
    "not_started",
    "in_progress",
    "blocked",
    "completed"
]);
export const acceptanceCriterionSchema = z.object({
    id: z.string().min(1),
    description: z.string().trim().min(1),
    accepted: z.boolean().default(false),
    acceptedAt: isoDateTimeSchema.optional(),
    evidenceNote: z.string().trim().min(1).optional()
});
export const projectMilestoneSchema = z.object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    sequence: z.number().int().positive(),
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
    amount: moneySchema,
    plannedStart: z.string().date().optional(),
    plannedEnd: z.string().date().optional(),
    dependencyIds: z.array(z.string().min(1)).default([]),
    acceptanceCriteria: z.array(acceptanceCriterionSchema).min(1),
    status: projectMilestoneStatusSchema,
    paymentStatus: paymentStatusSchema,
    paymentLinkId: z.string().min(1).optional(),
    hostedCheckoutUrl: z.string().url().optional(),
    pinchPayerId: z.string().min(1).optional(),
    pinchPaymentId: z.string().min(1).optional(),
    fundedAt: isoDateTimeSchema.optional(),
    acceptedAt: isoDateTimeSchema.optional(),
    updatedAt: isoDateTimeSchema
});
export const projectTaskSchema = z.object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    milestoneId: z.string().min(1),
    title: z.string().trim().min(1),
    owner: z.string().trim().min(1),
    status: projectTaskStatusSchema,
    dependencyIds: z.array(z.string().min(1)).default([]),
    dueDate: z.string().date().optional(),
    updatedAt: isoDateTimeSchema
});
export const projectActivitySchema = z.object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    eventType: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    actor: z.string().trim().min(1),
    occurredAt: isoDateTimeSchema
});
export const projectRiskSchema = z.object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    title: z.string().trim().min(1),
    impact: z.enum(["low", "medium", "high"]),
    mitigation: z.string().trim().min(1),
    status: z.enum(["open", "mitigated", "closed"]),
    updatedAt: isoDateTimeSchema
});
export const projectIssueSchema = z.object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    title: z.string().trim().min(1),
    owner: z.string().trim().min(1),
    status: z.enum(["open", "in_progress", "resolved"]),
    resolution: z.string().trim().min(1).optional(),
    updatedAt: isoDateTimeSchema
});
export const projectApprovalSchema = z.object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    milestoneId: z.string().min(1).optional(),
    title: z.string().trim().min(1),
    status: z.enum(["requested", "approved", "rejected"]),
    requestedBy: z.string().trim().min(1),
    decidedBy: z.string().trim().min(1).optional(),
    decidedAt: isoDateTimeSchema.optional(),
    updatedAt: isoDateTimeSchema
});
export const projectDocumentSchema = z.object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    title: z.string().trim().min(1),
    documentType: z.string().trim().min(1),
    url: z.string().url(),
    provenance: z.enum(["buyer", "supplier", "veltact_fixture"]),
    addedAt: isoDateTimeSchema
});
export const projectChangeRequestSchema = z.object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
    impact: z.string().trim().min(1),
    status: z.enum(["draft", "submitted", "approved", "rejected"]),
    requestedBy: z.string().trim().min(1),
    approvedBy: z.string().trim().min(1).optional(),
    updatedAt: isoDateTimeSchema
});
export const projectContactSchema = z.object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    name: z.string().trim().min(1),
    role: z.string().trim().min(1),
    organisation: z.string().trim().min(1),
    email: z.string().trim().email(),
    phone: z.string().trim().min(1).optional()
});
const paymentEvidenceBaseSchema = z.object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    milestoneId: z.string().min(1),
    eventId: z.string().min(1),
    eventType: z.string().trim().min(1),
    paymentStatus: paymentStatusSchema,
    receivedAt: isoDateTimeSchema,
    metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({})
});
export const paymentEvidenceSchema = z.discriminatedUnion("provider", [
    paymentEvidenceBaseSchema.extend({
        provider: z.literal("pinch"),
        authoritative: z.literal(true)
    }),
    paymentEvidenceBaseSchema.extend({
        provider: z.literal("local_demo"),
        authoritative: z.literal(false)
    })
]);
export const industrialProjectSchema = z.object({
    id: z.string().min(1),
    needProfileId: z.string().min(1),
    supplierLeadId: z.string().min(1),
    supplierProfileId: z.string().min(1),
    supplierName: z.string().trim().min(1),
    templateType: projectTemplateTypeSchema,
    title: z.string().trim().min(1),
    objective: z.string().trim().min(1),
    siteLocation: z.string().trim().min(1),
    status: projectStatusSchema,
    targetCompletion: z.string().date().optional(),
    milestones: z.array(projectMilestoneSchema).min(1),
    tasks: z.array(projectTaskSchema).min(1),
    contacts: z.array(projectContactSchema).min(1),
    activities: z.array(projectActivitySchema).default([]),
    risks: z.array(projectRiskSchema).default([]),
    issues: z.array(projectIssueSchema).default([]),
    approvals: z.array(projectApprovalSchema).default([]),
    documents: z.array(projectDocumentSchema).default([]),
    changeRequests: z.array(projectChangeRequestSchema).default([]),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
});
export const veltactV2SocketEvent = {
    joinNeed: "veltact:v2:need.join",
    leaveNeed: "veltact:v2:need.leave",
    researchUpdated: "veltact:v2:research.updated",
    discoveryUpdated: "veltact:v2:discovery.updated",
    supplierLifecycleUpdated: "veltact:v2:supplier.lifecycle_updated",
    supplierResponseSubmitted: "veltact:v2:supplier.response_submitted",
    projectUpdated: "veltact:v2:project.updated",
    milestonePaymentUpdated: "veltact:v2:milestone.payment_updated"
};
export const aiIntakeEvidenceKindSchema = z.enum(["written", "pdf", "photo"]);
export const aiIntakeEvidenceSchema = z.object({
    kind: aiIntakeEvidenceKindSchema,
    name: z.string().trim().min(1),
    mimeType: z.string().trim().min(1).optional(),
    extractedText: z.string().trim().optional(),
    dataUrl: z.string().trim().startsWith("data:").max(5_600_000).optional()
});
export const intakeEvidenceStatusSchema = z.enum([
    "provided",
    "processed",
    "failed"
]);
export const intakeEvidenceSummarySchema = z.object({
    kind: aiIntakeEvidenceKindSchema,
    name: z.string().trim().min(1),
    mimeType: z.string().trim().min(1).optional(),
    source: z.enum(["buyer", "demo_fixture"]),
    status: intakeEvidenceStatusSchema,
    errorMessage: z.string().trim().min(1).optional()
});
export const rapidMatchJourneyPhaseSchema = z.enum([
    "find",
    "connect",
    "deploy"
]);
export const rapidMatchJourneyStatusSchema = z.enum([
    "intake",
    "need_profile_review",
    "solution_review",
    "internal_plan_ready",
    "supplier_matching",
    "supplier_outreach",
    "supplier_responses",
    "supplier_selection",
    "commitment_pending",
    "supplier_secured",
    "delivery_active",
    "delivery_complete"
]);
export const rapidMatchNextActionSchema = z.enum([
    "analyse_requirement",
    "confirm_need_profile",
    "use_plan_internally",
    "find_specialist",
    "approve_outreach",
    "send_invitations",
    "await_responses",
    "compare_responses",
    "select_supplier",
    "open_pinch_checkout",
    "await_payment_confirmation",
    "track_delivery",
    "none"
]);
export const deploymentMilestoneStatusSchema = z.enum([
    "not_started",
    "awaiting_payment",
    "funded",
    "in_progress",
    "completed"
]);
export const deploymentMilestoneSummarySchema = z.object({
    id: z.string().min(1),
    engagementId: z.string().min(1),
    sequence: z.number().int().positive(),
    title: z.string().trim().min(1),
    amount: moneySchema.optional(),
    status: deploymentMilestoneStatusSchema,
    paymentStatus: paymentStatusSchema,
    progressPercentage: z.number().int().min(0).max(100),
    latestUpdate: z.string().trim().min(1).optional(),
    updatedAt: isoDateTimeSchema
});
export const deploymentSummarySchema = z.object({
    engagementId: z.string().min(1),
    title: z.string().trim().min(1),
    status: z.enum(["not_started", "commitment_pending", "active", "completed"]),
    progressPercentage: z.number().int().min(0).max(100),
    currentMilestoneId: z.string().min(1).optional(),
    nextMilestoneId: z.string().min(1).optional(),
    milestones: z.array(deploymentMilestoneSummarySchema).min(1).max(4),
    latestUpdate: z.string().trim().min(1).optional(),
    updatedAt: isoDateTimeSchema
});
export const rapidMatchBuyerWorkspaceSchema = z.object({
    phase: rapidMatchJourneyPhaseSchema,
    status: rapidMatchJourneyStatusSchema,
    nextAction: rapidMatchNextActionSchema,
    needProfile: needProfileSchema.optional(),
    intakeEvidence: z.array(intakeEvidenceSummarySchema).default([]),
    researchResult: solutionResearchResultSchema.optional(),
    solutionDecision: solutionDecisionSchema.optional(),
    discoveredSuppliers: z.array(supplierLeadSchema).default([]),
    suppliers: z.array(supplierSchema).default([]),
    matches: z.array(supplierMatchSchema).default([]),
    invitations: z.array(supplierInvitationSchema).default([]),
    outreachDeliveries: z.array(supplierOutreachDeliverySchema).default([]),
    responses: z.array(supplierResponseSchema).default([]),
    engagement: engagementSchema.optional(),
    deployment: deploymentSummarySchema.optional()
});
export const rapidMatchApiRoute = {
    structureRequirement: "/api/ai-intake/structure",
    createNeedProfile: "/api/need-profiles",
    needWorkspace: "/api/need-profiles/:needProfileId",
    research: "/api/need-profiles/:needProfileId/research",
    solutionDecision: "/api/need-profiles/:needProfileId/solution-decision",
    discoverSuppliers: "/api/need-profiles/:needProfileId/suppliers/discover",
    sendInvitations: "/api/need-profiles/:needProfileId/invitations/send",
    responses: "/api/need-profiles/:needProfileId/responses",
    createEngagement: "/api/need-profiles/:needProfileId/engagements",
    engagement: "/api/engagements/:engagementId",
    paymentLink: "/api/engagements/:engagementId/payment-link",
    deployment: "/api/engagements/:engagementId/deployment",
    deploymentMilestone: "/api/engagements/:engagementId/deployment/milestones/:milestoneId",
    supplierInvitation: "/api/supplier-invitations/:token",
    supplierClaim: "/api/supplier-invitations/:token/claim",
    supplierResponse: "/api/supplier-invitations/:token/responses",
    demoReset: "/api/demo/reset"
};
//# sourceMappingURL=index.js.map