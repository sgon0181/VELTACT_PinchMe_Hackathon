import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { env } from "../env.js";
import {
  commitmentConfirmedEmailMessage,
  getOutreachDeliveryReadiness,
  redactOutreachError,
  sendCommitmentConfirmedEmail,
  sendSupplierOpportunity,
  sendSupplierOpportunitiesForChannels,
  supplierEmailHtml,
  supplierRfqUrl,
  supplierSmsMessage
} from "./outreachDelivery.js";
import {
  createNeed,
  listOutreachDeliveriesForNeed,
  resetMarketplaceStore
} from "./store.js";
import type {
  NeedRecord,
  SupplierInvitation,
  SupplierOutreachDelivery
} from "./types.js";

const originalFetch = globalThis.fetch;
let originalOutreachEnv: OutreachEnv;

beforeEach(() => {
  originalOutreachEnv = outreachEnv();
});

afterEach(() => {
  Object.assign(env, originalOutreachEnv);
  globalThis.fetch = originalFetch;
  resetMarketplaceStore();
});

describe("supplier outreach provider adapters", { concurrency: false }, () => {
  test("keeps local demo email explicitly unsent outside production", async () => {
    Object.assign(env, {
      NODE_ENV: "test",
      EMAIL_PROVIDER: "local_demo"
    });

    assert.deepEqual(
      await sendSupplierOpportunity(emailDelivery(), invitation(), need()),
      {
        ok: false,
        outcome: "local_demo",
        attempted: false,
        provider: "local_demo",
        errorMessage:
          "Local demo only: secure invitation generated; no external email was sent."
      }
    );

    Object.assign(env, { NODE_ENV: "production" });
    assert.deepEqual(
      await sendSupplierOpportunity(emailDelivery(), invitation(), need()),
      {
        ok: false,
        outcome: "not_configured",
        attempted: false,
        provider: "local_demo",
        errorMessage: "Production email provider is not configured."
      }
    );
  });

  test("sends the secure opportunity link through Resend", async () => {
    Object.assign(env, {
      EMAIL_PROVIDER: "resend",
      EMAIL_FROM: "Veltact <opportunities@veltact.test>",
      RESEND_API_KEY: "re_test_key"
    });
    let request: { url: string; init?: RequestInit } | undefined;
    globalThis.fetch = async (input, init) => {
      request = { url: String(input), init };
      return new Response(JSON.stringify({ id: "email_123" }), { status: 200 });
    };

    const result = await sendSupplierOpportunity(emailDelivery(), invitation(), need());

    assert.deepEqual(result, {
      ok: true,
      outcome: "sent",
      attempted: true,
      provider: "resend"
    });
    assert.equal(request?.url, "https://api.resend.com/emails");
    assert.equal(
      request?.init?.headers && new Headers(request.init.headers).get("authorization"),
      "Bearer re_test_key"
    );
    const body = JSON.parse(String(request?.init?.body));
    assert.equal(body.from, "Veltact <opportunities@veltact.test>");
    assert.deepEqual(body.to, ["supplier@example.com"]);
    assert.match(body.text, /https:\/\/demo\.veltact\.test\/supplier\.html\?token=token-123/);
    assert.match(body.text, /Download RFQ:/);
    assert.match(body.html, /Download RFQ PDF/);
    assert.match(body.html, /Review and respond/);
    assert.equal(
      supplierRfqUrl(invitation()),
      "https://demo.veltact.test/api/supplier-invitations/token-123/rfq.pdf"
    );
    assert.match(supplierEmailHtml(invitation(), need()), /RapidMatch/);
  });

  test("sends the secure link through SendGrid when configured", async () => {
    Object.assign(env, {
      EMAIL_PROVIDER: "sendgrid",
      EMAIL_FROM: "opportunities@veltact.test",
      SENDGRID_API_KEY: "sg_test_key"
    });
    let request: { url: string; init?: RequestInit } | undefined;
    globalThis.fetch = async (input, init) => {
      request = { url: String(input), init };
      return new Response(null, { status: 202 });
    };

    const result = await sendSupplierOpportunity(emailDelivery(), invitation(), need());

    assert.deepEqual(result, {
      ok: true,
      outcome: "sent",
      attempted: true,
      provider: "sendgrid"
    });
    assert.equal(request?.url, "https://api.sendgrid.com/v3/mail/send");
    const body = JSON.parse(String(request?.init?.body));
    assert.equal(body.personalizations[0].to[0].email, "supplier@example.com");
    assert.match(body.content[0].value, /Review and respond:/);
  });

  test("sends the secure opportunity link through Twilio SMS", async () => {
    Object.assign(env, {
      SMS_PROVIDER: "twilio",
      TWILIO_ACCOUNT_SID: "AC123",
      TWILIO_AUTH_TOKEN: "twilio_test_token",
      TWILIO_FROM_NUMBER: "+61400000000"
    });
    let request: { url: string; init?: RequestInit } | undefined;
    globalThis.fetch = async (input, init) => {
      request = { url: String(input), init };
      return new Response(JSON.stringify({ sid: "SM123", status: "queued" }), { status: 201 });
    };

    const result = await sendSupplierOpportunity(smsDelivery(), invitation(), need());

    assert.deepEqual(result, {
      ok: true,
      outcome: "sent",
      attempted: true,
      provider: "twilio_sms"
    });
    assert.equal(
      request?.url,
      "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json"
    );
    const body = new URLSearchParams(String(request?.init?.body));
    assert.equal(body.get("To"), "+61411111111");
    assert.equal(body.get("From"), "+61400000000");
    assert.match(
      body.get("Body") ?? "",
      /https:\/\/demo\.veltact\.test\/supplier\.html\?token=token-123/
    );
    assert.equal(body.get("Body"), supplierSmsMessage(invitation()));
    assert.ok((body.get("Body") ?? "").length <= 160);
  });

  test("attempts only buyer-selected channels and treats copy-link as no delivery", async () => {
    Object.assign(env, {
      EMAIL_PROVIDER: "resend",
      EMAIL_FROM: "Veltact <opportunities@veltact.test>",
      RESEND_API_KEY: "re_test_key",
      SMS_PROVIDER: "twilio",
      TWILIO_ACCOUNT_SID: "AC123",
      TWILIO_AUTH_TOKEN: "twilio_test_token",
      TWILIO_FROM_NUMBER: "+61400000000"
    });
    const providerUrls: string[] = [];
    globalThis.fetch = async (input) => {
      providerUrls.push(String(input));
      return String(input).includes("twilio")
        ? new Response(JSON.stringify({ sid: "SM123" }), { status: 201 })
        : new Response(JSON.stringify({ id: "email-123" }), { status: 200 });
    };
    const deliveries = [emailDelivery(), smsDelivery()];

    const smsOnly = await sendSupplierOpportunitiesForChannels(
      deliveries,
      invitation(),
      need(),
      ["sms"]
    );
    const copyLinkOnly = await sendSupplierOpportunitiesForChannels(
      deliveries,
      invitation(),
      need(),
      []
    );

    assert.deepEqual(
      smsOnly.map((item) => item.delivery.channel),
      ["sms"]
    );
    assert.equal(copyLinkOnly.length, 0);
    assert.deepEqual(providerUrls, [
      "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json"
    ]);
  });

  test("sends the secure opportunity link through the Twilio WhatsApp Sandbox", async () => {
    Object.assign(env, {
      SMS_PROVIDER: "twilio",
      TWILIO_ACCOUNT_SID: "AC123",
      TWILIO_AUTH_TOKEN: "twilio_test_token",
      TWILIO_WHATSAPP_FROM: "+14155238886"
    });
    let request: { url: string; init?: RequestInit } | undefined;
    globalThis.fetch = async (input, init) => {
      request = { url: String(input), init };
      return new Response(JSON.stringify({ sid: "SM123", status: "queued" }), { status: 201 });
    };

    const result = await sendSupplierOpportunity(whatsAppDelivery(), invitation(), need());

    assert.deepEqual(result, {
      ok: true,
      outcome: "sent",
      attempted: true,
      provider: "twilio_whatsapp"
    });
    assert.equal(
      request?.url,
      "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json"
    );
    const body = new URLSearchParams(String(request?.init?.body));
    assert.equal(body.get("To"), "whatsapp:+61411111111");
    assert.equal(body.get("From"), "whatsapp:+14155238886");
    assert.match(
      body.get("Body") ?? "",
      /https:\/\/demo\.veltact\.test\/supplier\.html\?token=token-123/
    );
  });

  test("creates WhatsApp destinations in the contract-compatible mobile delivery slot", () => {
    Object.assign(env, {
      SUPPLIER_OUTREACH_WHATSAPP_TO: "+61411111111"
    });

    const created = createNeed({
      buyerEmail: "buyer@example.com",
      profile: need().profile
    });
    const mobileDeliveries = listOutreachDeliveriesForNeed(created.id)?.filter(
      (delivery) => delivery.channel === "sms"
    );

    assert.equal(mobileDeliveries?.length, 3);
    assert.ok(
      mobileDeliveries?.every(
        (delivery) => delivery.destination === "whatsapp:+61411111111"
      )
    );
  });

  test("reports missing WhatsApp setup as not configured without attempting delivery", async () => {
    Object.assign(env, {
      SMS_PROVIDER: "twilio",
      TWILIO_ACCOUNT_SID: "AC123",
      TWILIO_AUTH_TOKEN: "twilio_test_token",
      TWILIO_WHATSAPP_FROM: undefined
    });

    assert.deepEqual(
      await sendSupplierOpportunity(whatsAppDelivery(), invitation(), need()),
      {
        ok: false,
        outcome: "not_configured",
        attempted: false,
        provider: "twilio_whatsapp",
        errorMessage: "Twilio WhatsApp credentials are not configured."
      }
    );
  });

  test("does not call a provider when delivery configuration is unavailable", async () => {
    Object.assign(env, {
      EMAIL_PROVIDER: "resend",
      EMAIL_FROM: "Veltact <opportunities@veltact.test>",
      RESEND_API_KEY: undefined
    });
    let providerCalled = false;
    globalThis.fetch = async () => {
      providerCalled = true;
      return new Response(null, { status: 200 });
    };

    assert.deepEqual(getOutreachDeliveryReadiness(emailDelivery()), {
      available: false,
      provider: "resend",
      reason: "RESEND_API_KEY is not configured."
    });
    assert.deepEqual(
      await sendSupplierOpportunity(emailDelivery(), invitation(), need()),
      {
        ok: false,
        outcome: "not_configured",
        attempted: false,
        provider: "resend",
        errorMessage: "RESEND_API_KEY is not configured."
      }
    );
    assert.equal(providerCalled, false);
  });

  test("returns failed only after provider rejection or a request error", async () => {
    Object.assign(env, {
      EMAIL_PROVIDER: "resend",
      EMAIL_FROM: "Veltact <opportunities@veltact.test>",
      RESEND_API_KEY: "re_test_key"
    });
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: "sender domain is not verified" }), { status: 422 });

    const rejected = await sendSupplierOpportunity(emailDelivery(), invitation(), need());
    assert.equal(rejected.ok, false);
    if (!rejected.ok) {
      assert.equal(rejected.outcome, "failed");
      assert.equal(rejected.attempted, true);
      assert.match(rejected.errorMessage, /Resend rejected delivery \(422\)/);
      assert.match(rejected.errorMessage, /sender domain is not verified/);
    }

    globalThis.fetch = async () => {
      throw new Error("provider connection unavailable");
    };
    const unavailable = await sendSupplierOpportunity(emailDelivery(), invitation(), need());
    assert.deepEqual(unavailable, {
      ok: false,
      outcome: "failed",
      attempted: true,
      provider: "resend",
      errorMessage: "Resend delivery request failed: provider connection unavailable"
    });
  });

  test("redacts invitation tokens and provider credentials from failure details", async () => {
    Object.assign(env, {
      EMAIL_PROVIDER: "resend",
      EMAIL_FROM: "Veltact <opportunities@veltact.test>",
      RESEND_API_KEY: "re_sensitive_key"
    });
    globalThis.fetch = async () =>
      new Response(
        `Rejected https://demo.veltact.test/supplier.html?token=private-token re_sensitive_key`,
        { status: 422 }
      );

    const result = await sendSupplierOpportunity(
      emailDelivery(),
      invitation(),
      need()
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.doesNotMatch(result.errorMessage, /private-token/);
      assert.doesNotMatch(result.errorMessage, /re_sensitive_key/);
      assert.match(result.errorMessage, /token=\[redacted\]/);
    }
    assert.equal(
      redactOutreachError(
        "https://example.test/supplier.html?token=another-private-token"
      ),
      "https://example.test/supplier.html?token=[redacted]"
    );
  });

  test("sends commitment confirmation with provider idempotency and no payout claim", async () => {
    Object.assign(env, {
      EMAIL_PROVIDER: "resend",
      EMAIL_FROM: "Veltact <opportunities@veltact.test>",
      RESEND_API_KEY: "re_test_key"
    });
    let request: { init?: RequestInit } | undefined;
    globalThis.fetch = async (_input, init) => {
      request = { init };
      return new Response(JSON.stringify({ id: "email-commitment" }), {
        status: 200
      });
    };

    const result = await sendCommitmentConfirmedEmail({
      destination: "supplier@example.com",
      supplierName: "Test Supplier",
      requirementTitle: "Packaging conveyor PLC recovery",
      responseUrl:
        "https://demo.veltact.test/supplier.html?token=token-123",
      securedAt: "2026-07-28T00:00:00.000Z",
      idempotencyKey: "commitment-engagement-123"
    });

    assert.equal(result.ok, true);
    const headers = new Headers(request?.init?.headers);
    assert.equal(
      headers.get("idempotency-key"),
      "commitment-engagement-123"
    );
    const body = JSON.parse(String(request?.init?.body));
    assert.match(body.text, /buyer commitment/i);
    assert.doesNotMatch(
      body.text,
      /supplier has been paid|payout complete/i
    );
    assert.doesNotMatch(
      commitmentConfirmedEmailMessage({
        supplierName: "Test Supplier",
        requirementTitle: "PLC recovery",
        responseUrl: "https://demo.veltact.test/supplier.html?token=token-123",
        securedAt: "2026-07-28T00:00:00.000Z"
      }),
      /supplier has been paid|payout complete/i
    );
  });
});

