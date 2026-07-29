import { env } from "../env.js";
import type { OutreachChannel } from "@veltact/contracts";
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
      outcome: "local_demo";
      attempted: false;
      provider: "local_demo";
      errorMessage: string;
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

export type SelectedOutreachDelivery = {
  delivery: SupplierOutreachDelivery;
  result: DeliveryResult;
};

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
  if (env.SMS_PROVIDER === "local_demo") {
    return env.NODE_ENV === "production"
      ? unavailable(provider, "Production SMS provider is not configured.")
      : { available: true, provider };
  }
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
        html: supplierEmailHtml(invitation, need),
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

export function selectOutreachDeliveries(
  deliveries: readonly SupplierOutreachDelivery[],
  deliveryChannels: readonly OutreachChannel[] | undefined
) {
  if (deliveryChannels === undefined) {
    return [...deliveries];
  }
  const selected = new Set(deliveryChannels);
  return deliveries.filter((delivery) => selected.has(delivery.channel));
}

export async function sendSupplierOpportunitiesForChannels(
  deliveries: readonly SupplierOutreachDelivery[],
  invitation: SupplierInvitation,
  need: NeedRecord,
  deliveryChannels: readonly OutreachChannel[] | undefined
): Promise<SelectedOutreachDelivery[]> {
  return Promise.all(
    selectOutreachDeliveries(deliveries, deliveryChannels).map(
      async (delivery) => ({
        delivery,
        result: await sendSupplierOpportunity(delivery, invitation, need)
      })
    )
  );
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
    `Download RFQ: ${supplierRfqUrl(invitation)}`,
    "",
    "Veltact matched this request using reviewed catalogue or public-source evidence.",
    "That evidence indicates relevance only; it is not identity, licence, KYC or availability verification.",
    "Ignore this message to decline. Reply STOP or contact the sender to opt out of future Veltact outreach."
  ].join("\n");
}

export function supplierEmailHtml(
  invitation: SupplierInvitation,
  need: NeedRecord
) {
  const urgency = need.profile.urgencyDays
    ? `${need.profile.urgencyDays} day(s)`
    : "Not specified";
  const budget = need.profile.budgetAud
    ? `AUD ${need.profile.budgetAud.toLocaleString("en-AU")}`
    : "Not supplied";
  const responseUrl = escapeHtml(invitation.responseUrl);
  const rfqUrl = escapeHtml(supplierRfqUrl(invitation));
  return [
    '<div style="margin:0;background:#f4f5f2;padding:32px 16px;color:#17201d;font-family:Arial,sans-serif">',
    '<div style="max-width:640px;margin:0 auto;background:#ffffff;border-top:4px solid #9f2730;padding:28px">',
    '<p style="margin:0 0 8px;color:#9f2730;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Veltact RapidMatch</p>',
    `<h1 style="margin:0 0 12px;font-size:26px;line-height:1.15">${escapeHtml(need.profile.title)}</h1>`,
    '<p style="margin:0 0 22px;color:#52605b;line-height:1.55">A buyer reviewed your capability evidence and approved this private supplier opportunity. No Veltact account or marketplace profile has been created for you.</p>',
    '<table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 22px">',
    emailFact("Location", need.profile.location),
    emailFact("Urgency", urgency),
    emailFact("Indicative budget", budget),
    emailFact("Respond by", invitation.expiresAt),
    "</table>",
    `<p style="margin:0 0 22px;color:#26322e;line-height:1.55">${escapeHtml(need.profile.description)}</p>`,
    `<p style="margin:0 0 12px"><a href="${responseUrl}" style="display:inline-block;background:#9f2730;color:#ffffff;padding:13px 18px;text-decoration:none;font-weight:700">Review and respond</a></p>`,
    `<p style="margin:0 0 24px"><a href="${rfqUrl}" style="color:#1c675e;font-weight:700">Download RFQ PDF</a></p>`,
    '<p style="margin:0;color:#6b7773;font-size:12px;line-height:1.5">Matched from reviewed catalogue or public-source evidence. Relevance is not identity, licence, KYC or availability verification. Ignore this message to decline.</p>',
    "</div>",
    "</div>"
  ].join("");
}

export function supplierSmsMessage(invitation: SupplierInvitation) {
  return `Veltact RFQ: review and respond privately ${invitation.responseUrl}`;
}

export function supplierRfqUrl(invitation: SupplierInvitation) {
  const rfqUrl = new URL(invitation.responseUrl);
  rfqUrl.pathname = `/api/supplier-invitations/${encodeURIComponent(
    invitation.token
  )}/rfq.pdf`;
  rfqUrl.search = "";
  rfqUrl.hash = "";
  return rfqUrl.toString();
}

