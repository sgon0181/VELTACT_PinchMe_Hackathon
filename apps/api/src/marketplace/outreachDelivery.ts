import { env } from "../env.js";
import type { NeedRecord, SupplierInvitation, SupplierOutreachDelivery } from "./types.js";

export type DeliveryResult =
  | {
      ok: true;
      outcome: "sent";
      attempted: true;
      provider: OutreachProvider;
    }
  | {
      ok: false;
      outcome: "not_configured";
      attempted: false;
      provider: OutreachProvider;
      errorMessage: string;
    }
  | {
      ok: false;
      outcome: "failed";
      attempted: true;
      provider: OutreachProvider;
      errorMessage: string;
    };

export type OutreachDeliveryReadiness =
  | {
      available: true;
      provider: OutreachProvider;
    }
  | {
      available: false;
      provider: OutreachProvider;
      reason: string;
    };

type OutreachProvider =
  | "local_demo"
  | "resend"
  | "sendgrid"
  | "twilio_sms"
  | "twilio_whatsapp";

const providerTimeoutMs = 10_000;

export function getOutreachDeliveryReadiness(
  delivery: SupplierOutreachDelivery
): OutreachDeliveryReadiness {
  const provider = deliveryProvider(delivery);
  if (!delivery.destination.trim()) {
    return unavailable(provider, `${channelLabel(delivery)} destination is not configured.`);
  }

  if (delivery.channel === "email") {
    if (env.EMAIL_PROVIDER === "local_demo") {
      return env.NODE_ENV === "production"
        ? unavailable(provider, "Production email provider is not configured.")
        : { available: true, provider };
    }
    if (!env.EMAIL_FROM) {
      return unavailable(provider, "EMAIL_FROM is not configured.");
    }
    if (env.EMAIL_PROVIDER === "resend" && !env.RESEND_API_KEY) {
      return unavailable(provider, "RESEND_API_KEY is not configured.");
    }
    if (env.EMAIL_PROVIDER === "sendgrid" && !env.SENDGRID_API_KEY) {
      return unavailable(provider, "SENDGRID_API_KEY is not configured.");
    }
    return { available: true, provider };
  }

  const isWhatsApp = delivery.destination.startsWith("whatsapp:");
  if (env.SMS_PROVIDER === "none") {
    return unavailable(provider, `${isWhatsApp ? "WhatsApp" : "SMS"} provider is not configured.`);
  }

  const from = isWhatsApp ? env.TWILIO_WHATSAPP_FROM : env.TWILIO_FROM_NUMBER;
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !from) {
    return unavailable(
      provider,
      `Twilio ${isWhatsApp ? "WhatsApp" : "SMS"} credentials are not configured.`
    );
  }

  return { available: true, provider };
}

/**
 * Callers must leave the contract delivery status as `not_sent` when the
 * outcome is `not_configured`; only an attempted `failed` outcome is a failure.
 */
export async function sendSupplierOpportunity(
  delivery: SupplierOutreachDelivery,
  invitation: SupplierInvitation,
  need: NeedRecord
): Promise<DeliveryResult> {
  const readiness = getOutreachDeliveryReadiness(delivery);
  if (!readiness.available) {
    return notConfigured(readiness.provider, readiness.reason);
  }

  try {
    if (delivery.channel === "email") {
      return await sendEmail({
        to: delivery.destination,
        subject: `Veltact opportunity: ${need.profile.title}`,
        text: supplierEmailMessage(invitation, need),
        provider: readiness.provider
      });
    }

    const isWhatsApp = delivery.destination.startsWith("whatsapp:");
    return await sendTwilioMessage({
      to: delivery.destination,
      body: isWhatsApp
        ? supplierEmailMessage(invitation, need)
        : supplierSmsMessage(invitation),
      provider: readiness.provider
    });
  } catch (error) {
    return failed(
      readiness.provider,
      `${providerLabel(readiness.provider)} delivery request failed: ${providerErrorMessage(error)}`
    );
  }
}

export function supplierEmailMessage(
  invitation: SupplierInvitation,
  need: NeedRecord
) {
  const urgency = need.profile.urgencyDays
    ? `${need.profile.urgencyDays} day(s)`
    : "Not specified";
  const budget = need.profile.budgetAud
    ? `AUD ${need.profile.budgetAud.toLocaleString("en-AU")}`
    : "Not supplied";
  return [
    `Veltact supplier opportunity for ${invitation.supplierName}`,
    "",
    "A buyer reviewed your capability evidence and approved this private opportunity.",
    "No Veltact account or marketplace profile has been created for you.",
    "",
    need.profile.title,
    need.profile.description,
    "",
    `Location: ${need.profile.location}`,
    `Urgency: ${urgency}`,
    `Budget: ${budget}`,
    `Invitation expires: ${invitation.expiresAt}`,
    "",
    `Review and respond: ${invitation.responseUrl}`,
    "",
    "Veltact matched this request using reviewed catalogue or public-source evidence.",
    "That evidence indicates relevance only; it is not identity, licence, KYC or availability verification.",
    "Ignore this message to decline. Reply STOP or contact the sender to opt out of future Veltact outreach."
  ].join("\n");
}

