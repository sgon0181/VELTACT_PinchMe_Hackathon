import { isDeepStrictEqual } from "node:util";
import type {
  AuthoritativePaymentRecordResult,
  AuthoritativePinchEvidence
} from "../payments/commitmentPaymentService.js";

export type PinchWebhookPaymentEvent = {
  eventId: string;
  eventType: "realtime-payment" | "payment-created";
  engagementId: string;
  needProfileId: string;
  supplierId: string;
  milestoneId: string;
  paymentId: string;
  payerId: string;
  amountMinor: number;
  currency: string;
  status: "approved";
};

export type ExpectedPinchCommitment = {
  engagementId: string;
  needProfileId: string;
  supplierId: string;
  milestoneId: string;
  payerId: string;
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
  const payer =
    getNestedObject(payment, ["Payer"]) ??
    getNestedObject(payment, ["payer"]);
  const payerId = consistentString([
    getNestedString(payment, ["PayerId"]),
    getNestedString(payment, ["payerId"]),
    getNestedString(payer, ["Id"]),
    getNestedString(payer, ["id"])
  ]);
  const metadata = parseMetadata(
    getNestedValue(payment, ["Metadata"]) ??
      getNestedValue(payment, ["metadata"])
  );
  if (!metadata) {
    return undefined;
  }
  const engagementId = getAliasedString(metadata, [
    "engagementId",
    "EngagementId",
    "engagement_id"
  ]);
  const needProfileId = getAliasedString(metadata, [
    "needId",
    "NeedId",
    "need_id"
  ]);
  const supplierId = getAliasedString(metadata, [
    "supplierId",
    "SupplierId",
    "supplier_id"
  ]);
  const milestoneId = getAliasedString(metadata, [
    "milestoneId",
    "MilestoneId",
    "milestone_id"
  ]);
  const commitmentType = getAliasedString(metadata, [
    "commitmentType",
    "CommitmentType",
    "commitment_type"
  ]);
  const amountMinor = getAliasedInteger(payment, ["Amount", "amount"]);
  const metadataAmountMinor = getAliasedInteger(metadata, [
    "commitmentAmountMinor",
    "CommitmentAmountMinor",
    "commitment_amount_minor"
  ]);
  const currency = getAliasedString(
    payment,
    ["Currency", "currency"],
    (value) => value.toUpperCase()
  );
  const metadataCurrency = getAliasedString(
    metadata,
    [
      "commitmentCurrency",
      "CommitmentCurrency",
      "commitment_currency"
    ],
    (value) => value.toUpperCase()
  );
  if (
    !paymentId ||
    !payerId ||
    !engagementId ||
    !needProfileId ||
    !supplierId ||
    !milestoneId ||
    commitmentType !== "commercial_commitment" ||
    amountMinor === undefined ||
    amountMinor <= 0 ||
    metadataAmountMinor !== amountMinor ||
    currency === undefined ||
    currency.length !== 3 ||
    metadataCurrency !== currency
  ) {
    return undefined;
  }

  return {
    eventId,
    eventType,
    engagementId,
    needProfileId,
    supplierId,
    milestoneId,
    paymentId,
    payerId,
    amountMinor,
    currency,
    status: "approved"
  };
}

export function matchesExpectedPinchCommitment(
  event: PinchWebhookPaymentEvent,
  expected: ExpectedPinchCommitment
) {
  return (
    event.engagementId === expected.engagementId &&
    event.needProfileId === expected.needProfileId &&
    event.supplierId === expected.supplierId &&
    event.milestoneId === expected.milestoneId &&
    event.payerId === expected.payerId &&
    event.amountMinor === expected.amountMinor &&
    event.currency === expected.currency.toUpperCase()
  );
}

function parseMetadata(
  value: unknown
): Record<string, unknown> | undefined {
  const parsed = parseJson(value);
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  if (!Array.isArray(parsed)) {
    return undefined;
  }
  const metadata: Record<string, unknown> = {};
  for (const item of parsed) {
    if (typeof item === "object" && item !== null && !Array.isArray(item)) {
      for (const [key, itemValue] of Object.entries(item)) {
        if (
          key in metadata &&
          !isDeepStrictEqual(metadata[key], itemValue)
        ) {
          return undefined;
        }
        metadata[key] = itemValue;
      }
    }
  }
  return metadata;
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

function consistentString(values: Array<string | undefined>) {
  const present = values.filter(
    (value): value is string => value !== undefined && value.length > 0
  );
  return new Set(present).size === 1 ? present[0] : undefined;
}

function getAliasedString(
  record: Record<string, unknown>,
  keys: string[],
  normalise: (value: string) => string = (value) => value
) {
  return consistentString(
    keys.map((key) => {
      const value = getString(record[key]);
      return value === undefined ? undefined : normalise(value);
    })
  );
}

function getAliasedInteger(
  record: Record<string, unknown>,
  keys: string[]
) {
  const present = keys
    .map((key) => getInteger(record[key]))
    .filter((value): value is number => value !== undefined);
  return new Set(present).size === 1 ? present[0] : undefined;
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
