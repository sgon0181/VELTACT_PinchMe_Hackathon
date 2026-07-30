import {
  engagementSpeedReceiptSchema,
  type DeploymentSummary,
  type EngagementReceiptEvent,
  type EngagementSpeedReceipt,
  type MarketplaceAuditEvent,
  type SolutionResearchResult
} from "@veltact/contracts";
import type {
  Engagement,
  NeedRecord,
  SupplierResponse
} from "./types.js";

type ReceiptEventDraft = Omit<EngagementReceiptEvent, "sequence">;

export function assembleEngagementSpeedReceipt(input: {
  need: NeedRecord;
  researchResult?: SolutionResearchResult;
  responses: SupplierResponse[];
  engagement: Engagement;
  deployment?: DeploymentSummary;
  auditEvents: MarketplaceAuditEvent[];
  generatedAt?: string;
}): EngagementSpeedReceipt {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const events: ReceiptEventDraft[] = [
    {
      id: `${input.need.id}:requirement-created`,
      stage: "requirement_created",
      status: "complete",
      label: "Requirement created",
      detail: input.need.profile.title,
      occurredAt: input.need.createdAt
    },
    analysisEvent(input.need, input.researchResult),
    ...outreachEvents(input.need, input.auditEvents),
    ...responseEvents(input.responses),
    selectionEvent(input.engagement),
    paymentLinkEvent(input.engagement, input.auditEvents),
    paymentVerificationEvent(input.engagement),
    ...milestoneEvents(input.deployment)
  ];
  const securedAt = input.engagement.securedAt;
  const elapsedMilliseconds = securedAt
    ? Math.max(
        0,
        Date.parse(securedAt) - Date.parse(input.need.createdAt)
      )
    : undefined;

  return engagementSpeedReceiptSchema.parse({
    schemaVersion: 1,
    engagementId: input.engagement.id,
    needProfileId: input.need.id,
    requirementTitle: input.need.profile.title,
    status: securedAt ? "secured" : "in_progress",
    startedAt: input.need.createdAt,
    securedAt,
    elapsedMilliseconds,
    baseline: {
      label: "Industry norm: days to weeks",
      kind: "general_claim"
    },
    events: events.map((event, index) => ({
      ...event,
      sequence: index + 1
    })),
    generatedAt
  });
}

function analysisEvent(
  need: NeedRecord,
  researchResult?: SolutionResearchResult
): ReceiptEventDraft {
  if (!researchResult) {
    return {
      id: `${need.id}:analysis-pending`,
      stage: "analysis_completed",
      status: "pending",
      label: "Requirement analysis pending"
    };
  }
  return {
    id: `${need.id}:analysis-completed`,
    stage: "analysis_completed",
    status: "complete",
    label: "Requirement analysis completed",
    detail:
      researchResult.sourceMode === "live"
        ? "Live provider result recorded with source evidence."
        : "Deterministic fixture analysis recorded.",
    occurredAt: researchResult.generatedAt,
    evidenceSource: researchResult.sourceMode,
    authoritative: researchResult.sourceMode === "live"
  };
}

function outreachEvents(
  need: NeedRecord,
  auditEvents: MarketplaceAuditEvent[]
): ReceiptEventDraft[] {
  const invitationIds = new Set(
    need.invitations.map((invitation) => invitation.id)
  );
  const finalEventTypes = new Set([
    "outreach.sent",
    "outreach.local_demo_prepared",
    "outreach.failed",
    "outreach.not_configured"
  ]);
  const latestByDelivery = new Map<string, MarketplaceAuditEvent>();
  for (const event of auditEvents) {
    if (
      event.entityType !== "outreach" ||
      !finalEventTypes.has(event.eventType)
    ) {
      continue;
    }
    const invitationId = event.entityId.split(":")[0];
    if (!invitationId || !invitationIds.has(invitationId)) continue;
    const current = latestByDelivery.get(event.entityId);
    if (!current || current.occurredAt < event.occurredAt) {
      latestByDelivery.set(event.entityId, event);
    }
  }
  const supplierNames = new Map(
    need.invitations.map((invitation) => [
      invitation.supplierId,
      invitation.supplierName
    ])
  );
  const completed = [...latestByDelivery.values()]
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
    .flatMap((event): ReceiptEventDraft[] => {
      const channel =
        event.metadata.channel === "email" ||
        event.metadata.channel === "sms"
          ? event.metadata.channel
          : undefined;
      const supplierId =
        typeof event.metadata.supplierId === "string"
          ? event.metadata.supplierId
          : undefined;
      if (!channel) return [];
      const channelLabel = channel === "email" ? "Email" : "SMS";
      const supplierName = supplierId
        ? supplierNames.get(supplierId)
        : undefined;
      const suffix = supplierName ? ` for ${supplierName}` : "";
      if (event.eventType === "outreach.sent") {
        return [{
          id: `${event.id}:receipt`,
          stage: "outreach_delivery",
          status: "complete",
          label: `${channelLabel} outreach sent${suffix}`,
          occurredAt: event.occurredAt,
          channel,
          supplierId,
          supplierName,
          evidenceSource:
            typeof event.metadata.provider === "string"
              ? event.metadata.provider
              : undefined
        }];
      }
      if (event.eventType === "outreach.local_demo_prepared") {
        return [{
          id: `${event.id}:receipt`,
          stage: "outreach_delivery",
          status: "complete",
          label: `${channelLabel} invitation prepared${suffix}`,
          detail: "Local demo only; no external delivery is claimed.",
          occurredAt: event.occurredAt,
          channel,
          supplierId,
          supplierName,
          evidenceSource: "local_demo",
          authoritative: false
        }];
      }
      const failed = event.eventType === "outreach.failed";
      return [{
        id: `${event.id}:receipt`,
        stage: "outreach_delivery",
        status: failed ? "failed" : "pending",
        label: failed
          ? `${channelLabel} outreach failed${suffix}`
          : `${channelLabel} outreach not sent${suffix}`,
        detail: failed
          ? "The delivery provider did not accept this outreach."
          : "No configured delivery provider accepted this outreach.",
        occurredAt: event.occurredAt,
        channel,
        supplierId,
        supplierName,
        evidenceSource:
          typeof event.metadata.provider === "string"
            ? event.metadata.provider
            : undefined
      }];
    });

  if (completed.length > 0) return completed;
  if (need.outreachApprovedAt) {
    return [{
      id: `${need.id}:outreach-links-prepared`,
      stage: "outreach_delivery",
      status: "complete",
      label: "Private supplier links prepared",
      detail: "No external email or SMS delivery was recorded.",
      occurredAt: need.outreachApprovedAt,
      evidenceSource: "manual_link",
      authoritative: false
    }];
  }
  return [{
    id: `${need.id}:outreach-pending`,
    stage: "outreach_delivery",
    status: "pending",
    label: "Supplier outreach pending"
  }];
}

