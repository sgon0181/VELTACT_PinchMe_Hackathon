import type {
  AuthoritativePaymentRecordResult,
  AuthoritativePinchEvidence
} from "../payments/commitmentPaymentService.js";

export type PinchWebhookPaymentEvent = {
  eventId: string;
  eventType: "realtime-payment" | "payment-created";
  engagementId: string;
  paymentId: string;
  status: "approved";
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
  if (!paymentId || !engagementId) {
    return undefined;
  }

  return {
    eventId,
    eventType,
    engagementId,
    paymentId,
    status: "approved"
  };
}

function parseMetadata(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
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
