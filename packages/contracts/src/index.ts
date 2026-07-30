import { z } from "zod";

export {
  detectIntakeBudget,
  detectIntakeCapabilities,
  detectIntakeEquipment,
  detectIntakeLocation,
  detectIntakeUrgency,
  intakeCategoryFromEquipment,
  intakeTitleFromRequirement,
  isIntakeRecoveryRequirement,
  isIntakeUrgent,
  parseIntakeBudgetAmount,
  truncateIntakeTitle
} from "./intakeExtraction.js";

export const needPrioritySchema = z.enum(["urgent", "soon", "planned"]);
export type NeedPriority = z.infer<typeof needPrioritySchema>;

export const buyerPrioritySchema = z.enum([
  "speed",
  "technical_fit",
  "quality",
  "trust",
  "price"
]);
export type BuyerPriority = z.infer<typeof buyerPrioritySchema>;

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
export type NeedProfileStatus = z.infer<typeof needProfileStatusSchema>;

export const supplierMatchStatusSchema = z.enum([
  "matched",
  "invited",
  "responded",
  "declined",
  "expired",
  "selected",
  "not_selected"
]);
export type SupplierMatchStatus = z.infer<typeof supplierMatchStatusSchema>;

export const supplierInvitationStatusSchema = z.enum([
  "pending",
  "sent",
  "opened",
  "responded",
  "expired",
  "cancelled"
]);
export type SupplierInvitationStatus = z.infer<typeof supplierInvitationStatusSchema>;

export const outreachChannelSchema = z.enum(["email", "sms"]);
export type OutreachChannel = z.infer<typeof outreachChannelSchema>;

export const outreachDeliveryStatusSchema = z.enum([
  "not_sent",
  "queued",
  "sent",
  "failed"
]);
export type OutreachDeliveryStatus = z.infer<typeof outreachDeliveryStatusSchema>;

export const supplierResponseDecisionSchema = z.enum(["can_help", "cannot_help"]);
export type SupplierResponseDecision = z.infer<typeof supplierResponseDecisionSchema>;

export const supplierResponseStatusSchema = z.enum(["draft", "submitted", "withdrawn"]);
export type SupplierResponseStatus = z.infer<typeof supplierResponseStatusSchema>;

export const engagementStatusSchema = z.enum([
  "supplier_selected",
  "payment_link_created",
  "payment_pending",
  "supplier_secured",
  "payment_failed",
  "cancelled"
]);
export type EngagementStatus = z.infer<typeof engagementStatusSchema>;

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
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const isoDateTimeSchema = z.string().datetime();

export const moneySchema = z.object({
  amount: z.number().int().nonnegative(),
  currency: z.string().length(3).default("AUD")
});
export type Money = z.infer<typeof moneySchema>;

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
export type MarketplaceNeedProfile = z.infer<typeof marketplaceNeedProfileSchema>;

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
export type NeedProfile = z.infer<typeof needProfileSchema>;

export const supplierSchema = z.object({
  id: z.string().min(1),
  companyName: z.string().trim().min(1),
  logoUrl: z.string().url().optional(),
  contactName: z.string().trim().min(1).optional(),
  contactEmail: z.string().trim().email(),
  categories: z.array(z.string().trim().min(1)).default([]),
  serviceRegions: z.array(z.string().trim().min(1)).default([]),
  capabilities: z.array(z.string().trim().min(1)).default([]),
  verified: z.boolean().default(false),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});
export type Supplier = z.infer<typeof supplierSchema>;

export const supplierVerificationStatusSchema = z.enum([
  "unverified",
  "demo_verified",
  "verified"
]);
export type SupplierVerificationStatus = z.infer<typeof supplierVerificationStatusSchema>;

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
export type SupplierCatalogEntry = z.infer<typeof supplierCatalogEntrySchema>;

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
export type SupplierMatch = z.infer<typeof supplierMatchSchema>;

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
export type SupplierInvitation = z.infer<typeof supplierInvitationSchema>;

export const supplierOutreachDeliverySchema = z.object({
  invitationId: z.string().min(1),
  supplierId: z.string().min(1),
  channel: outreachChannelSchema,
  destination: z.string().trim().min(1),
  deliveryStatus: outreachDeliveryStatusSchema,
  sentAt: isoDateTimeSchema.optional(),
  errorMessage: z.string().trim().min(1).optional()
});
export type SupplierOutreachDelivery = z.infer<typeof supplierOutreachDeliverySchema>;