export async function sendCommitmentConfirmedEmail(input: {
  destination: string;
  supplierName: string;
  requirementTitle: string;
  responseUrl: string;
  securedAt: string;
  idempotencyKey: string;
}): Promise<DeliveryResult> {
  const delivery: SupplierOutreachDelivery = {
    invitationId: input.idempotencyKey,
    supplierId: input.supplierName,
    channel: "email",
    destination: input.destination,
    deliveryStatus: "not_sent"
  };
  const readiness = getOutreachDeliveryReadiness(delivery);
  if (!readiness.available) {
    return notConfigured(readiness.provider, readiness.reason);
  }

  const text = commitmentConfirmedEmailMessage(input);
  try {
    return await sendEmail({
      to: input.destination,
      subject: `Commitment confirmed: ${input.requirementTitle}`,
      text,
      html: commitmentConfirmedEmailHtml(input),
      idempotencyKey: input.idempotencyKey,
      provider: readiness.provider
    });
  } catch (error) {
    return failed(
      readiness.provider,
      `${providerLabel(readiness.provider)} delivery request failed: ${providerErrorMessage(error)}`
    );
  }
}

export function commitmentConfirmedEmailMessage(input: {
  supplierName: string;
  requirementTitle: string;
  responseUrl: string;
  securedAt: string;
}) {
  return [
    `Veltact commitment confirmed for ${input.supplierName}`,
    "",
    `Requirement: ${input.requirementTitle}`,
    `Confirmed: ${input.securedAt}`,
    "",
    "The buyer commitment has been confirmed by authoritative backend payment evidence.",
    "Your company is the selected supplier for the next agreed scoping or assessment step.",
    `Review the submitted response: ${input.responseUrl}`,
    "",
    "This confirms buyer commitment only. It is not a supplier payout notice and does not mark engineering work complete."
  ].join("\n");
}

async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  idempotencyKey?: string;
  provider: OutreachProvider;
}): Promise<DeliveryResult> {
  if (input.provider === "local_demo") {
    console.info(
      `[local-demo-email] Prepared email without external delivery: ${input.subject}`
    );
    return localDemo("email");
  }

  if (input.provider === "resend") {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
        ...(input.idempotencyKey
          ? { "Idempotency-Key": input.idempotencyKey }
          : {})
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {})
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
      content: [
        { type: "text/plain", value: input.text },
        ...(input.html
          ? [{ type: "text/html", value: input.html }]
          : [])
      ],
      ...(input.idempotencyKey
        ? {
            custom_args: {
              veltact_idempotency_key: input.idempotencyKey
            }
          }
        : {})
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
  if (input.provider === "local_demo") {
    console.info(
      `[local-demo-sms] Prepared SMS without external delivery: ${input.body}`
    );
    return localDemo("SMS");
  }

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

function commitmentConfirmedEmailHtml(input: {
  supplierName: string;
  requirementTitle: string;
  responseUrl: string;
  securedAt: string;
}) {
  return [
    '<div style="margin:0;background:#f4f5f2;padding:32px 16px;color:#17201d;font-family:Arial,sans-serif">',
    '<div style="max-width:640px;margin:0 auto;background:#ffffff;border-top:4px solid #1c675e;padding:28px">',
    '<p style="margin:0 0 8px;color:#1c675e;font-size:12px;font-weight:700;text-transform:uppercase">Veltact commitment confirmed</p>',
    `<h1 style="margin:0 0 12px;font-size:26px;line-height:1.15">${escapeHtml(input.requirementTitle)}</h1>`,
    `<p style="margin:0 0 20px;color:#52605b;line-height:1.55">Hello ${escapeHtml(input.supplierName)}. Authoritative backend payment evidence confirms the buyer commitment for the next agreed scoping or assessment step.</p>`,
    `<p style="margin:0 0 20px"><a href="${escapeHtml(input.responseUrl)}" style="display:inline-block;background:#1c675e;color:#ffffff;padding:13px 18px;text-decoration:none;font-weight:700">Review submitted response</a></p>`,
    `<p style="margin:0 0 20px;color:#6b7773;font-size:13px">Confirmed ${escapeHtml(input.securedAt)}</p>`,
    '<p style="margin:0;color:#6b7773;font-size:12px;line-height:1.5">This confirms buyer commitment only. It is not a supplier payout notice and does not mark engineering work complete.</p>',
    "</div>",
    "</div>"
  ].join("");
}

function emailFact(label: string, value: string) {
  return `<tr><td style="border-top:1px solid #dfe4e1;padding:9px 0;color:#6b7773;font-size:12px">${escapeHtml(label)}</td><td style="border-top:1px solid #dfe4e1;padding:9px 0;text-align:right;font-weight:700">${escapeHtml(value)}</td></tr>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function deliveryProvider(
  delivery: SupplierOutreachDelivery
): OutreachProvider {
  if (delivery.channel === "sms") {
    if (env.SMS_PROVIDER === "local_demo") return "local_demo";
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
    local_demo: "Local demo outreach",
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

function localDemo(channel: "email" | "SMS"): DeliveryResult {
  return {
    ok: false,
    outcome: "local_demo",
    attempted: false,
    provider: "local_demo",
    errorMessage:
      `Local demo only: secure invitation generated; no external ${channel} was sent.`
  };
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
