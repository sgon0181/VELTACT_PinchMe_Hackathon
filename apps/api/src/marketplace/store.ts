import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual
} from "node:crypto";
import { matchSuppliers } from "./matching.js";
import { sendSupplierOpportunity } from "./outreachDelivery.js";
import { supplierCatalog } from "./suppliers.js";
import { env } from "../env.js";
import {
  loadMarketplaceSnapshot,
  saveMarketplaceSnapshot
} from "./persistence.js";
import type {
  Engagement,
  MarketplaceAuditEvent,
  NeedProfile,
  NeedRecord,
  PinchWebhookEvidence,
  SupplierInvitation,
  SupplierOutreachDelivery,
  SupplierResponse
} from "./types.js";

const initialSnapshot = loadMarketplaceSnapshot(env.MARKETPLACE_DATA_FILE);
const needs = new Map<string, NeedRecord>(
  initialSnapshot?.needs.map((need) => [need.id, need]) ?? []
);
const invitations = new Map<string, SupplierInvitation>(
  initialSnapshot?.invitations.map((invitation) => [invitation.token, invitation]) ?? []
);
const outreachDeliveries = new Map<string, SupplierOutreachDelivery>(
  initialSnapshot?.outreachDeliveries.map((delivery) => [
    deliveryKey(delivery.invitationId, delivery.channel),
    delivery
  ]) ?? []
);
const responses = new Map<string, SupplierResponse>(
  initialSnapshot?.responses.map((supplierResponse) => [
    supplierResponse.id,
    supplierResponse
  ]) ?? []
);
const engagements = new Map<string, Engagement>(
  initialSnapshot?.engagements.map((engagement) => [engagement.id, engagement]) ?? []
);
const processedPinchEventIds = new Set<string>(
  initialSnapshot?.processedPinchEventIds ?? []
);
const pinchWebhookEvidence = new Map<string, PinchWebhookEvidence>(
  initialSnapshot?.pinchWebhookEvidence.map((evidence) => [
    evidence.eventId,
    evidence
  ]) ?? []
);
const auditEvents: MarketplaceAuditEvent[] = initialSnapshot?.auditEvents ?? [];
const issuedBuyerAccessTokens = new Map<string, string>();

export type SupplierResponseSubmissionResult =
  | { status: "submitted"; supplierResponse: SupplierResponse }
  | { status: "not_found" }
  | { status: "expired" }
  | { status: "closed" };

export type EngagementCreationResult =
  | { status: "created"; engagement: Engagement }
  | { status: "existing"; engagement: Engagement }
  | { status: "not_found" }
  | { status: "not_selectable" }
  | { status: "already_selected" };