export const sendSupplierInvitationsRequestSchema = z.object({
  supplierLeadIds: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(10)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "supplierLeadIds must be unique"
    })
    .optional(),
  deliveryChannels: z
    .array(outreachChannelSchema)
    .max(2)
    .refine((channels) => new Set(channels).size === channels.length, {
      message: "deliveryChannels must be unique"
    })
    .optional()
});
export type SendSupplierInvitationsRequest = z.infer<
  typeof sendSupplierInvitationsRequestSchema
>;

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
export type SupplierResponse = z.infer<typeof supplierResponseSchema>;

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
export type Engagement = z.infer<typeof engagementSchema>;

export const supplierCommitmentNotificationSchema = z.object({
  id: z.string().min(1),
  engagementId: z.string().min(1),
  supplierId: z.string().min(1),
  notificationType: z.literal("commitment_confirmed"),
  channel: z.literal("email"),
  destination: z.string().trim().email(),
  deliveryStatus: outreachDeliveryStatusSchema,
  sentAt: isoDateTimeSchema.optional(),
  errorMessage: z.string().trim().min(1).optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});
export type SupplierCommitmentNotification = z.infer<
  typeof supplierCommitmentNotificationSchema
>;

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
export type AiIntakeProfile = z.infer<typeof aiIntakeProfileSchema>;

export const aiIntakeResultSchema = z.object({
  rawRequirement: z.string().trim().min(1),
  generatedProfile: aiIntakeProfileSchema,
  confidence: z.number().min(0).max(1).optional(),
  missingFields: z.array(z.string().trim().min(1)).default([])
});
export type AiIntakeResult = z.infer<typeof aiIntakeResultSchema>;

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
export type MarketplaceAuditEvent = z.infer<typeof marketplaceAuditEventSchema>;

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
  commitmentNotificationUpdated:
    "rapidmatch:commitment.notification_updated",
  deploymentUpdated: "rapidmatch:deployment.updated"
} as const;

export type RapidMatchSocketEvent =
  (typeof rapidMatchSocketEvent)[keyof typeof rapidMatchSocketEvent];

export const evidenceProviderSchema = z.enum([
  "openai_web_search",
  "firecrawl",
  "fixture",
  "manual"
]);
export type EvidenceProvider = z.infer<typeof evidenceProviderSchema>;

export const evidenceSourceTypeSchema = z.enum([
  "manufacturer",
  "integrator",
  "standards",
  "industry_publication",
  "supplier_website",
  "directory",
  "other"
]);
export type EvidenceSourceType = z.infer<typeof evidenceSourceTypeSchema>;

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
export type ResearchCitation = z.infer<typeof researchCitationSchema>;

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
export type SolutionApproach = z.infer<typeof solutionApproachSchema>;

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
export type SolutionResearchResult = z.infer<typeof solutionResearchResultSchema>;

export const solutionDecisionTypeSchema = z.enum([
  "local_trial",
  "outsource",
  "hybrid"
]);
export type SolutionDecisionType = z.infer<typeof solutionDecisionTypeSchema>;

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
export type SolutionDecision = z.infer<typeof solutionDecisionSchema>;

export const needReportRequestSchema = z.object({
  selectedApproachId: z.string().trim().min(1).optional()
});
export type NeedReportRequest = z.infer<typeof needReportRequestSchema>;

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
export type SupplierLifecycleStatus = z.infer<typeof supplierLifecycleStatusSchema>;

