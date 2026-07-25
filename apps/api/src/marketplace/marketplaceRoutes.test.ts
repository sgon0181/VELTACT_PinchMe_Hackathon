import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import {
  aiIntakeResultSchema,
  engagementSchema,
  needProfileSchema,
  rapidMatchSocketEvent,
  supplierInvitationSchema,
  supplierMatchSchema,
  supplierOutreachDeliverySchema,
  supplierResponseSchema
} from "@veltact/contracts";
import { io as createSocketClient, type Socket } from "socket.io-client";
import { app } from "../app.js";
import { env } from "../env.js";
import {
  resetPaymentProviderForTest,
  setPaymentProviderForTest
} from "../payments/providerRegistry.js";
import { attachRealtime } from "../realtime.js";
import {
  createNeed,
  getInvitation,
  listMarketplaceAuditEvents,
  resetMarketplaceStore,
  submitSupplierResponse
} from "./store.js";

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  resetMarketplaceStore();
  process.env.PINCH_WEBHOOK_SECRET = "whsec_test_secret";
  setPaymentProviderForTest({
    async createHostedPaymentLink(input) {
      assert.equal(input.amount, 2_000_000);
      assert.match(input.returnUrl, new RegExp(`/api/pinch/return/${input.engagementId}$`));
      return {
        provider: "pinch",
        payerId: `pyr_${input.engagementId}`,
        paymentLinkId: `plink_${input.engagementId}`,
        hostedCheckoutUrl: `https://sandbox.getpinch.com.au/pay/${input.engagementId}`
      };
    },
    async getApprovedPaymentForLink(paymentLinkId) {
      return {
        provider: "pinch",
        paymentId: `pmt_${paymentLinkId}`,
        status: "approved"
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
  test("structures messy buyer intake into a contract-valid need profile draft", async () => {
    const structured = await postJson("/api/ai-intake/structure", {
      rawRequirement:
        "Packaging line stopped after intermittent Siemens PLC faults in Western Sydney. Need someone today. Speed matters.",
      evidence: [
        {
          kind: "written",
          name: "Operator notes",
          extractedText: "Fault repeats after restart. No budget confirmed yet."
        }
      ]
    }, { "x-veltact-ai-intake-source": "local_demo" });

    assert.equal(structured.status, 200);
    assert.equal(structured.body.source, "local_demo");
    assert.doesNotThrow(() => aiIntakeResultSchema.parse(structured.body.aiIntakeResult));
    assert.equal(structured.body.aiIntakeResult.generatedProfile.buyerPriority, "speed");
    assert.match(structured.body.aiIntakeResult.generatedProfile.location, /Western Sydney/);
    assert.ok(structured.body.aiIntakeResult.generatedProfile.requiredCapabilities.length > 0);
  });

  test("structures and matches the robotic palletiser demo without diagnosing the fault", async () => {
    const structured = await postJson(
      "/api/ai-intake/structure",
      {
        rawRequirement:
          "Our ABB palletising robot stopped mid-cycle on Line 3 in Western Sydney. The Siemens S7 PLC shows an intermittent safety-circuit fault. We need a specialist tonight before the 6:00 am dispatch and can approve up to $18,000."
      },
      { "x-veltact-ai-intake-source": "local_demo" }
    );

    assert.equal(structured.status, 200);
    assert.match(structured.body.aiIntakeResult.generatedProfile.title, /robotic palletiser/i);
    assert.ok(
      structured.body.aiIntakeResult.generatedProfile.requiredCapabilities.includes(
        "ABB robot diagnostics"
      )
    );

    const created = await postJson("/api/needs", {
      buyerEmail: "elena.morris@harbourpack.example",
      profile: roboticsNeed()
    });

    assert.equal(created.status, 201);
    assert.deepEqual(
      new Set(
        created.body.need.matches.map(
          (match: { supplierId: string }) => match.supplierId
        )
      ),
      new Set([
        "supplier-automation-nsw",
        "supplier-robot-safety-nsw",
        "supplier-robotics-western-sydney"
      ])
    );
    assert.ok(
      created.body.need.matches.every((match: { explanation: string[] }) =>
        match.explanation.some((reason) => /Technical fit:|Equipment fit:/.test(reason))
      )
    );
  });

  test("preserves six-figure comma-formatted budgets during AI intake", async () => {
    const response = await postJson(
      "/api/ai-intake/structure",
      {
        rawRequirement:
          "Plan a robotic palletising cell in Western Sydney within 60 days. Approved budget is AUD 120,000."
      },
      { "x-veltact-ai-intake-source": "local_demo" }
    );

    assert.equal(response.status, 200);
    assert.equal(
      response.body.aiIntakeResult.generatedProfile.budgetRange,
      "Up to AUD 120,000"
    );
  });

  test("rejects low-signal AI intake before a paid model call", async () => {
    const rejected = await postJson("/api/ai-intake/structure", {
      rawRequirement: "asdf lol $$$$"
    });

    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.error, "low_signal_ai_intake_request");
  });

  test("accepts industrial photo evidence with filename context", async () => {
    const structured = await postJson("/api/ai-intake/structure", {
      rawRequirement: "",
      evidence: [
        {
          kind: "photo",
          name: "siemens-plc-fault-packaging-line.jpg",
          mimeType: "image/jpeg",
          dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w=="
        }
      ]
    }, { "x-veltact-ai-intake-source": "local_demo" });

    assert.equal(structured.status, 200);
    assert.equal(structured.body.source, "local_demo");
    assert.doesNotThrow(() => aiIntakeResultSchema.parse(structured.body.aiIntakeResult));
  });

  test("rejects context-free photo evidence before a paid model call", async () => {
    const rejected = await postJson("/api/ai-intake/structure", {
      rawRequirement: "",
      evidence: [
        {
          kind: "photo",
          name: "IMG_1234.jpg",
          mimeType: "image/jpeg",
          dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w=="
        }
      ]
    });

    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.error, "low_signal_ai_intake_request");
  });

  test("creates and retrieves a need with deterministic explainable matches and invitation tokens", async () => {
    const created = await postJson("/api/needs", {
      buyerEmail: "buyer@example.com",
      profile: automationNeed()
    });

    assert.equal(created.status, 201);
    assert.equal(created.body.need.profile.title, "Urgent PLC automation fault");
    assert.doesNotThrow(() => needProfileSchema.parse(created.body.need.needProfile));
    assert.equal(created.body.need.matches.length, 3);
    assert.deepEqual(
      created.body.need.matches.map((match: { supplierId: string }) => match.supplierId),
      ["supplier-automation-nsw", "supplier-controls-western-sydney", "supplier-electrical-sydney"]
    );
    assert.match(
      created.body.need.matches[0].explanation.join(" "),
      /Technical fit:|Equipment fit:|Location fit:|Availability fit:|Buyer priority fit:/i
    );
    assert.doesNotThrow(() => supplierMatchSchema.parse(created.body.need.supplierMatches[0]));
    assert.equal(created.body.need.invitations.length, 3);
    assert.equal(created.body.need.invitations[0].status, "invited");
    assert.equal(created.body.need.supplierInvitations[0].status, "sent");
    assert.doesNotThrow(() => supplierInvitationSchema.parse(created.body.need.supplierInvitations[0]));
    assert.ok(created.body.need.invitations[0].token);
    assert.ok(
      listMarketplaceAuditEvents().some(
        (event) =>
          event.eventType === "need.created" &&
          event.entityId === created.body.need.id
      )
    );

    const sent = await postJson(`/api/need-profiles/${created.body.need.id}/invitations/send`, {});
    assert.equal(sent.status, 200);
    assert.equal(sent.body.supplierInvitations.length, 3);
    assert.doesNotThrow(() => supplierInvitationSchema.parse(sent.body.supplierInvitations[0]));

    const retrieved = await getJson(`/api/needs/${created.body.need.id}`);

    assert.equal(retrieved.status, 200);
    assert.deepEqual(retrieved.body.need.matches, created.body.need.matches);
    assert.deepEqual(retrieved.body.need.invitations, created.body.need.invitations);
  });

  test("uses structured AI intake fields for strong Siemens PLC packaging-line matches", async () => {
    const created = await postJson("/api/need-profiles", {
      buyerEmail: "ops.manager@westernfoods.example",
      profile: structuredSiemensNeed()
    });

    assert.equal(created.status, 201);
    const need = created.body.need;
    assert.equal(need.needProfile.description, structuredSiemensNeed().problemSummary);
    assert.deepEqual(need.needProfile.mustHaves, [
      "Siemens PLC diagnostics",
      "Conveyor fault recovery",
      "Onsite breakdown support",
      "Siemens S7 PLC",
      "Packaging conveyor"
    ]);
    assert.deepEqual(
      need.matches.map((match: { supplierId: string }) => match.supplierId),
      ["supplier-automation-nsw", "supplier-controls-western-sydney", "supplier-electrical-sydney"]
    );

    for (const match of need.matches as Array<{ score: number; explanation: string[] }>) {
      assert.ok(match.score >= 80);
      const reasons = match.explanation.join(" ");
      assert.match(reasons, /Technical fit:/);
      assert.match(reasons, /Equipment fit:/);
      assert.match(reasons, /Industry fit:/);
      assert.match(reasons, /Location fit:/);
      assert.match(reasons, /Availability fit:/);
      assert.match(reasons, /Buyer priority fit:/);
      assert.match(reasons, /Trust fit:/);
    }
  });

  test("resets marketplace demo state deterministically", async () => {
    const created = await postJson("/api/needs", {
      buyerEmail: "buyer@example.com",
      profile: automationNeed()
    });
    const token = created.body.need.invitations[0].token;
    const submitted = await postJson(`/api/supplier-invitations/${token}/responses`, {
      canHelp: true,
      earliestAvailability: "Same day",
      indicativePriceAud: 18500,
      relevantExperience: "Siemens PLC packaging line recovery.",
      conditions: "Site induction required."
    });
    const selected = await postJson(`/api/need-profiles/${created.body.need.id}/engagements`, {
      supplierResponseId: submitted.body.response.id
    });

    const reset = await postJson("/api/demo/reset", {});
    const needAfterReset = await getJson(`/api/needs/${created.body.need.id}`);
    const invitationAfterReset = await getJson(`/api/supplier-invitations/${token}`);
    const responsesAfterReset = await getJson(`/api/needs/${created.body.need.id}/responses`);
    const engagementAfterReset = await getJson(`/api/engagements/${selected.body.engagement.id}`);

    assert.equal(reset.status, 200);
    assert.equal(reset.body.reset, true);
    assert.equal(needAfterReset.status, 404);
    assert.equal(invitationAfterReset.status, 404);
    assert.equal(responsesAfterReset.status, 404);
    assert.equal(engagementAfterReset.status, 404);
  });

  test("enforces scoped buyer capability access when production protection is enabled", async () => {
    const originalProtection = env.BUYER_CAPABILITY_AUTH_REQUIRED;
    Object.assign(env, { BUYER_CAPABILITY_AUTH_REQUIRED: true });

    try {
      const created = await postJson("/api/needs", {
        buyerEmail: "buyer@example.com",
        profile: automationNeed()
      });
      const needId = created.body.need.id;
      const buyerAccessToken = created.body.buyerAccessToken;
      assert.equal(typeof buyerAccessToken, "string");
      assert.ok(buyerAccessToken.length >= 32);

      const rejected = await getJson(`/api/needs/${needId}`);
      assert.equal(rejected.status, 401);

      const authorised = await getJson(`/api/needs/${needId}`, {
        "x-veltact-buyer-token": buyerAccessToken
      });
      assert.equal(authorised.status, 200);

      const supplierToken = created.body.need.invitations[0].token;
      const supplierView = await getJson(
        `/api/supplier-invitations/${supplierToken}`
      );
      assert.equal(supplierView.status, 200);
      assert.equal(supplierView.body.need.invitations, undefined);
      assert.equal(supplierView.body.need.supplierInvitations, undefined);
    } finally {
      Object.assign(env, {
        BUYER_CAPABILITY_AUTH_REQUIRED: originalProtection
      });
    }
  });

  test("expires supplier invitation tokens and their unmatched supplier state", () => {
    const created = createNeed(
      {
        buyerEmail: "buyer@example.com",
        profile: automationNeed()
      },
      new Date("2026-07-20T00:00:00.000Z")
    );
    const invitation = created.invitations[0];

    const result = submitSupplierResponse(
      invitation.token,
      {
        canHelp: true,
        earliestAvailability: "2026-07-25",
        indicativePriceAud: 18500,
        relevantExperience: "Siemens PLC packaging line recovery.",
        conditions: "Site induction required."
      },
      new Date("2026-07-24T00:00:00.000Z")
    );

    assert.equal(result.status, "expired");
    assert.equal(getInvitation(invitation.token)?.status, "expired");
    assert.equal(
      created.matches.find((match) => match.supplier.id === invitation.supplierId)?.status,
      "expired"
    );
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
    assert.equal(invitation.body.invitation.status, "opened");
    assert.equal(invitation.body.supplierInvitation.status, "opened");
    assert.doesNotThrow(() => supplierInvitationSchema.parse(invitation.body.supplierInvitation));
    assert.ok(invitation.body.invitation.openedAt);
    assert.equal(invitation.body.need.id, created.body.need.id);

    const submitted = await postJson(`/api/supplier-invitations/${token}/responses`, {
      canHelp: true,
      earliestAvailability: "2026-07-28",
      indicativePriceAud: 18500,
      relevantExperience: "Completed urgent PLC and SCADA recovery for a packaging line.",
      conditions: "Remote diagnostics required before site attendance."
    });

    assert.equal(submitted.status, 201);
    assert.doesNotThrow(() => supplierResponseSchema.parse(submitted.body.supplierResponse));
    assert.equal(submitted.body.supplierResponse.decision, "can_help");
    assert.deepEqual(submitted.body.supplierResponse.indicativePrice, {
      amount: 1850000,
      currency: "AUD"
    });
    assert.equal(submitted.body.response.supplierId, "supplier-automation-nsw");
    assert.equal(submitted.body.response.canHelp, true);

    const duplicate = await postJson(`/api/supplier-invitations/${token}/responses`, {
      canHelp: true,
      earliestAvailability: "2026-07-29",
      indicativePriceAud: 19000,
      relevantExperience: "Accidental duplicate submission.",
      conditions: "Should not create a second response."
    });
    assert.equal(duplicate.status, 201);
    assert.equal(duplicate.body.response.id, submitted.body.response.id);
    assert.equal(duplicate.body.response.indicativePriceAud, 19000);
    assert.equal(duplicate.body.supplierResponse.id, submitted.body.supplierResponse.id);
    assert.deepEqual(duplicate.body.supplierResponse.indicativePrice, {
      amount: 1900000,
      currency: "AUD"
    });

    const responses = await getJson(`/api/needs/${created.body.need.id}/responses`);

    assert.equal(responses.status, 200);
    assert.deepEqual(responses.body.responses, [duplicate.body.response]);
    assert.deepEqual(responses.body.supplierResponses, [duplicate.body.supplierResponse]);

    const reopened = await getJson(`/api/supplier-invitations/${token}`);
    assert.equal(reopened.status, 200);
    assert.equal(reopened.body.supplierInvitation.status, "responded");
    assert.equal(reopened.body.response.id, submitted.body.response.id);
    assert.equal(reopened.body.supplierResponse.id, submitted.body.supplierResponse.id);
    assert.equal(reopened.body.supplierResponse.decision, "can_help");
  });

  test("enforces one valid supplier selection and closes later supplier response changes", async () => {
    const created = await postJson("/api/needs", {
      buyerEmail: "buyer@example.com",
      profile: structuredSiemensNeed()
    });
    const [firstInvitation, secondInvitation] = created.body.need.invitations;

    const declined = await postJson(`/api/supplier-invitations/${firstInvitation.token}/responses`, {
      canHelp: false,
      earliestAvailability: "Unavailable",
      indicativePriceAud: 0,
      relevantExperience: "Relevant Siemens experience, but no crew is currently available.",
      conditions: "No availability."
    });
    const declinedSelection = await postJson(
      `/api/need-profiles/${created.body.need.id}/engagements`,
      { supplierResponseId: declined.body.response.id }
    );
    assert.equal(declinedSelection.status, 409);

    const accepted = await postJson(`/api/supplier-invitations/${firstInvitation.token}/responses`, {
      canHelp: true,
      earliestAvailability: "Same day",
      indicativePriceAud: 18500,
      relevantExperience: "Recovered Siemens S7 packaging lines under production pressure.",
      conditions: "Remote triage before dispatch."
    });
    const alternative = await postJson(
      `/api/supplier-invitations/${secondInvitation.token}/responses`,
      {
        canHelp: true,
        earliestAvailability: "Next morning",
        indicativePriceAud: 17250,
        relevantExperience: "Siemens PLC and conveyor controls support across Western Sydney.",
        conditions: "Site induction required."
      }
    );

    const selected = await postJson(`/api/need-profiles/${created.body.need.id}/engagements`, {
      supplierResponseId: accepted.body.response.id
    });
    const repeatedSelection = await postJson(
      `/api/need-profiles/${created.body.need.id}/engagements`,
      { supplierResponseId: accepted.body.response.id }
    );
    const competingSelection = await postJson(
      `/api/need-profiles/${created.body.need.id}/engagements`,
      { supplierResponseId: alternative.body.response.id }
    );
    const lateResponseChange = await postJson(
      `/api/supplier-invitations/${secondInvitation.token}/responses`,
      {
        canHelp: true,
        earliestAvailability: "Same day",
        indicativePriceAud: 16000,
        relevantExperience: "Attempted change after buyer selection.",
        conditions: "None."
      }
    );

    assert.equal(selected.status, 201);
    assert.equal(repeatedSelection.status, 201);
    assert.equal(repeatedSelection.body.engagement.id, selected.body.engagement.id);
    assert.equal(competingSelection.status, 409);
    assert.equal(lateResponseChange.status, 409);

    const retrieved = await getJson(`/api/needs/${created.body.need.id}`);
    assert.equal(retrieved.body.need.status, "selected");
    assert.equal(
      retrieved.body.need.matches.filter((match: { status: string }) => match.status === "selected").length,
      1
    );
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
    assert.equal(update.supplierResponse.decision, "cannot_help");
    assert.equal(update.supplierResponse.status, "submitted");
  });

  test("emits realtime buyer updates when an invitation link is opened", async () => {
    const created = await postJson("/api/needs", {
      buyerEmail: "buyer@example.com",
      profile: automationNeed()
    });
    const needProfileId = created.body.need.id;
    const token = created.body.need.invitations[0].token;
    const client = await connectSocket();
    const updatePromise = onceSocket(client, rapidMatchSocketEvent.invitationSent);

    client.emit(rapidMatchSocketEvent.joinNeedProfile, { needProfileId });
    await wait(25);

    const invitation = await getJson(`/api/supplier-invitations/${token}`);
    const update = await updatePromise;

    client.close();
    assert.equal(invitation.status, 200);
    assert.equal(invitation.body.supplierInvitation.status, "opened");
    assert.equal(update.needProfileId, needProfileId);
    assert.equal(update.supplierInvitation.status, "opened");
    assert.equal(update.supplierInvitation.supplierId, "supplier-automation-nsw");
  });

  test("sends supplier outreach through the local demo email adapter and emits delivery updates", async () => {
    const created = await postJson("/api/needs", {
      buyerEmail: "buyer@example.com",
      profile: automationNeed()
    });
    const needProfileId = created.body.need.id;
    const client = await connectSocket();
    const updates: Record<string, any>[] = [];

    client.on(rapidMatchSocketEvent.outreachDeliveryUpdated, (payload) => {
      updates.push(payload);
    });
    client.emit(rapidMatchSocketEvent.joinNeedProfile, { needProfileId });
    await wait(25);

    const sent = await postJson(`/api/need-profiles/${needProfileId}/invitations/send`, {});
    await wait(25);

    client.close();
    assert.equal(sent.status, 200);
    assert.equal(sent.body.supplierOutreachDeliveries.length, 6);
    const emailDeliveries = (sent.body.supplierOutreachDeliveries as Record<string, any>[]).filter(
      (delivery) => delivery.channel === "email"
    );
    const smsDeliveries = (sent.body.supplierOutreachDeliveries as Record<string, any>[]).filter(
      (delivery) => delivery.channel === "sms"
    );
    assert.equal(emailDeliveries.length, 3);
    assert.equal(smsDeliveries.length, 3);
    for (const delivery of emailDeliveries) {
      assert.doesNotThrow(() => supplierOutreachDeliverySchema.parse(delivery));
      assert.equal(delivery.deliveryStatus, "sent");
      assert.ok(delivery.sentAt);
    }
    for (const delivery of smsDeliveries) {
      assert.doesNotThrow(() => supplierOutreachDeliverySchema.parse(delivery));
      assert.equal(delivery.deliveryStatus, "failed");
      assert.match(delivery.errorMessage, /SMS provider is not configured/);
    }
    assert.ok(
      updates.some(
        (update) =>
          update.needProfileId === needProfileId &&
          update.outreachDelivery.channel === "email" &&
          update.outreachDelivery.deliveryStatus === "queued"
      )
    );
    assert.ok(
      updates.some(
        (update) =>
          update.needProfileId === needProfileId &&
          update.outreachDelivery.channel === "email" &&
          update.outreachDelivery.deliveryStatus === "sent"
      )
    );
  });

  test("marks provider network failures as failed and continues every delivery", async () => {
    const originalEmailProvider = env.EMAIL_PROVIDER;
    const originalEmailFrom = env.EMAIL_FROM;
    const originalResendApiKey = env.RESEND_API_KEY;
    const originalFetch = globalThis.fetch;
    Object.assign(env, {
      EMAIL_PROVIDER: "resend",
      EMAIL_FROM: "Veltact <opportunities@veltact.test>",
      RESEND_API_KEY: "re_test_key"
    });
    globalThis.fetch = async (input, init) => {
      if (String(input).startsWith(baseUrl)) {
        return originalFetch(input, init);
      }
      throw new Error("provider connection unavailable");
    };

    try {
      const created = await postJson("/api/needs", {
        buyerEmail: "buyer@example.com",
        profile: automationNeed()
      });
      const needProfileId = created.body.need.id;
      const client = await connectSocket();
      const updates: Record<string, any>[] = [];
      client.on(rapidMatchSocketEvent.outreachDeliveryUpdated, (payload) => {
        updates.push(payload);
      });
      client.emit(rapidMatchSocketEvent.joinNeedProfile, { needProfileId });
      await wait(25);

      const result = await postJson(`/api/need-profiles/${needProfileId}/invitations/send`, {});
      await wait(25);
      client.close();

      assert.equal(result.status, 200);
      assert.equal(result.body.supplierOutreachDeliveries.length, 6);
      assert.ok(
        result.body.supplierOutreachDeliveries.every(
          (delivery: { deliveryStatus: string }) => delivery.deliveryStatus === "failed"
        )
      );
      const emailDeliveries = result.body.supplierOutreachDeliveries.filter(
        (delivery: { channel: string }) => delivery.channel === "email"
      );
      assert.equal(emailDeliveries.length, 3);
      assert.ok(
        emailDeliveries.every((delivery: { errorMessage: string }) =>
          /Resend delivery request failed: provider connection unavailable/.test(
            delivery.errorMessage
          )
        )
      );
      assert.ok(
        updates.some(
          (update) =>
            update.outreachDelivery.channel === "email" &&
            update.outreachDelivery.deliveryStatus === "queued"
        )
      );
      assert.ok(
        updates.some(
          (update) =>
            update.outreachDelivery.channel === "email" &&
            update.outreachDelivery.deliveryStatus === "failed"
        )
      );
    } finally {
      Object.assign(env, {
        EMAIL_PROVIDER: originalEmailProvider,
        EMAIL_FROM: originalEmailFrom,
        RESEND_API_KEY: originalResendApiKey
      });
      globalThis.fetch = originalFetch;
    }
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
    assert.doesNotThrow(() => engagementSchema.parse(selected.body.engagement));
    assert.equal(selected.body.engagement.paymentStatus, "not_started");

    const paymentLink = await postJson(
      `/api/engagements/${selected.body.engagement.id}/payment-link`,
      {}
    );
    assert.equal(paymentLink.status, 201);
    assert.doesNotThrow(() => engagementSchema.parse(paymentLink.body.engagement));
    assert.equal(paymentLink.body.engagement.status, "payment_pending");
    assert.equal(paymentLink.body.engagement.paymentStatus, "awaiting_payment");
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
    assert.doesNotThrow(() => engagementSchema.parse(secured.body.engagement));
    assert.equal(secured.body.engagement.status, "supplier_secured");
    assert.equal(secured.body.engagement.paymentStatus, "paid");
    assert.equal(secured.body.engagement.pinchPaymentId, "pmt_approved");

    const duplicate = await postSignedWebhook(eventPayload);
    assert.equal(duplicate.status, 200);

    const stillSecured = await getJson(`/api/engagements/${selected.body.engagement.id}`);
    assert.equal(stillSecured.body.engagement.securedAt, secured.body.engagement.securedAt);
  });

  test("completes the local demo through the secured state without an external payment", async () => {
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
    const paymentLink = await postJson(
      `/api/engagements/${selected.body.engagement.id}/payment-link`,
      {}
    );

    assert.equal(paymentLink.status, 201);
    const completed = await postJson(
      `/api/engagements/${selected.body.engagement.id}/demo-payment`,
      {}
    );

    assert.equal(completed.status, 200);
    assert.doesNotThrow(() => engagementSchema.parse(completed.body.engagement));
    assert.equal(completed.body.engagement.status, "supplier_secured");
    assert.equal(completed.body.engagement.paymentStatus, "paid");
    assert.match(completed.body.engagement.pinchPaymentId, /^demo_/);

    const duplicate = await postJson(
      `/api/engagements/${selected.body.engagement.id}/demo-payment`,
      {}
    );
    assert.equal(duplicate.status, 409);
  });
});

