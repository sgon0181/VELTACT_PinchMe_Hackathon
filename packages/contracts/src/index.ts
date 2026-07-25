import { z } from "zod";

export const needPrioritySchema = z.enum(["urgent", "soon", "planned"]);
export type NeedPriority = z.infer<typeof needPrioritySchema>;

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

export const supplierResponseSchema = z.object({
  id: z.string().min(1),
  needProfileId: z.string().min(1),
  supplierId: z.string().min(1),
  invitationId: z.string().min(1),
  decision: supplierResponseDecisionSchema,
  availability: z.string().trim().min(1).optional(),
  indicativePrice: moneySchema.optional(),
  relevantExperience: z.string().trim().min(1).optional(),
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
  securedAt: isoDateTimeSchema.optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});
export type Engagement = z.infer<typeof engagementSchema>;

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
  buyerPriority: z.enum(["speed", "technical_fit", "quality", "trust", "price"]).optional()
});
export type AiIntakeProfile = z.infer<typeof aiIntakeProfileSchema>;

export const aiIntakeResultSchema = z.object({
  rawRequirement: z.string().trim().min(1),
  generatedProfile: aiIntakeProfileSchema,
  confidence: z.number().min(0).max(1).optional(),
  missingFields: z.array(z.string().trim().min(1)).default([])
});
export type AiIntakeResult = z.infer<typeof aiIntakeResultSchema>;

export const rapidMatchSocketEvent = {
  joinNeedProfile: "rapidmatch:need.join",
  leaveNeedProfile: "rapidmatch:need.leave",
  matchCreated: "rapidmatch:match.created",
  invitationSent: "rapidmatch:invitation.sent",
  outreachDeliveryUpdated: "rapidmatch:outreach.delivery_updated",
  aiIntakeStructured: "rapidmatch:ai_intake.structured",
  supplierResponseSubmitted: "rapidmatch:response.submitted",
  supplierSelected: "rapidmatch:supplier.selected",
  paymentStatusUpdated: "rapidmatch:payment.status_updated",
  engagementSecured: "rapidmatch:engagement.secured"
} as const;

export type RapidMatchSocketEvent =
  (typeof rapidMatchSocketEvent)[keyof typeof rapidMatchSocketEvent];