function responseEvents(
  responses: SupplierResponse[]
): ReceiptEventDraft[] {
  const submitted = responses
    .filter((response) => response.status === "submitted")
    .sort((left, right) => left.submittedAt.localeCompare(right.submittedAt));
  if (submitted.length === 0) {
    return [{
      id: "supplier-responses-pending",
      stage: "supplier_response_received",
      status: "pending",
      label: "Supplier responses pending"
    }];
  }
  return submitted.map((response) => ({
    id: `${response.id}:received`,
    stage: "supplier_response_received",
    status: "complete",
    label: `Response received from ${response.supplierName}`,
    detail:
      response.decision === "can_help"
        ? "Commercial intent received."
        : "Supplier declined this requirement.",
    occurredAt: response.submittedAt,
    supplierId: response.supplierId,
    supplierName: response.supplierName
  }));
}

function selectionEvent(engagement: Engagement): ReceiptEventDraft {
  return {
    id: `${engagement.id}:supplier-selected`,
    stage: "supplier_selected",
    status: "complete",
    label: `Supplier selected: ${engagement.supplierName}`,
    occurredAt: engagement.createdAt,
    supplierId: engagement.supplierId,
    supplierName: engagement.supplierName
  };
}

function paymentLinkEvent(
  engagement: Engagement,
  auditEvents: MarketplaceAuditEvent[]
): ReceiptEventDraft {
  const event = auditEvents
    .filter(
      (candidate) =>
        candidate.eventType === "payment_link.created" &&
        candidate.metadata.engagementId === engagement.id
    )
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))[0];
  if (!event && !engagement.paymentLinkId) {
    return {
      id: `${engagement.id}:payment-link-pending`,
      stage: "payment_link_created",
      status: "pending",
      label: "Commitment payment link pending"
    };
  }
  return {
    id: event?.id ?? `${engagement.id}:payment-link-created`,
    stage: "payment_link_created",
    status: "complete",
    label: "Commitment payment link created",
    detail: event
      ? "The hosted link was recorded by the backend."
      : "The hosted link exists; its original audit timestamp is unavailable.",
    occurredAt: event?.occurredAt,
    milestoneId:
      typeof event?.metadata.milestoneId === "string"
        ? event.metadata.milestoneId
        : undefined,
    evidenceSource:
      typeof event?.metadata.provider === "string"
        ? event.metadata.provider
        : undefined
  };
}

function paymentVerificationEvent(
  engagement: Engagement
): ReceiptEventDraft {
  if (!engagement.securedAt) {
    return {
      id: `${engagement.id}:payment-verification-pending`,
      stage: "payment_verified",
      status: "pending",
      label: "Commitment payment verification pending",
      detail: "Browser return alone does not secure the supplier."
    };
  }
  const localDemo = engagement.paymentEvidenceSource === "local_demo";
  return {
    id: `${engagement.id}:payment-verified`,
    stage: "payment_verified",
    status: "complete",
    label: localDemo
      ? "Local demo commitment recorded"
      : "Commitment payment verified",
    detail: localDemo
      ? "Non-authoritative local demo evidence; no Pinch transaction is claimed."
      : "Backend-verified Pinch evidence secured the supplier.",
    occurredAt: engagement.securedAt,
    evidenceSource: engagement.paymentEvidenceSource,
    authoritative: engagement.paymentEvidenceAuthoritative ?? !localDemo
  };
}

function milestoneEvents(
  deployment?: DeploymentSummary
): ReceiptEventDraft[] {
  if (!deployment) return [];
  return [...deployment.milestones]
    .sort((left, right) => left.sequence - right.sequence)
    .map((milestone): ReceiptEventDraft => {
      if (!milestone.fundedAt) {
        return {
          id: `${milestone.id}:funding-pending`,
          stage: "milestone_funded",
          status: "pending",
          label: `Milestone ${milestone.sequence} funding pending: ${milestone.title}`,
          milestoneId: milestone.id
        };
      }
      const localDemo = milestone.paymentEvidenceSource === "local_demo";
      return {
        id: `${milestone.id}:funded`,
        stage: "milestone_funded",
        status: "complete",
        label: localDemo
          ? `Milestone ${milestone.sequence} demo funding recorded: ${milestone.title}`
          : `Milestone ${milestone.sequence} funded: ${milestone.title}`,
        detail: localDemo
          ? "Non-authoritative local demo evidence."
          : "Backend-verified Pinch payment evidence.",
        occurredAt: milestone.fundedAt,
        milestoneId: milestone.id,
        evidenceSource: milestone.paymentEvidenceSource,
        authoritative: milestone.paymentEvidenceAuthoritative
      };
    });
}