async function getJson(path: string, headers: Record<string, string> = {}) {
  const response = await fetch(`${baseUrl}${path}`, { headers });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, any>
  };
}

async function postJson(path: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers
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
    description: "Urgent Siemens PLC fault on a packaging conveyor in Western Sydney. Support required today.",
    category: "automation",
    industry: "manufacturing",
    location: "Western Sydney NSW",
    urgencyDays: 1,
    budgetAud: 20000,
    requiredCapabilities: ["siemens", "plc", "conveyor"]
  };
}

function structuredSiemensNeed() {
  return {
    title: "Packaging conveyor Siemens PLC line stop",
    description: "Production has stopped and the buyer needs a supplier response.",
    problemSummary:
      "Packaging line stopped after intermittent Siemens PLC faults. Buyer needs safe production restored today.",
    category: "industrial automation",
    industry: "food packaging manufacturing",
    equipmentOrTechnology: ["Siemens S7 PLC", "Packaging conveyor"],
    location: "Western Sydney NSW",
    urgencyDays: 1,
    budgetAud: 20000,
    constraints: ["Food manufacturing site access", "Licensed electrical work required"],
    buyerPriority: "speed",
    requiredCapability: [
      "Siemens PLC diagnostics",
      "Conveyor fault recovery",
      "Onsite breakdown support"
    ]
  };
}

function roboticsNeed() {
  return {
    title: "Robotic palletiser stopped before morning dispatch",
    description:
      "ABB palletising robot stopped mid-cycle and the packaging line cannot restart safely.",
    problemSummary:
      "Cartons are backing up before a 6:00 am dispatch. A robotics specialist must diagnose the cell and restore safe production.",
    category: "industrial robotics and automation",
    industry: "food packaging manufacturing",
    equipmentOrTechnology: [
      "ABB palletising robot",
      "Siemens S7 PLC",
      "Robot cell safety circuit",
      "Packaging conveyor"
    ],
    location: "Western Sydney NSW",
    urgencyDays: 1,
    budgetAud: 18000,
    constraints: [
      "Supermarket dispatch at 6:00 am",
      "Safe restart and handover required"
    ],
    buyerPriority: "speed",
    requiredCapabilities: [
      "Robotic cell fault recovery",
      "ABB robot diagnostics",
      "Safety circuit diagnostics",
      "Same-shift onsite support"
    ]
  };
}