type OutreachEnv = Pick<
  typeof env,
  | "NODE_ENV"
  | "EMAIL_PROVIDER"
  | "EMAIL_FROM"
  | "RESEND_API_KEY"
  | "SENDGRID_API_KEY"
  | "SMS_PROVIDER"
  | "TWILIO_ACCOUNT_SID"
  | "TWILIO_AUTH_TOKEN"
  | "TWILIO_FROM_NUMBER"
  | "TWILIO_WHATSAPP_FROM"
  | "SUPPLIER_OUTREACH_WHATSAPP_TO"
>;

function outreachEnv(): OutreachEnv {
  return {
    NODE_ENV: env.NODE_ENV,
    EMAIL_PROVIDER: env.EMAIL_PROVIDER,
    EMAIL_FROM: env.EMAIL_FROM,
    RESEND_API_KEY: env.RESEND_API_KEY,
    SENDGRID_API_KEY: env.SENDGRID_API_KEY,
    SMS_PROVIDER: env.SMS_PROVIDER,
    TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: env.TWILIO_AUTH_TOKEN,
    TWILIO_FROM_NUMBER: env.TWILIO_FROM_NUMBER,
    TWILIO_WHATSAPP_FROM: env.TWILIO_WHATSAPP_FROM,
    SUPPLIER_OUTREACH_WHATSAPP_TO: env.SUPPLIER_OUTREACH_WHATSAPP_TO
  };
}

