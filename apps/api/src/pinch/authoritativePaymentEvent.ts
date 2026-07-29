import type {
  AuthoritativePaymentRecordResult,
  AuthoritativePinchEvidence
} from "../payments/commitmentPaymentService.js";

export type PinchWebhookPaymentEvent = {
  eventId: string;
  eventType: "realtime-payment" | "payment-created";
  engagementId: string;
  needProfileId?: string;
  supplierId?: string;
  milestoneId?: string;
  paymentId: string;
  amountMinor?: number;
  currency?: string;
  status: "approved";
};

export type ExpectedPinchCommitment = {
  engagementId: string;
  needProfileId: string;
  supplierId: string;
  milestoneId: string;
  amountMinor: number;
  currency: string;
};

export interface PinchWebhookAuthorityAdapter {
  // The canonical repository must persist the audit payload and event id atomically.
  recordAuthoritativePayment(
    evidence: AuthoritativePinchEvidence
  ): Promise<AuthoritativePaymentRecordResult>;
}

export class PinchWebhookPaymentProcessor {
  constructor(private readonly authority: PinchWebhookAuthorityAdapter) {}

  async processVerifiedPayload(payload: unknown) {
    const event = extractApprovedPinchPaymentEvent(payload);
    if (!event) {
      return {
        authoritative: false as const,
        processed: false,
        duplicate: false,
        supplierSecured: false
      };
    }

    const result = await this.authority.recordAuthoritativePayment({
      source: "pinch_webhook",
      eventId: event.eventId,
      eventType: event.eventType,
      engagementId: event.engagementId,
      paymentId: event.paymentId,
      providerStatus: event.status,
      payload
    });
    return {
      authoritative: true as const,
      processed: !result.duplicate,
      ...result
    };
  }
}

export function extractApprovedPinchPaymentEvent(
  payload: unknown
): PinchWebhookPaymentEvent | undefined {
  const eventId =
    getNestedString(payload, ["Id"]) ?? getNestedString(payload, ["id"]);
  const eventType =
    getNestedString(payload, ["Type"]) ?? getNestedString(payload, ["type"]);
  if (
    !eventId ||
    (eventType !== "realtime-payment" && eventType !== "payment-created")
  ) {
    return undefined;
  }

  const payment =
    getNestedObject(payload, ["Data", "Payment"]) ??
    getNestedObject(payload, ["data", "payment"]);
  if (!payment) {
    return undefined;
  }
  const status = (
    getNestedString(payment, ["Status"]) ??
    getNestedString(payment, ["status"]) ??
    ""
  ).toLowerCase();
  if (status !== "approved") {
    return undefined;
  }

  const paymentId =
    getNestedString(payment, ["Id"]) ?? getNestedString(payment, ["id"]);
  const metadata = parseMetadata(
    getNestedValue(payment, ["Metadata"]) ??
      getNestedValue(payment, ["metadata"])
  );
  const engagementId =
    getString(metadata.engagementId) ??
    getString(metadata.EngagementId) ??
    getString(metadata.engagement_id);
  const needProfileId =
    getString(metadata.needId) ??
    getString(metadata.NeedId) ??
    getString(metadata.need_id);
  const supplierId =
    getString(metadata.supplierId) ??
    getString(metadata.SupplierId) ??
    getString(metadata.supplier_id);
  const milestoneId =
    getString(metadata.milestoneId) ??
    getString(metadata.MilestoneId) ??
    getString(metadata.milestone_id);
  const commitmentType =
    getString(metadata.commitmentType) ??
    getString(metadata.CommitmentType) ??
    getString(metadata.commitment_type);
  const amountMinor =
    getInteger(getNestedValue(payment, ["Amount"])) ??
    getInteger(getNestedValue(payment, ["amount"]));
  const metadataAmountMinor =
    getInteger(metadata.commitmentAmountMinor) ??
    getInteger(metadata.CommitmentAmountMinor) ??
    getInteger(metadata.commitment_amount_minor);
  const currency = (
    getNestedString(payment, ["Currency"]) ??
    getNestedString(payment, ["currency"]) ??
    ""
  ).toUpperCase();
  const metadataCurrency = (
    getString(metadata.commitmentCurrency) ??
    getString(metadata.CommitmentCurrency) ??
    getString(metadata.commitment_currency) ??
    ""
  ).toUpperCase();
  const commitmentMetadataIsConsistent =
    (commitmentType === undefined ||
      commitmentType === "commercial_commitment") &&
    (amountMinor === undefined || amountMinor > 0) &&
    (metadataAmountMinor === undefined ||
      amountMinor === undefined ||
      metadataAmountMinor === amountMinor) &&
    (currency === "" || currency.length === 3) &&
    (metadataCurrency === "" ||
      currency === "" ||
      metadataCurrency === currency);
  if (!paymentId || !engagementId || !commitmentMetadataIsConsistent) {
    return undefined;
  }

  return {
    eventId,
    eventType,
    engagementId,
    ...(needProfileId ? { needProfileId } : {}),
    ...(supplierId ? { supplierId } : {}),
    ...(milestoneId ? { milestoneId } : {}),
    paymentId,
    ...(amountMinor === undefined ? {} : { amountMinor }),
    ...(currency === "" ? {} : { currency }),
    status: "approved"
  };
}

export function matchesExpectedPinchCommitment(
  event: PinchWebhookPaymentEvent,
  expected: ExpectedPinchCommitment
) {
  return (
    event.engagementId === expected.engagementId &&
    (event.needProfileId === undefined ||
      event.needProfileId === expected.needProfileId) &&
    (event.supplierId === undefined ||
      event.supplierId === expected.supplierId) &&
    (event.milestoneId === undefined ||
      event.milestoneId === expected.milestoneId) &&
    (event.amountMinor === undefined ||
      event.amountMinor === expected.amountMinor) &&
    (event.currency === undefined ||
      event.currency === expected.currency.toUpperCase())
  );
}

function parseMetadata(value: unknown): Record<string, unknown> {
  const parsed = parseJson(value);
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  if (!Array.isArray(parsed)) {
    return {};
  }
  return parsed.reduce<Record<string, unknown>>((metadata, item) => {
    if (typeof item === "object" && item !== null && !Array.isArray(item)) {
      Object.assign(metadata, item);
    }
    return metadata;
  }, {});
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function getNestedObject(
  payload: unknown,
  path: string[]
): Record<string, unknown> | undefined {
  const value = getNestedValue(payload, path);
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function getNestedString(payload: unknown, path: string[]) {
  return getString(getNestedValue(payload, path));
}

function getNestedValue(payload: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, payload);
}

function getString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function getInteger(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }
  return undefined;
}
