import { env } from "../env.js";
import type { NeedRecord, SupplierInvitation, SupplierOutreachDelivery } from "./types.js";

type DeliveryResult = { ok: true } | { ok: false; errorMessage: string };

export async function sendSupplierOpportunity(
  delivery: SupplierOutreachDelivery,
  invitation: SupplierInvitation,
  need: NeedRecord
): Promise<DeliveryResult> {
  if (!delivery.destination) {
    return { ok: false, errorMessage: `${delivery.channel.toUpperCase()} destination is not configured.` };
  }

  const message = supplierOpportunityMessage(invitation, need);
  if (delivery.channel === "email") {
    return sendEmail({
      to: delivery.destination,
      subject: `Veltact opportunity: ${need.profile.title}`,
      text: message
    });
  }

  return sendSms({
    to: delivery.destination,
    body: message
  });
}

function supplierOpportunityMessage(invitation: SupplierInvitation, need: NeedRecord) {
  const urgency = need.profile.urgencyDays ? `${need.profile.urgencyDays} day(s)` : "Not specified";
  const budget = need.profile.budgetAud ? `AUD ${need.profile.budgetAud.toLocaleString("en-AU")}` : "Not supplied";
  return [
    `Veltact supplier opportunity for ${invitation.supplierName}`,
    "",
    need.profile.title,
    need.profile.description,
    "",
    `Location: ${need.profile.location}`,
    `Urgency: ${urgency}`,
    `Budget: ${budget}`,
    "",
    `Respond here: ${invitation.responseUrl}`
  ].join("\n");
}

async function sendEmail(input: { to: string; subject: string; text: string }): Promise<DeliveryResult> {
  if (env.EMAIL_PROVIDER === "local_demo") {
    if (env.NODE_ENV === "production") {
      return { ok: false, errorMessage: "Production email provider is not configured." };
    }
    console.info(`[local-demo-email] Sent supplier opportunity to ${input.to}: ${input.subject}`);
    return { ok: true };
  }

  if (!env.EMAIL_FROM) {
    return { ok: false, errorMessage: "EMAIL_FROM is not configured." };
  }

  if (env.EMAIL_PROVIDER === "resend") {
    return sendResendEmail(input);
  }

  return sendSendGridEmail(input);
}

async function sendResendEmail(input: { to: string; subject: string; text: string }): Promise<DeliveryResult> {
  if (!env.RESEND_API_KEY) {
    return { ok: false, errorMessage: "RESEND_API_KEY is not configured." };
  }

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
    })
  });

  return providerResult(response, "Resend");
}

async function sendSendGridEmail(input: { to: string; subject: string; text: string }): Promise<DeliveryResult> {
  if (!env.SENDGRID_API_KEY) {
    return { ok: false, errorMessage: "SENDGRID_API_KEY is not configured." };
  }

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.SENDGRID_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: input.to }] }],
      from: { email: env.EMAIL_FROM },
      subject: input.subject,
      content: [{ type: "text/plain", value: input.text }]
    })
  });

  return providerResult(response, "SendGrid");
}

async function sendSms(input: { to: string; body: string }): Promise<DeliveryResult> {
  if (env.SMS_PROVIDER === "none") {
    return { ok: false, errorMessage: "SMS provider is not configured." };
  }
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER) {
    return { ok: false, errorMessage: "Twilio SMS credentials are not configured." };
  }

  const form = new URLSearchParams({
    To: input.to,
    From: env.TWILIO_FROM_NUMBER,
    Body: input.body
  });
  const token = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID)}/Messages.json`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${token}`,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: form
    }
  );

  return providerResult(response, "Twilio");
}

async function providerResult(response: Response, providerName: string): Promise<DeliveryResult> {
  if (response.ok) {
    return { ok: true };
  }

  const body = await response.text().catch(() => "");
  return {
    ok: false,
    errorMessage: `${providerName} rejected delivery (${response.status})${body ? `: ${body.slice(0, 240)}` : ""}`
  };
}
