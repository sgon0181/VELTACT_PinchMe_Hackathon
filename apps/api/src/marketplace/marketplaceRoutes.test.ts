import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { rapidMatchSocketEvent } from "@veltact/contracts";
import { io as createSocketClient, type Socket } from "socket.io-client";
import { app } from "../app.js";
import {
  resetPaymentProviderForTest,
  setPaymentProviderForTest
} from "../payments/providerRegistry.js";
import { attachRealtime } from "../realtime.js";
import { resetMarketplaceStore } from "./store.js";

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  resetMarketplaceStore();
  process.env.PINCH_WEBHOOK_SECRET = "whsec_test_secret";
  setPaymentProviderForTest({
    async createHostedPaymentLink(input) {
      return {
        provider: "pinch",
        payerId: `pyr_${input.engagementId}`,
        paymentLinkId: `plink_${input.engagementId}`,
        hostedCheckoutUrl: `https://sandbox.getpinch.com.au/pay/${input.engagementId}`
      };
    }
  });
  server = createServer(app);
  attachRealtime(server);
  server.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  resetPaymentProviderForTest();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
});

describe("marketplace core routes", () => {
  test("creates and retrieves a need with deterministic explainable matches and invitation tokens", async () => {
    const created = await postJson("/api/needs", {
      buyerEmail: "buyer@example.com",
      profile: automationNeed()
    });

    assert.equal(created.status, 201);
    assert.equal(created.body.need.profile.title, "Urgent PLC automation fault");
    assert.equal(created.body.need.matches.length, 3);
    assert.deepEqual(
      created.body.need.matches.map((match: { supplierId: string }) => match.supplierId),
      ["supplier-automation-nsw", "supplier-robotics-vic", "supplier-electrical-qld"]
    );
    assert.match(created.body.need.matches[0].explanation.join(" "), /Matched capabilities/);
    assert.equal(created.body.need.invitations.length, 3);
    assert.ok(created.body.need.invitations[0].token);

    const retrieved = await getJson(`/api/needs/${created.body.need.id}`);

    assert.equal(retrieved.status, 200);
    assert.deepEqual(retrieved.body.need.matches, created.body.need.matches);
    assert.deepEqual(retrieved.body.need.invitations, created.body.need.invitations);
  });

  test("accepts supplier responses through invitation token and exposes standardised buyer responses", async () => {
    const created = await postJson("/api/needs", {
      buyerEmail: "buyer@example.com",
      profile: automationNeed()
    });
    const token = created.body.need.invitations[0].token;

    const invitation = await getJson(`/api/supplier-invitations/${token}`);

    assert.equal(invitation.status, 200);
    assert.equal(invitation.body.invitation.supplierId, "supplier-automation-nsw");
    assert.equal(invitation.body.invitation.status, "viewed");
    assert.ok(invitation.body.invitation.viewedAt);
    assert.equal(invitation.body.need.id, created.body.need.id);

    const submitted = await postJson(`/api/supplier-invitations/${token}/responses`, {
      canHelp: true,
      earliestAvailability: "2026-07-28",
      indicativePriceAud: 18500,
      relevantExperience: "Completed urgent PLC and SCADA recovery for a packaging line.",
      conditions: "Remote diagnostics required before site attendance."
    });

    assert.equal(submitted.status, 201);
    assert.deepEqual(submitted.body.supplierResponse, submitted.body.response);
    assert.equal(submitted.body.response.supplierId, "supplier-automation-nsw");
    assert.equal(submitted.body.response.canHelp, true);

    const responses = await getJson(`/api/needs/${created.body.need.id}/responses`);

    assert.equal(responses.status, 200);
    assert.deepEqual(responses.body.responses, [submitted.body.response]);
  });

  test("emits realtime buyer updates when a supplier response is submitted", async () => {
    const created = await postJson("/api/needs", {
      buyerEmail: "buyer@example.com",
      profile: automationNeed()
    });
    const needProfileId = created.body.need.id;
    const token = created.body.need.invitations[0].token;
    const client = await connectSocket();
    const updatePromise = onceSocket(client, rapidMatchSocketEvent.supplierResponseSubmitted);

    client.emit(rapidMatchSocketEvent.joinNeedProfile, { needProfileId });
    await wait(25);

    const submitted = await postJson(`/api/supplier-invitations/${token}/responses`, {
      canHelp: false,
      earliestAvailability: "2026-07-30",
      indicativePriceAud: 0,
      relevantExperience: "Team is already committed to another outage response.",
      conditions: "Can review future commissioning needs after next week."
    });
    const update = await updatePromise;

    client.close();
    assert.equal(submitted.status, 201);
    assert.equal(update.needProfileId, needProfileId);
    assert.deepEqual(update.supplierResponse, submitted.body.supplierResponse);
  });

  test("rejects malformed needs and unknown supplier invitation tokens", async () => {
    const invalidNeed = await postJson("/api/needs", {
      buyerEmail: "not-an-email",
      profile: {}
    });
    const missingInvitation = await getJson("/api/supplier-invitations/not-real");

    assert.equal(invalidNeed.status, 400);
    assert.equal(invalidNeed.body.status, "error");
    assert.equal(missingInvitation.status, 404);
  });

  test("creates hosted payment link and secures only after verified Pinch event", async () => {
    const created = await postJson("/api/needs", {
      buyerEmail: "buyer@example.com",
      profile: automationNeed()
    });
    const token = created.body.need.invitations[0].token;
    const submitted = await postJson(`/api/supplier-invitations/${token}/responses`, {
      canHelp: true,
      earliestAvailability: "2026-07-28",
      indicativePriceAud: 18500,
      relevantExperience: "Completed urgent PLC and SCADA recovery for a packaging line.",
      conditions: "Remote diagnostics required before site attendance."
    });

    const selected = await postJson(`/api/need-profiles/${created.body.need.id}/engagements`, {
      supplierResponseId: submitted.body.response.id
    });
    assert.equal(selected.status, 201);
    assert.equal(selected.body.engagement.paymentStatus, "not_started");

    const paymentLink = await postJson(
      `/api/engagements/${selected.body.engagement.id}/payment-link`,
      {}
    );
    assert.equal(paymentLink.status, 201);
    assert.equal(paymentLink.body.engagement.status, "payment_link_created");
    assert.equal(paymentLink.body.engagement.paymentStatus, "link_created");
    assert.match(paymentLink.body.hostedCheckoutUrl, /^https:\/\/sandbox\.getpinch\.com\.au/);

    const returned = await fetch(`${baseUrl}/api/pinch/return/${selected.body.engagement.id}`);
    const returnText = await returned.text();
    assert.equal(returned.status, 200);
    assert.match(returnText, /does not confirm payment success/);

    const eventPayload = {
      Id: "evt_payment_approved",
      Type: "realtime-payment",
      EventDate: new Date().toISOString(),
      Data: {
        Payment: {
          Id: "pmt_approved",
          Status: "approved",
          Metadata: JSON.stringify({
            engagementId: selected.body.engagement.id
          })
        }
      }
    };

    const webhook = await postSignedWebhook(eventPayload);
    assert.equal(webhook.status, 200);

    const secured = await getJson(`/api/engagements/${selected.body.engagement.id}`);
    assert.equal(secured.body.engagement.status, "supplier_secured");
    assert.equal(secured.body.engagement.paymentStatus, "paid");
    assert.equal(secured.body.engagement.pinchPaymentId, "pmt_approved");

    const duplicate = await postSignedWebhook(eventPayload);
    assert.equal(duplicate.status, 200);

    const stillSecured = await getJson(`/api/engagements/${selected.body.engagement.id}`);
    assert.equal(stillSecured.body.engagement.securedAt, secured.body.engagement.securedAt);
  });
});

