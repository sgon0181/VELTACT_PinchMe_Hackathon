import { randomUUID } from "node:crypto";
import { matchSuppliers } from "./matching.js";
import { seededSuppliers } from "./suppliers.js";
import type {
  Engagement,
  NeedProfile,
  NeedRecord,
  PinchWebhookEvidence,
  SupplierInvitation,
  SupplierResponse
} from "./types.js";

const needs = new Map<string, NeedRecord>();
const invitations = new Map<string, SupplierInvitation>();
const responses = new Map<string, SupplierResponse>();
const engagements = new Map<string, Engagement>();
const processedPinchEventIds = new Set<string>();
const pinchWebhookEvidence = new Map<string, PinchWebhookEvidence>();

export function createNeed(input: { buyerEmail: string; profile: NeedProfile }): NeedRecord {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const matches = matchSuppliers(input.profile, seededSuppliers);
  const needInvitations = matches.map((match) => {
    const invitation: SupplierInvitation = {
      token: randomUUID(),
      needId: id,
      supplierId: match.supplier.id,
      supplierName: match.supplier.name,
      status: "invited",
      createdAt
    };
    invitations.set(invitation.token, invitation);
    return invitation;
  });

  const need: NeedRecord = {
    id,
    buyerEmail: input.buyerEmail,
    profile: input.profile,
    matches,
    invitations: needInvitations,
    status: "responses_open",
    createdAt,
    updatedAt: createdAt
  };
  needs.set(id, need);
  return need;
}

export function getNeed(id: string): NeedRecord | undefined {
  return needs.get(id);
}

export function getInvitation(token: string): SupplierInvitation | undefined {
  return invitations.get(token);
}

export function markInvitationViewed(token: string): SupplierInvitation | undefined {
  const invitation = invitations.get(token);
  if (!invitation) {
    return undefined;
  }

  if (invitation.status === "invited") {
    invitation.status = "viewed";
    invitation.viewedAt = new Date().toISOString();
  }

  return invitation;
}

export function submitSupplierResponse(
  token: string,
  input: Omit<SupplierResponse, "id" | "needId" | "supplierId" | "supplierName" | "submittedAt">
): SupplierResponse | undefined {
  const invitation = invitations.get(token);
  if (!invitation) {
    return undefined;
  }

  const submittedAt = new Date().toISOString();
  const response: SupplierResponse = {
    id: randomUUID(),
    needId: invitation.needId,
    supplierId: invitation.supplierId,
    supplierName: invitation.supplierName,
    submittedAt,
    ...input
  };

  invitation.status = "responded";
  invitation.respondedAt = submittedAt;
  responses.set(response.id, response);
  return response;
}

export function listResponsesForNeed(needId: string): SupplierResponse[] | undefined {
  if (!needs.has(needId)) {
    return undefined;
  }

  return [...responses.values()]
    .filter((response) => response.needId === needId)
    .sort((left, right) => left.submittedAt.localeCompare(right.submittedAt));
}

export function createEngagement(input: {
  needId: string;
  supplierResponseId: string;
}): Engagement | undefined {
  const need = needs.get(input.needId);
  const supplierResponse = responses.get(input.supplierResponseId);
  if (!need || !supplierResponse || supplierResponse.needId !== input.needId) {
    return undefined;
  }

  const existing = [...engagements.values()].find(
    (engagement) => engagement.supplierResponseId === input.supplierResponseId
  );
  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const engagement: Engagement = {
    id: randomUUID(),
    needId: input.needId,
    supplierId: supplierResponse.supplierId,
    supplierName: supplierResponse.supplierName,
    supplierResponseId: supplierResponse.id,
    status: "supplier_selected",
    paymentStatus: "not_started",
    createdAt: now,
    updatedAt: now
  };

  need.status = "selected";
  need.updatedAt = now;
  engagements.set(engagement.id, engagement);
  return engagement;
}

export function getEngagement(engagementId: string): Engagement | undefined {
  return engagements.get(engagementId);
}

export function attachPaymentLinkToEngagement(input: {
  engagementId: string;
  payerId: string;
  paymentLinkId: string;
  hostedCheckoutUrl: string;
}): Engagement | undefined {
  const engagement = engagements.get(input.engagementId);
  if (!engagement) {
    return undefined;
  }

  const need = needs.get(engagement.needId);
  const now = new Date().toISOString();
  engagement.pinchPayerId = input.payerId;
  engagement.paymentLinkId = input.paymentLinkId;
  engagement.hostedCheckoutUrl = input.hostedCheckoutUrl;
  engagement.status = "payment_pending";
  engagement.paymentStatus = "awaiting_payment";
  engagement.updatedAt = now;

  if (need) {
    need.status = "payment_pending";
    need.updatedAt = now;
  }

  return engagement;
}

export function recordAuthoritativePinchPayment(input: {
  eventId: string;
  eventType: string;
  engagementId: string;
  paymentId?: string;
  payload: unknown;
}): { engagement?: Engagement; duplicate: boolean } {
  if (processedPinchEventIds.has(input.eventId)) {
    return {
      engagement: engagements.get(input.engagementId),
      duplicate: true
    };
  }

  processedPinchEventIds.add(input.eventId);
  const receivedAt = new Date().toISOString();
  pinchWebhookEvidence.set(input.eventId, {
    ...input,
    receivedAt
  });

  const engagement = engagements.get(input.engagementId);
  if (!engagement) {
    return { duplicate: false };
  }

  const need = needs.get(engagement.needId);
  engagement.status = "supplier_secured";
  engagement.paymentStatus = "paid";
  engagement.pinchPaymentId = input.paymentId ?? engagement.pinchPaymentId;
  engagement.securedAt = receivedAt;
  engagement.updatedAt = receivedAt;

  if (need) {
    need.status = "secured";
    need.updatedAt = receivedAt;
  }

  return { engagement, duplicate: false };
}

export function resetMarketplaceStore() {
  needs.clear();
  invitations.clear();
  responses.clear();
  engagements.clear();
  processedPinchEventIds.clear();
  pinchWebhookEvidence.clear();
}
