import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { env } from "../env.js";
import { sendSupplierOpportunity } from "./outreachDelivery.js";
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
  test("sends the secure opportunity link through Resend", async () => {
    Object.assign(env, {
      EMAIL_PROVIDER: "resend",
      EMAIL_FROM: "Veltact <onboarding@resend.dev>",
      RESEND_API_KEY: "re_test_key"
    });
    let request: { url: string; init?: RequestInit } | undefined;
    globalThis.fetch = async (input, init) => {
      request = { url: String(input), init };
      return new Response(JSON.stringify({ id: "email_123" }), { status: 200 });
    };

    const result = await sendSupplierOpportunity(emailDelivery(), invitation(), need());

    assert.deepEqual(result, { ok: true });
    assert.equal(request?.url, "https://api.resend.com/emails");
    assert.equal(
      request?.init?.headers && new Headers(request.init.headers).get("authorization"),
      "Bearer re_test_key"
    );
    const body = JSON.parse(String(request?.init?.body));
    assert.equal(body.from, "Veltact <onboarding@resend.dev>");
    assert.deepEqual(body.to, ["sgon0181@uni.sydney.edu.au"]);
    assert.match(body.text, /https:\/\/demo\.veltact\.test\/supplier\.html\?token=token-123/);
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

    assert.deepEqual(result, { ok: true });
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

  test("fails WhatsApp honestly when its sender is not configured", async () => {
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
        errorMessage: "Twilio WhatsApp credentials are not configured."
      }
    );
  });

  test("converts provider network errors into failed delivery results", async () => {
    Object.assign(env, {
      EMAIL_PROVIDER: "resend",
      EMAIL_FROM: "Veltact <onboarding@resend.dev>",
      RESEND_API_KEY: "re_test_key"
    });
    globalThis.fetch = async () => {
      throw new Error("provider connection unavailable");
    };

    assert.deepEqual(
      await sendSupplierOpportunity(emailDelivery(), invitation(), need()),
      {
        ok: false,
        errorMessage: "Resend delivery request failed: provider connection unavailable"
      }
    );
  });
});

type OutreachEnv = Pick<
  typeof env,
  | "EMAIL_PROVIDER"
  | "EMAIL_FROM"
  | "RESEND_API_KEY"
  | "SMS_PROVIDER"
  | "TWILIO_ACCOUNT_SID"
  | "TWILIO_AUTH_TOKEN"
  | "TWILIO_FROM_NUMBER"
  | "TWILIO_WHATSAPP_FROM"
  | "SUPPLIER_OUTREACH_WHATSAPP_TO"
>;

function outreachEnv(): OutreachEnv {
  return {
    EMAIL_PROVIDER: env.EMAIL_PROVIDER,
    EMAIL_FROM: env.EMAIL_FROM,
    RESEND_API_KEY: env.RESEND_API_KEY,
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
    destination: "sgon0181@uni.sydney.edu.au",
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