export function supplierSmsMessage(invitation: SupplierInvitation) {
  return `Veltact private supplier opportunity: ${invitation.responseUrl}`;
}

async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  provider: OutreachProvider;
}): Promise<DeliveryResult> {
  if (input.provider === "local_demo") {
    console.info(
      `[local-demo-email] Provider accepted supplier opportunity: ${input.subject}`
    );
    return sent(input.provider);
  }

  if (input.provider === "resend") {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [input.to],
        subject: input.subject,
        text: input.text
      }),
      signal: AbortSignal.timeout(providerTimeoutMs)
    });
    return providerResult(response, input.provider);
  }

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.SENDGRID_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: input.to }] }],
      from: sendGridFrom(env.EMAIL_FROM ?? ""),
      subject: input.subject,
      content: [{ type: "text/plain", value: input.text }]
    }),
    signal: AbortSignal.timeout(providerTimeoutMs)
  });
  return providerResult(response, input.provider);
}

async function sendTwilioMessage(input: {
  to: string;
  body: string;
  provider: OutreachProvider;
}): Promise<DeliveryResult> {
  const isWhatsApp = input.provider === "twilio_whatsapp";
  const from = isWhatsApp ? env.TWILIO_WHATSAPP_FROM : env.TWILIO_FROM_NUMBER;
  const form = new URLSearchParams({
    To: input.to,
    From: isWhatsApp ? whatsappAddress(from ?? "") : from ?? "",
    Body: input.body
  });
  const token = Buffer.from(
    `${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`
  ).toString("base64");
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
      env.TWILIO_ACCOUNT_SID ?? ""
    )}/Messages.json`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${token}`,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: form,
      signal: AbortSignal.timeout(providerTimeoutMs)
    }
  );
  return providerResult(response, input.provider);
}

async function providerResult(
  response: Response,
  provider: OutreachProvider
): Promise<DeliveryResult> {
  if (response.ok) {
    return sent(provider);
  }

  const body = await response.text().catch(() => "");
  const detail = body ? `: ${redactOutreachError(body.slice(0, 240))}` : "";
  return failed(
    provider,
    `${providerLabel(provider)} rejected delivery (${response.status})${detail}`
  );
}

export function redactOutreachError(value: string) {
  let redacted = value.replace(
    /([?&]token=)[^&\s"'<>]+/gi,
    "$1[redacted]"
  );
  const secrets = [
    env.RESEND_API_KEY,
    env.SENDGRID_API_KEY,
    env.TWILIO_AUTH_TOKEN,
    env.TWILIO_ACCOUNT_SID
  ].filter((secret): secret is string => Boolean(secret && secret.length >= 6));

  for (const secret of secrets) {
    redacted = redacted.split(secret).join("[redacted]");
  }
  return redacted;
}

function sendGridFrom(value: string) {
  const displayAddress = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return displayAddress
    ? {
        email: displayAddress[2],
        name: displayAddress[1] || undefined
      }
    : { email: value };
}

function whatsappAddress(phoneNumber: string) {
  return phoneNumber.startsWith("whatsapp:")
    ? phoneNumber
    : `whatsapp:${phoneNumber}`;
}

function deliveryProvider(
  delivery: SupplierOutreachDelivery
): OutreachProvider {
  if (delivery.channel === "sms") {
    return delivery.destination.startsWith("whatsapp:")
      ? "twilio_whatsapp"
      : "twilio_sms";
  }
  return env.EMAIL_PROVIDER;
}

function channelLabel(delivery: SupplierOutreachDelivery) {
  if (delivery.channel === "email") return "Email";
  return delivery.destination.startsWith("whatsapp:") ? "WhatsApp" : "SMS";
}

function providerLabel(provider: OutreachProvider) {
  const labels: Record<OutreachProvider, string> = {
    local_demo: "Local demo email",
    resend: "Resend",
    sendgrid: "SendGrid",
    twilio_sms: "Twilio SMS",
    twilio_whatsapp: "Twilio WhatsApp"
  };
  return labels[provider];
}

function providerErrorMessage(error: unknown) {
  if (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return "request timed out";
  }
  if (error instanceof Error && error.message.trim()) {
    return redactOutreachError(error.message.trim().slice(0, 240));
  }
  return "network request failed";
}

function sent(provider: OutreachProvider): DeliveryResult {
  return { ok: true, outcome: "sent", attempted: true, provider };
}

function unavailable(
  provider: OutreachProvider,
  reason: string
): OutreachDeliveryReadiness {
  return { available: false, provider, reason };
}

function notConfigured(
  provider: OutreachProvider,
  errorMessage: string
): DeliveryResult {
  return {
    ok: false,
    outcome: "not_configured",
    attempted: false,
    provider,
    errorMessage
  };
}

function failed(
  provider: OutreachProvider,
  errorMessage: string
): DeliveryResult {
  return {
    ok: false,
    outcome: "failed",
    attempted: true,
    provider,
    errorMessage
  };
}