export function createNeed(
  input: { buyerEmail: string; profile: NeedProfile },
  currentTime = new Date()
): NeedRecord {
  const id = randomUUID();
  const buyerAccessToken = secureAccessToken();
  const createdAt = currentTime.toISOString();
  const matches = matchSuppliers(input.profile, supplierCatalog);
  const needInvitations = matches.map((match) => {
    match.status = "invited";
    match.updatedAt = createdAt;
    const token = secureAccessToken();
    const invitationId = `${id}-invitation-${match.supplier.id}`;
    const invitation: SupplierInvitation = {
      id: invitationId,
      token,
      needId: id,
      needProfileId: id,
      supplierId: match.supplier.id,
      supplierName: match.supplier.companyName,
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
    const mobileDestination = env.SUPPLIER_OUTREACH_WHATSAPP_TO
      ? whatsappAddress(env.SUPPLIER_OUTREACH_WHATSAPP_TO)
      : env.SUPPLIER_OUTREACH_SMS_TO ?? match.supplier.contactPhone;
    if (mobileDestination) {
      outreachDeliveries.set(deliveryKey(invitation.id, "sms"), {
        invitationId: invitation.id,
        supplierId: invitation.supplierId,
        channel: "sms",
        destination: mobileDestination,
        deliveryStatus: "not_sent"
      });
    }
    return invitation;
  });

  const need: NeedRecord = {
    id,
    buyerEmail: input.buyerEmail,
    buyerAccessTokenHash: accessTokenHash(buyerAccessToken),
    profile: input.profile,
    matches,
    invitations: needInvitations,
    status: "responses_open",
    createdAt,
    updatedAt: createdAt
  };
  needs.set(id, need);
  issuedBuyerAccessTokens.set(id, buyerAccessToken);
  commitMarketplaceMutation({
    eventType: "need.created",
    actorType: "buyer",
    actorId: input.buyerEmail,
    entityType: "need",
    entityId: id,
    metadata: {
      matchCount: matches.length,
      category: input.profile.category
    }
  });
  return need;
}

export function consumeIssuedBuyerAccessToken(needId: string) {
  const token = issuedBuyerAccessTokens.get(needId);
  issuedBuyerAccessTokens.delete(needId);
  return token;
}

export function isBuyerAuthorised(needId: string, accessToken: string | undefined) {
  if (!env.BUYER_CAPABILITY_AUTH_REQUIRED) {
    return true;
  }

  const expectedHash = needs.get(needId)?.buyerAccessTokenHash;
  if (!expectedHash || !accessToken) {
    return false;
  }

  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(accessTokenHash(accessToken), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function listMarketplaceAuditEvents() {
  return [...auditEvents];
}

export function getNeed(id: string): NeedRecord | undefined {
  return needs.get(id);
}

export function getInvitation(token: string): SupplierInvitation | undefined {
  return invitations.get(token);
}

export function getResponseForInvitation(invitationId: string): SupplierResponse | undefined {
  return [...responses.values()].find((response) => response.invitationId === invitationId);
}

export async function sendSupplierOutreachForNeed(
  needId: string,
  onDeliveryUpdated?: (delivery: SupplierOutreachDelivery) => void
): Promise<SupplierOutreachDelivery[] | undefined> {
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
      updatedDeliveries.push(
        ...(await sendOutreachDelivery(delivery, invitation, need, onDeliveryUpdated))
      );
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

export function markInvitationViewed(
  token: string,
  currentTime = new Date()
): SupplierInvitation | undefined {
  const invitation = invitations.get(token);
  if (!invitation) {
    return undefined;
  }

  const previousStatus = invitation.status;
  if (expireInvitationIfNeeded(invitation, currentTime)) {
    if (invitation.status !== previousStatus) {
      commitMarketplaceMutation({
        eventType: "invitation.expired",
        actorType: "system",
        entityType: "invitation",
        entityId: invitation.id,
        metadata: { supplierId: invitation.supplierId }
      });
    }
    return invitation;
  }

  if (invitation.status === "sent" || invitation.status === "pending") {
    const openedAt = currentTime.toISOString();
    invitation.status = "opened";
    invitation.openedAt = openedAt;
    invitation.updatedAt = openedAt;
    commitMarketplaceMutation({
      eventType: "invitation.opened",
      actorType: "supplier",
      actorId: invitation.supplierId,
      entityType: "invitation",
      entityId: invitation.id,
      metadata: {}
    });
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
  },
  currentTime = new Date()
): SupplierResponseSubmissionResult {
  const invitation = invitations.get(token);
  if (!invitation) {
    return { status: "not_found" };
  }

  if (expireInvitationIfNeeded(invitation, currentTime)) {
    commitMarketplaceMutation({
      eventType: "invitation.expired",
      actorType: "system",
      entityType: "invitation",
      entityId: invitation.id,
      metadata: { supplierId: invitation.supplierId }
    });
    return { status: "expired" };
  }

  const need = needs.get(invitation.needId);
  if (!need || invitation.status === "cancelled") {
    return { status: "not_found" };
  }
  if (need.status !== "responses_open") {
    return { status: "closed" };
  }

  const existingResponse = [...responses.values()].find(
    (response) => response.needId === invitation.needId && response.supplierId === invitation.supplierId
  );
  if (existingResponse) {
    const updatedAt = currentTime.toISOString();
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
    existingResponse.conditions = [input.conditions];
    existingResponse.updatedAt = updatedAt;
    invitation.status = "responded";
    invitation.respondedAt = updatedAt;
    invitation.updatedAt = updatedAt;
    updateMatchResponseStatus(invitation, input.canHelp, updatedAt);
    commitMarketplaceMutation({
      eventType: "response.updated",
      actorType: "supplier",
      actorId: invitation.supplierId,
      entityType: "response",
      entityId: existingResponse.id,
      metadata: { decision: existingResponse.decision }
    });
    return { status: "submitted", supplierResponse: existingResponse };
  }

  const submittedAt = currentTime.toISOString();
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
    conditions: [input.conditions],
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
  commitMarketplaceMutation({
    eventType: "response.submitted",
    actorType: "supplier",
    actorId: invitation.supplierId,
    entityType: "response",
    entityId: response.id,
    metadata: { decision: response.decision }
  });
  return { status: "submitted", supplierResponse: response };
}

function updateMatchResponseStatus(invitation: SupplierInvitation, canHelp: boolean, updatedAt: string) {
  const need = needs.get(invitation.needId);
  const match = need?.matches.find((item) => item.supplier.id === invitation.supplierId);
  if (match) {
    match.status = canHelp ? "responded" : "declined";
    match.updatedAt = updatedAt;
  }
}

function expireInvitationIfNeeded(invitation: SupplierInvitation, currentTime: Date) {
  if (Date.parse(invitation.expiresAt) > currentTime.getTime()) {
    return false;
  }

  if (invitation.status !== "responded" && invitation.status !== "cancelled") {
    const expiredAt = currentTime.toISOString();
    invitation.status = "expired";
    invitation.updatedAt = expiredAt;
    const need = needs.get(invitation.needId);
    const match = need?.matches.find((item) => item.supplier.id === invitation.supplierId);
    if (match) {
      match.status = "expired";
      match.updatedAt = expiredAt;
    }
  }

  return true;
}

function deliveryKey(invitationId: string, channel: SupplierOutreachDelivery["channel"]) {
  return `${invitationId}:${channel}`;
}

function whatsappAddress(phoneNumber: string) {
  return phoneNumber.startsWith("whatsapp:") ? phoneNumber : `whatsapp:${phoneNumber}`;
}

async function sendOutreachDelivery(
  delivery: SupplierOutreachDelivery,
  invitation: SupplierInvitation,
  need: NeedRecord,
  onDeliveryUpdated?: (delivery: SupplierOutreachDelivery) => void
) {
  if (delivery.deliveryStatus === "sent") {
    return [{ ...delivery }];
  }

  delivery.deliveryStatus = "queued";
  delivery.errorMessage = undefined;
  updatedNeedTimestamp(need);
  const updates = [{ ...delivery }];
  commitMarketplaceMutation({
    eventType: "outreach.queued",
    actorType: "system",
    entityType: "outreach",
    entityId: deliveryKey(delivery.invitationId, delivery.channel),
    metadata: {
      channel: delivery.channel,
      supplierId: delivery.supplierId
    }
  });
  onDeliveryUpdated?.(updates[0]);

  const result = await sendSupplierOpportunity(delivery, invitation, need);
  const sentAt = new Date().toISOString();
  delivery.deliveryStatus = result.ok ? "sent" : "failed";
  delivery.sentAt = result.ok ? sentAt : undefined;
  delivery.errorMessage = result.ok ? undefined : result.errorMessage;
  updatedNeedTimestamp(need);
  updates.push({ ...delivery });
  commitMarketplaceMutation({
    eventType: result.ok ? "outreach.sent" : "outreach.failed",
    actorType: "system",
    entityType: "outreach",
    entityId: deliveryKey(delivery.invitationId, delivery.channel),
    metadata: {
      channel: delivery.channel,
      supplierId: delivery.supplierId,
      status: delivery.deliveryStatus
    }
  });
  onDeliveryUpdated?.(updates[1]);
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
}): EngagementCreationResult {
  const need = needs.get(input.needId);
  const supplierResponse = responses.get(input.supplierResponseId);
  if (!need || !supplierResponse || supplierResponse.needId !== input.needId) {
    return { status: "not_found" };
  }

  const existing = [...engagements.values()].find((engagement) => engagement.needId === input.needId);
  if (existing) {
    return existing.supplierResponseId === input.supplierResponseId
      ? { status: "existing", engagement: existing }
      : { status: "already_selected" };
  }

  if (
    supplierResponse.status !== "submitted" ||
    supplierResponse.decision !== "can_help" ||
    !supplierResponse.canHelp
  ) {
    return { status: "not_selectable" };
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
  commitMarketplaceMutation({
    eventType: "engagement.created",
    actorType: "buyer",
    entityType: "engagement",
    entityId: engagement.id,
    metadata: {
      needId: input.needId,
      supplierId: engagement.supplierId
    }
  });
  return { status: "created", engagement };
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

  commitMarketplaceMutation({
    eventType: "payment_link.created",
    actorType: "buyer",
    entityType: "payment",
    entityId: engagement.id,
    metadata: {
      paymentStatus: engagement.paymentStatus
    }
  });
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
    commitMarketplaceMutation({
      eventType: "payment.unmatched",
      actorType: "payment_provider",
      entityType: "payment",
      entityId: input.engagementId,
      metadata: { eventType: input.eventType }
    });
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

  commitMarketplaceMutation({
    eventType: "payment.secured",
    actorType: "payment_provider",
    entityType: "payment",
    entityId: engagement.id,
    metadata: {
      eventType: input.eventType,
      paymentStatus: engagement.paymentStatus
    }
  });
  return { engagement, duplicate: false };
}

export function resetMarketplaceStore(options: { preserveAudit?: boolean } = {}) {
  needs.clear();
  invitations.clear();
  outreachDeliveries.clear();
  responses.clear();
  engagements.clear();
  processedPinchEventIds.clear();
  pinchWebhookEvidence.clear();
  issuedBuyerAccessTokens.clear();
  if (!options.preserveAudit) {
    auditEvents.splice(0);
  }
  commitMarketplaceMutation({
    eventType: "marketplace.reset",
    actorType: "system",
    entityType: "need",
    entityId: "marketplace",
    metadata: {}
  });
}

function secureAccessToken() {
  return randomBytes(32).toString("base64url");
}

function accessTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function commitMarketplaceMutation(
  event: Omit<MarketplaceAuditEvent, "id" | "occurredAt">
) {
  auditEvents.push({
    ...event,
    id: randomUUID(),
    occurredAt: new Date().toISOString()
  });
  if (auditEvents.length > 1000) {
    auditEvents.splice(0, auditEvents.length - 1000);
  }
  persistMarketplaceState();
}

function persistMarketplaceState() {
  saveMarketplaceSnapshot(env.MARKETPLACE_DATA_FILE, {
    version: 1,
    needs: [...needs.values()],
    invitations: [...invitations.values()],
    outreachDeliveries: [...outreachDeliveries.values()],
    responses: [...responses.values()],
    engagements: [...engagements.values()],
    processedPinchEventIds: [...processedPinchEventIds],
    pinchWebhookEvidence: [...pinchWebhookEvidence.values()],
    auditEvents
  });
}