async function getJson(path: string) {
  const response = await fetch(`${baseUrl}${path}`);
  return {
    status: response.status,
    body: (await response.json()) as Record<string, any>
  };
}

async function postJson(path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, any>
  };
}

async function postSignedWebhook(body: unknown) {
  const rawBody = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto
    .createHmac("sha256", process.env.PINCH_WEBHOOK_SECRET ?? "")
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const response = await fetch(`${baseUrl}/api/pinch/webhooks`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "pinch-signature": `t=${timestamp},v2=${signature}`
    },
    body: rawBody
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, any>
  };
}

async function connectSocket(): Promise<Socket> {
  const client = createSocketClient(baseUrl.replace("/api", ""), {
    transports: ["websocket"],
    reconnection: false
  });
  await new Promise<void>((resolve, reject) => {
    client.once("connect", resolve);
    client.once("connect_error", reject);
  });
  return client;
}

async function onceSocket(client: Socket, eventName: string): Promise<Record<string, any>> {
  return await new Promise((resolve) => client.once(eventName, resolve));
}

async function wait(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function automationNeed() {
  return {
    title: "Urgent PLC automation fault",
    description: "Packaging line has PLC and SCADA faults and needs commissioning support in Sydney.",
    category: "automation",
    industry: "manufacturing",
    location: "Sydney NSW",
    urgencyDays: 3,
    budgetAud: 20000,
    requiredCapabilities: ["plc", "scada", "commissioning"]
  };
}