export const supplierLeadSchema = z.object({
  id: z.string().min(1),
  needProfileId: z.string().min(1),
  companyName: z.string().trim().min(1),
  website: z.string().url(),
  logoUrl: z.string().url().optional(),
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
export type SupplierLead = z.infer<typeof supplierLeadSchema>;

export const supplierRegistryProvenanceStateSchema = z.enum([
  "discovered",
  "contacted",
  "responded",
  "secured",
  "delivered"
]);
export type SupplierRegistryProvenanceState = z.infer<
  typeof supplierRegistryProvenanceStateSchema
>;

export const supplierRegistrySourceSchema = z.enum([
  "catalog",
  "live_discovery",
  "fixture"
]);
export type SupplierRegistrySource = z.infer<
  typeof supplierRegistrySourceSchema
>;

export const supplierRegistryEvidenceSchema = z.object({
  url: z.string().url(),
  title: z.string().trim().min(1),
  retrievedAt: isoDateTimeSchema
});
export type SupplierRegistryEvidence = z.infer<
  typeof supplierRegistryEvidenceSchema
>;

export const supplierRegistryEngagementSchema = z.object({
  needProfileId: z.string().min(1),
  engagementId: z.string().min(1).optional(),
  responsePrice: moneySchema.optional(),
  secured: z.boolean().default(false),
  delivered: z.boolean().default(false),
  discoveredAt: isoDateTimeSchema,
  contactedAt: isoDateTimeSchema.optional(),
  respondedAt: isoDateTimeSchema.optional(),
  securedAt: isoDateTimeSchema.optional(),
  deliveredAt: isoDateTimeSchema.optional(),
  lastActivityAt: isoDateTimeSchema
});
export type SupplierRegistryEngagement = z.infer<
  typeof supplierRegistryEngagementSchema
>;

export const supplierRegistryEntrySchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  accountScopeKey: z.string().min(1),
  supplierName: z.string().trim().min(1),
  normalizedDomain: z.string().trim().min(1).optional(),
  location: z.string().trim().min(1),
  capabilities: z.array(z.string().trim().min(1)).default([]),
  provenanceState: supplierRegistryProvenanceStateSchema,
  source: supplierRegistrySourceSchema,
  evidence: z.array(supplierRegistryEvidenceSchema).default([]),
  engagementHistory: z.array(supplierRegistryEngagementSchema).default([]),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});
export type SupplierRegistryEntry = z.infer<
  typeof supplierRegistryEntrySchema
>;

export const supplierRegistrySummarySchema = z.object({
  total: z.number().int().nonnegative(),
  discovered: z.number().int().nonnegative(),
  contacted: z.number().int().nonnegative(),
  responded: z.number().int().nonnegative(),
  secured: z.number().int().nonnegative(),
  delivered: z.number().int().nonnegative()
});
export type SupplierRegistrySummary = z.infer<
  typeof supplierRegistrySummarySchema
>;

export const supplierRegistryResponseSchema = z.object({
  schemaVersion: z.literal(1),
  entries: z.array(supplierRegistryEntrySchema),
  summary: supplierRegistrySummarySchema
});
export type SupplierRegistryResponse = z.infer<
  typeof supplierRegistryResponseSchema
>;

export const supplierClaimStatusSchema = z.enum([
  "pending",
  "claimed",
  "expired",
  "revoked"
]);
export type SupplierClaimStatus = z.infer<typeof supplierClaimStatusSchema>;

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
export type SupplierClaim = z.infer<typeof supplierClaimSchema>;

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
export type SupplierProfile = z.infer<typeof supplierProfileSchema>;

const supplierCommercialResponseBaseSchema = z.object({
  id: z.string().min(1),
  needProfileId: z.string().min(1),
  supplierLeadId: z.string().min(1),
  assumptions: z.array(z.string().trim().min(1)).default([]),
  conditions: z.array(z.string().trim().min(1)).default([]),
  submittedAt: isoDateTimeSchema
});

const canHelpCommercialResponseSchema =
  supplierCommercialResponseBaseSchema.extend({
    supplierProfileId: z.string().min(1),
    decision: z.literal("can_help"),
    availability: z.string().trim().min(1),
    indicativePrice: moneySchema.extend({
      amount: z.number().int().positive()
    }),
    proposedApproach: z.string().trim().min(1),
    relevantExperience: z.string().trim().min(1)
  });

const cannotHelpCommercialResponseSchema =
  supplierCommercialResponseBaseSchema.extend({
    supplierProfileId: z.string().min(1).optional(),
    decision: z.literal("cannot_help"),
    availability: z.string().trim().min(1).optional(),
    indicativePrice: moneySchema.optional(),
    proposedApproach: z.string().trim().min(1).optional(),
    relevantExperience: z.string().trim().min(1).optional(),
    declineReason: z.string().trim().min(1).optional()
  });

