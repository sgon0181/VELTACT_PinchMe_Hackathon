import { randomUUID } from "node:crypto";
import { matchSuppliers } from "./matching.js";
import { sendSupplierOpportunity } from "./outreachDelivery.js";
import { seededSuppliers } from "./suppliers.js";
import { env } from "../env.js";
import type {
  Engagement,
  NeedProfile,
  NeedRecord,
  PinchWebhookEvidence,
  SupplierInvitation,
  SupplierOutreachDelivery,
  SupplierResponse
} from "./types.js";

const needs = new Map<string, NeedRecord>();
const invitations = new Map<string, SupplierInvitation>();
const outreachDeliveries = new Map<string, SupplierOutreachDelivery>();
const responses = new Map<string, SupplierResponse>();
const engagements = new Map<string, Engagement>();
const processedPinchEventIds = new Set<string>();
const pinchWebhookEvidence = new Map<string, PinchWebhookEvidence>();

export function createNeed(input: { buyerEmail: string; profile: NeedProfile }): NeedRecord {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const matches = matchSuppliers(input.profile, seededSuppliers);
  const needInvitations = matches.map((match) => {
    match.status = "invited";
    match.updatedAt = createdAt;
    const token = randomUUID();
    const invitationId = `${id}-invitation-${match.supplier.id}`;
    const invitation: SupplierInvitation = {
      id: invitationId,
      token,
      needId: id,
      needProfileId: id,
      supplierId: match.supplier.id,
      supplierName: match.supplier.name,
      matchId: `${id}-${match.id}`,
      responseUrl: new URL(`/supplier.html?token=${encodeURIComponent(token)}`, env.WEB_ORIGIN).toString(),
      status: "sent",
      sentAt: createdAt,
      expiresAt: new Date(Date.parse(createdAt) + 3 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt,
      updatedAt: createdAt
    };
    invitations.set(invitation.token, invitation);
    outreachDeliveries.set(deliveryKey(invitation.id, "email"), {
      invitationId: invitation.id,
      supplierId: invitation.supplierId,
      channel: "email",
      destination: env.SUPPLIER_OUTREACH_EMAIL_TO ?? match.supplier.contactEmail,
      deliveryStatus: "not_sent"
    });
    const smsDestination = env.SUPPLIER_OUTREACH_SMS_TO ?? match.supplier.contactPhone;
    if (smsDestination) {
      outreachDeliveries.set(deliveryKey(invitation.id, "sms"), {
        invitationId: invitation.id,
        supplierId: invitation.supplierId,
        channel: "sms",
        destination: smsDestination,
        deliveryStatus: "not_sent"
      });
    }
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

export async function sendSupplierOutreachForNeed(needId: string): Promise<SupplierOutreachDelivery[] | undefined> {
  const need = needs.get(needId);
  if (!need) {
    return undefined;
  }

  const updatedDeliveries: SupplierOutreachDelivery[] = [];
  for (const invitation of need.invitations) {
    for (const channel of ["email", "sms"] as const) {
      const delivery = outreachDeliveries.get(deliveryKey(invitation.id, channel));
      if (!delivery) {
        continue;
      }
      updatedDeliveries.push(...(await sendOutreachDelivery(delivery, invitation, need)));
    }
  }

  return updatedDeliveries;
}

export function listOutreachDeliveriesForNeed(needId: string): SupplierOutreachDelivery[] | undefined {
  const need = needs.get(needId);
  if (!need) {
    return undefined;
  }

  const invitationIds = new Set(need.invitations.map((invitation) => invitation.id));
  return [...outreachDeliveries.values()].filter((delivery) => invitationIds.has(delivery.invitationId));
}

export function markInvitationViewed(token: string): SupplierInvitation | undefined {
  const invitation = invitations.get(token);
  if (!invitation) {
    return undefined;
  }

  if (invitation.status === "sent" || invitation.status === "pending") {
    const openedAt = new Date().toISOString();
    invitation.status = "opened";
    invitation.openedAt = openedAt;
    invitation.updatedAt = openedAt;
  }

  return invitation;
}

export function submitSupplierResponse(
  token: string,
  input: {
    canHelp: boolean;
    earliestAvailability: string;
    indicativePriceAud: number;
    relevantExperience: string;
    conditions: string;
  }
): SupplierResponse | undefined {
  const invitation = invitations.get(token);
  if (!invitation) {
    return undefined;
  }

  const existingResponse = [...responses.values()].find(
    (response) => response.needId === invitation.needId && response.supplierId === invitation.supplierId
  );
  if (existingResponse) {
    const updatedAt = new Date().toISOString();
    existingResponse.canHelp = input.canHelp;
    existingResponse.decision = input.canHelp ? "can_help" : "cannot_help";
    existingResponse.earliestAvailability = input.earliestAvailability;
    existingResponse.availability = input.earliestAvailability;
    existingResponse.indicativePriceAud = input.indicativePriceAud;
    existingResponse.indicativePrice = {
      amount: input.indicativePriceAud * 100,
      currency: "AUD"
    };
    existingResponse.relevantExperience = input.relevantExperience;
    existingResponse.conditions = input.conditions;
    existingResponse.updatedAt = updatedAt;
    invitation.status = "responded";
    invitation.respondedAt = updatedAt;
    invitation.updatedAt = updatedAt;
    updateMatchResponseStatus(invitation, input.canHelp, updatedAt);
    return existingResponse;
  }

  const submittedAt = new Date().toISOString();
  const response: SupplierResponse = {
    id: randomUUID(),
    needId: invitation.needId,
    needProfileId: invitation.needProfileId,
    supplierId: invitation.supplierId,
    supplierName: invitation.supplierName,
    invitationId: invitation.id,
    canHelp: input.canHelp,
    decision: input.canHelp ? "can_help" : "cannot_help",
    earliestAvailability: input.earliestAvailability,
    availability: input.earliestAvailability,
    indicativePriceAud: input.indicativePriceAud,
    indicativePrice: {
      amount: input.indicativePriceAud * 100,
      currency: "AUD"
    },
    relevantExperience: input.relevantExperience,
    conditions: input.conditions,
    status: "submitted",
    submittedAt,
    createdAt: submittedAt,
    updatedAt: submittedAt
  };

  invitation.status = "responded";
  invitation.respondedAt = submittedAt;
  invitation.updatedAt = submittedAt;
  responses.set(response.id, response);
  updateMatchResponseStatus(invitation, input.canHelp, submittedAt);
  return response;
}

function updateMatchResponseStatus(invitation: SupplierInvitation, canHelp: boolean, updatedAt: string) {
  const need = needs.get(invitation.needId);
  const match = need?.matches.find((item) => item.supplier.id === invitation.supplierId);
  if (match) {
    match.status = canHelp ? "responded" : "declined";
    match.updatedAt = updatedAt;
  }
}

function deliveryKey(invitationId: string, channel: SupplierOutreachDelivery["channel"]) {
  return `${invitationId}:${channel}`;
}

async function sendOutreachDelivery(
  delivery: SupplierOutreachDelivery,
  invitation: SupplierInvitation,
  need: NeedRecord
) {
  if (delivery.deliveryStatus === "sent") {
    return [{ ...delivery }];
  }

  delivery.deliveryStatus = "queued";
  delivery.errorMessage = undefined;
  updatedNeedTimestamp(need);
  const updates = [{ ...delivery }];

  const result = await sendSupplierOpportunity(delivery, invitation, need);
  const sentAt = new Date().toISOString();
  delivery.deliveryStatus = result.ok ? "sent" : "failed";
  delivery.sentAt = result.ok ? sentAt : undefined;
  delivery.errorMessage = result.ok ? undefined : result.errorMessage;
  updatedNeedTimestamp(need);
  updates.push({ ...delivery });
  return updates;
}

function updatedNeedTimestamp(need: NeedRecord) {
  need.updatedAt = new Date().toISOString();
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
  for (const match of need.matches) {
    match.status = match.supplier.id === supplierResponse.supplierId ? "selected" : "not_selected";
    match.updatedAt = now;
  }
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
  outreachDeliveries.clear();
  responses.clear();
  engagements.clear();
  processedPinchEventIds.clear();
  pinchWebhookEvidence.clear();
}
