import type { SupplierCommitmentNotification } from "@veltact/contracts";
import { env } from "../env.js";
import {
  getOutreachDeliveryReadiness,
  sendCommitmentConfirmedEmail
} from "../marketplace/outreachDelivery.js";
import {
  getEngagement,
  getNeed,
  getSupplierCommitmentNotification,
  getSupplierClaim,
  listResponsesForNeed,
  saveSupplierCommitmentNotification
} from "../marketplace/store.js";
import type { SupplierOutreachDelivery } from "../marketplace/types.js";

type NotificationUpdated = (
  notification: SupplierCommitmentNotification
) => void;

const inFlight = new Map<
  string,
  Promise<SupplierCommitmentNotification | undefined>
>();

export function getCommitmentNotification(engagementId: string) {
  return getSupplierCommitmentNotification(engagementId);
}

export function notifyCommitmentConfirmed(
  engagementId: string,
  onUpdated?: NotificationUpdated
): Promise<SupplierCommitmentNotification | undefined> {
  const active = inFlight.get(engagementId);
  if (active) return active;

  const task = deliverCommitmentNotification(engagementId, onUpdated).finally(
    () => {
      inFlight.delete(engagementId);
    }
  );
  inFlight.set(engagementId, task);
  return task;
}

export function resetCommitmentNotificationsForTests() {
  inFlight.clear();
}

async function deliverCommitmentNotification(
  engagementId: string,
  onUpdated?: NotificationUpdated
) {
  const existing = getSupplierCommitmentNotification(engagementId);
  if (
    existing?.deliveryStatus === "sent" ||
    existing?.deliveryStatus === "queued"
  ) {
    // A persisted queued result has an ambiguous provider outcome after a
    // restart. Replaying it could duplicate SendGrid delivery.
    return structuredClone(existing);
  }

  const context = commitmentContext(engagementId);
  if (!context) return undefined;
  const now = new Date().toISOString();
  const notification = saveNotification({
    id: `commitment-notification-${context.engagement.id}`,
    engagementId: context.engagement.id,
    supplierId: context.engagement.supplierId,
    notificationType: "commitment_confirmed",
    channel: "email",
    destination: context.destination,
    deliveryStatus: "not_sent",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  });
  const readiness = getOutreachDeliveryReadiness(
    notificationAsOutreachDelivery(notification)
  );

  if (readiness.available && readiness.provider !== "local_demo") {
    notification.deliveryStatus = "queued";
    notification.errorMessage = undefined;
    notification.updatedAt = new Date().toISOString();
    saveAndEmit(notification, onUpdated);
  }

  const result = await sendCommitmentConfirmedEmail({
    destination: notification.destination,
    supplierName: context.engagement.supplierName,
    requirementTitle: context.need.profile.title,
    responseUrl: context.invitation.responseUrl,
    securedAt: context.securedAt,
    idempotencyKey: commitmentIdempotencyKey(
      context.engagement.id,
      context.securedAt
    )
  });
  const completedAt = new Date().toISOString();
  notification.deliveryStatus =
    result.outcome === "sent"
      ? "sent"
      : result.outcome === "failed"
        ? "failed"
        : "not_sent";
  notification.sentAt =
    result.outcome === "sent" ? completedAt : undefined;
  notification.errorMessage =
    result.outcome === "sent" ? undefined : result.errorMessage;
  notification.updatedAt = completedAt;
  return saveAndEmit(notification, onUpdated);
}

function commitmentContext(engagementId: string) {
  const engagement = getEngagement(engagementId);
  if (
    !engagement ||
    engagement.status !== "supplier_secured" ||
    engagement.paymentStatus !== "paid" ||
    engagement.paymentEvidenceProvider !== "pinch" ||
    engagement.paymentEvidenceAuthoritative !== true ||
    !engagement.securedAt
  ) {
    return undefined;
  }

  const need = getNeed(engagement.needId);
  const supplierResponse = listResponsesForNeed(engagement.needId)?.find(
    (response) => response.id === engagement.supplierResponseId
  );
  const invitation = need?.invitations.find(
    (candidate) => candidate.id === supplierResponse?.invitationId
  );
  if (!need || !supplierResponse || !invitation) return undefined;

  const claim = getSupplierClaim(invitation.token);
  const matchedSupplier = need.matches.find(
    (match) => match.supplier.id === engagement.supplierId
  )?.supplier;
  const destination =
    env.SUPPLIER_OUTREACH_EMAIL_TO ??
    claim?.claimantEmail ??
    matchedSupplier?.contactEmail;
  if (!destination) return undefined;

  return {
    engagement,
    need,
    invitation,
    destination,
    securedAt: engagement.securedAt
  };
}

function notificationAsOutreachDelivery(
  notification: SupplierCommitmentNotification
): SupplierOutreachDelivery {
  return {
    invitationId: notification.engagementId,
    supplierId: notification.supplierId,
    channel: "email",
    destination: notification.destination,
    deliveryStatus: notification.deliveryStatus,
    sentAt: notification.sentAt,
    errorMessage: notification.errorMessage
  };
}

function saveAndEmit(
  notification: SupplierCommitmentNotification,
  onUpdated?: NotificationUpdated
) {
  const saved = saveNotification(notification);
  onUpdated?.(structuredClone(saved));
  return structuredClone(saved);
}

function saveNotification(
  notification: SupplierCommitmentNotification
) {
  return saveSupplierCommitmentNotification(notification);
}

function commitmentIdempotencyKey(
  engagementId: string,
  securedAt: string
) {
  return `veltact-commitment-${engagementId}-${securedAt}`.replace(
    /[^a-zA-Z0-9_-]/g,
    "-"
  );
}