export const supplierCommercialResponseSchema = z.discriminatedUnion(
  "decision",
  [canHelpCommercialResponseSchema, cannotHelpCommercialResponseSchema]
);
export type SupplierCommercialResponse = z.infer<
  typeof supplierCommercialResponseSchema
>;

export const projectTemplateTypeSchema = z.enum([
  "urgent_plc_recovery",
  "planned_robotic_arm_integration"
]);
export type ProjectTemplateType = z.infer<typeof projectTemplateTypeSchema>;

export const projectStatusSchema = z.enum([
  "planning",
  "awaiting_supplier",
  "active",
  "at_risk",
  "completed",
  "cancelled"
]);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

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
export type ProjectMilestoneStatus = z.infer<typeof projectMilestoneStatusSchema>;

export const projectTaskStatusSchema = z.enum([
  "not_started",
  "in_progress",
  "blocked",
  "completed"
]);
export type ProjectTaskStatus = z.infer<typeof projectTaskStatusSchema>;

export const acceptanceCriterionSchema = z.object({
  id: z.string().min(1),
  description: z.string().trim().min(1),
  accepted: z.boolean().default(false),
  acceptedAt: isoDateTimeSchema.optional(),
  evidenceNote: z.string().trim().min(1).optional()
});
export type AcceptanceCriterion = z.infer<typeof acceptanceCriterionSchema>;

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
export type ProjectMilestone = z.infer<typeof projectMilestoneSchema>;

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
export type ProjectTask = z.infer<typeof projectTaskSchema>;

export const projectActivitySchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  eventType: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  actor: z.string().trim().min(1),
  occurredAt: isoDateTimeSchema
});
export type ProjectActivity = z.infer<typeof projectActivitySchema>;

export const projectRiskSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().trim().min(1),
  impact: z.enum(["low", "medium", "high"]),
  mitigation: z.string().trim().min(1),
  status: z.enum(["open", "mitigated", "closed"]),
  updatedAt: isoDateTimeSchema
});
export type ProjectRisk = z.infer<typeof projectRiskSchema>;

export const projectIssueSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().trim().min(1),
  owner: z.string().trim().min(1),
  status: z.enum(["open", "in_progress", "resolved"]),
  resolution: z.string().trim().min(1).optional(),
  updatedAt: isoDateTimeSchema
});
export type ProjectIssue = z.infer<typeof projectIssueSchema>;

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
export type ProjectApproval = z.infer<typeof projectApprovalSchema>;

export const projectDocumentSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().trim().min(1),
  documentType: z.string().trim().min(1),
  url: z.string().url(),
  provenance: z.enum(["buyer", "supplier", "veltact_fixture"]),
  addedAt: isoDateTimeSchema
});
export type ProjectDocument = z.infer<typeof projectDocumentSchema>;

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
export type ProjectChangeRequest = z.infer<typeof projectChangeRequestSchema>;

export const projectContactSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().trim().min(1),
  role: z.string().trim().min(1),
  organisation: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().min(1).optional()
});
export type ProjectContact = z.infer<typeof projectContactSchema>;

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
export type PaymentEvidence = z.infer<typeof paymentEvidenceSchema>;

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
export type IndustrialProject = z.infer<typeof industrialProjectSchema>;

export const veltactV2SocketEvent = {
  joinNeed: "veltact:v2:need.join",
  leaveNeed: "veltact:v2:need.leave",
  researchUpdated: "veltact:v2:research.updated",
  discoveryUpdated: "veltact:v2:discovery.updated",
  supplierLifecycleUpdated: "veltact:v2:supplier.lifecycle_updated",
  supplierResponseSubmitted: "veltact:v2:supplier.response_submitted",
  projectUpdated: "veltact:v2:project.updated",
  milestonePaymentUpdated: "veltact:v2:milestone.payment_updated"
} as const;

export type VeltactV2SocketEvent =
  (typeof veltactV2SocketEvent)[keyof typeof veltactV2SocketEvent];

export const aiIntakeEvidenceKindSchema = z.enum(["written", "pdf", "photo"]);
export type AiIntakeEvidenceKind = z.infer<typeof aiIntakeEvidenceKindSchema>;