function emailDelivery(): SupplierOutreachDelivery {
  return {
    invitationId: "invitation-123",
    supplierId: "supplier-123",
    channel: "email",
    destination: "supplier@example.com",
    deliveryStatus: "not_sent"
  };
}

function smsDelivery(): SupplierOutreachDelivery {
  return {
    invitationId: "invitation-123",
    supplierId: "supplier-123",
    channel: "sms",
    destination: "+61411111111",
    deliveryStatus: "not_sent"
  };
}

function whatsAppDelivery(): SupplierOutreachDelivery {
  return {
    invitationId: "invitation-123",
    supplierId: "supplier-123",
    channel: "sms",
    destination: "whatsapp:+61411111111",
    deliveryStatus: "not_sent"
  };
}

function invitation(): SupplierInvitation {
  return {
    id: "invitation-123",
    token: "token-123",
    needId: "need-123",
    needProfileId: "need-123",
    supplierId: "supplier-123",
    supplierName: "Test Supplier",
    matchId: "match-123",
    responseUrl: "https://demo.veltact.test/supplier.html?token=token-123",
    status: "sent",
    sentAt: "2026-07-25T00:00:00.000Z",
    expiresAt: "2026-07-28T00:00:00.000Z",
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z"
  };
}

function need(): NeedRecord {
  return {
    id: "need-123",
    buyerEmail: "buyer@example.com",
    buyerAccessTokenHash: "test-access-token-hash",
    profile: {
      title: "Packaging conveyor PLC fault",
      description: "The line is stopped after an intermittent Siemens PLC fault.",
      category: "Industrial automation",
      industry: "Food manufacturing",
      location: "Western Sydney, NSW",
      urgencyDays: 1,
      budgetAud: 1800,
      requiredCapabilities: ["PLC diagnostics"]
    },
    matches: [],
    invitations: [],
    status: "responses_open",
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z"
  };
}