export const aiIntakeEvidenceSchema = z.object({
  kind: aiIntakeEvidenceKindSchema,
  name: z.string().trim().min(1),
  mimeType: z.string().trim().min(1).optional(),
  extractedText: z.string().trim().optional(),
  dataUrl: z.string().trim().startsWith("data:").max(5_600_000).optional()
});
export type AiIntakeEvidence = z.infer<typeof aiIntakeEvidenceSchema>;

export const intakeEvidenceStatusSchema = z.enum([
  "provided",
  "processed",
  "failed"
]);
export type IntakeEvidenceStatus = z.infer<typeof intakeEvidenceStatusSchema>;

export const intakeEvidenceSummarySchema = z.object({
  kind: aiIntakeEvidenceKindSchema,
  name: z.string().trim().min(1),
  mimeType: z.string().trim().min(1).optional(),
  source: z.enum(["buyer", "demo_fixture"]),
  status: intakeEvidenceStatusSchema,
  errorMessage: z.string().trim().min(1).optional()
});
export type IntakeEvidenceSummary = z.infer<typeof intakeEvidenceSummarySchema>;

export const rapidMatchJourneyPhaseSchema = z.enum([
  "find",
  "connect",
  "deploy"
]);
export type RapidMatchJourneyPhase = z.infer<
  typeof rapidMatchJourneyPhaseSchema
>;

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
export type RapidMatchJourneyStatus = z.infer<
  typeof rapidMatchJourneyStatusSchema
>;

export const rapidMatchNextActionSchema = z.enum([
  "analyse_requirement",
  "confirm_need_profile",
  "download_report",
  "find_suppliers",
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
export type RapidMatchNextAction = z.infer<
  typeof rapidMatchNextActionSchema
>;

export const deploymentMilestoneStatusSchema = z.enum([
  "not_started",
  "awaiting_payment",
  "funded",
  "in_progress",
  "completed"
]);
export type DeploymentMilestoneStatus = z.infer<
  typeof deploymentMilestoneStatusSchema
>;

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
export type DeploymentMilestoneSummary = z.infer<
  typeof deploymentMilestoneSummarySchema
>;

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
export type DeploymentSummary = z.infer<typeof deploymentSummarySchema>;

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
  commitmentNotification: supplierCommitmentNotificationSchema.optional(),
  deployment: deploymentSummarySchema.optional()
});
export type RapidMatchBuyerWorkspace = z.infer<
  typeof rapidMatchBuyerWorkspaceSchema
>;

export const rapidMatchApiRoute = {
  structureRequirement: "/api/ai-intake/structure",
  createNeedProfile: "/api/need-profiles",
  needWorkspace: "/api/need-profiles/:needProfileId",
  research: "/api/need-profiles/:needProfileId/research",
  solutionDecision: "/api/need-profiles/:needProfileId/solution-decision",
  needReportPdf: "/api/need-profiles/:needProfileId/report.pdf",
  discoverSuppliers: "/api/need-profiles/:needProfileId/suppliers/discover",
  sendInvitations: "/api/need-profiles/:needProfileId/invitations/send",
  responses: "/api/need-profiles/:needProfileId/responses",
  createEngagement: "/api/need-profiles/:needProfileId/engagements",
  engagement: "/api/engagements/:engagementId",
  paymentLink: "/api/engagements/:engagementId/payment-link",
  commitmentNotification:
    "/api/engagements/:engagementId/commitment-notification",
  deployment: "/api/engagements/:engagementId/deployment",
  deploymentMilestone:
    "/api/engagements/:engagementId/deployment/milestones/:milestoneId",
  supplierRegistry: "/api/registry",
  supplierInvitation: "/api/supplier-invitations/:token",
  supplierClaim: "/api/supplier-invitations/:token/claim",
  supplierResponse: "/api/supplier-invitations/:token/responses",
  supplierRfqPdf: "/api/supplier-invitations/:token/rfq.pdf",
  supplierQuotePdf: "/api/supplier-invitations/:token/quote.pdf",
  demoReset: "/api/demo/reset"
} as const;

export type RapidMatchApiRoute =
  (typeof rapidMatchApiRoute)[keyof typeof rapidMatchApiRoute];
