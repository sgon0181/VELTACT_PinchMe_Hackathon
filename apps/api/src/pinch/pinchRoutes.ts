import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";
import { pinchClient, PinchApiError } from "./pinchClient.js";
import { verifyPinchWebhookSignature, PinchWebhookError } from "./webhookVerifier.js";
import { listWebhookEvents, recordWebhookEvent } from "./webhookStore.js";
import {
  getDeployment,
  getEngagement,
  recordAuthoritativePinchPayment
} from "../marketplace/store.js";
import {
  emitDeploymentUpdated,
  emitEngagementSecured,
  emitPaymentStatusUpdated
} from "../realtime.js";
import { env } from "../env.js";
import { V2ServiceError, v2Service } from "../v2/service.js";
import { veltactV2SocketEvent } from "@veltact/contracts";
import { emitV2Update } from "../realtime.js";
import {
  extractApprovedPinchPaymentEvent,
  matchesExpectedPinchCommitment
} from "./authoritativePaymentEvent.js";

export const pinchRouter = Router();

const createPayerSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1).optional(),
  emailAddress: z.string().trim().email(),
  companyName: z.string().trim().min(1).optional()
});

const createPaymentLinkSchema = z.object({
  payerId: z.string().trim().min(1),
  amount: z.coerce.number().int().positive(),
  description: z.string().trim().min(1),
  metadata: z.unknown().optional()
});

pinchRouter.get("/health", async (_request, response) => {
  try {
    await pinchClient.health();
    response.json({
      authenticated: true,
      environment: "sandbox"
    });
  } catch (error) {
    sendPinchError(response, error);
  }
});

pinchRouter.post("/test-payer", async (request, response) => {
  if (!allowDevelopmentUtility(response)) return;
  const parsed = createPayerSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      status: "error",
      message: "Invalid payer request",
      issues: parsed.error.flatten().fieldErrors
    });
    return;
  }

  try {
    const pinchResponse = await pinchClient.createPayer(parsed.data);
    response.status(201).json({
      payerId: findStringValue(pinchResponse, ["id", "payerId"]),
      pinchResponse
    });
  } catch (error) {
    sendPinchError(response, error);
  }
});

pinchRouter.post("/payment-link", async (request, response) => {
  if (!allowDevelopmentUtility(response)) return;
  const parsed = createPaymentLinkSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      status: "error",
      message: "Invalid payment link request",
      issues: parsed.error.flatten().fieldErrors
    });
    return;
  }

  try {
    const pinchResponse = await pinchClient.createPaymentLink(parsed.data);
    response.status(201).json({
      paymentLinkId: findStringValue(pinchResponse, ["id", "paymentLinkId"]),
      hostedCheckoutUrl: findStringValue(pinchResponse, [
        "url",
        "hostedUrl",
        "hostedCheckoutUrl",
        "paymentUrl"
      ]),
      pinchResponse
    });
  } catch (error) {
    sendPinchError(response, error);
  }
});

pinchRouter.get("/return/:engagementId?", (request, response) => {
  const localDemoReturn =
    request.query.payment_provider === "local_demo" &&
    env.PAYMENT_PROVIDER === "local_demo" &&
    env.NODE_ENV !== "production";
  if (
    request.query.payment_provider === "local_demo" &&
    !localDemoReturn
  ) {
    response.status(404).json({
      status: "error",
      message: "Local demo payment return is unavailable"
    });
    return;
  }

  const engagementId = (request.params as Record<string, string | undefined>)
    .engagementId;
  const engagement = engagementId
    ? getEngagement(engagementId)
    : undefined;
  const buyerReturnUrl = engagement
    ? `/index.html?needId=${encodeURIComponent(engagement.needId)}`
    : "/index.html";

  response
    .status(200)
    .type("html")
    .send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${localDemoReturn ? "Local demo commitment" : "Payment awaiting confirmation"}</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background: #f2f5f1;
        color: #14231b;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(100%, 720px);
        min-height: 100vh;
        margin: 0 auto;
        padding: 64px 28px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: flex-start;
      }
      .brand {
        margin: 0 0 40px;
        color: #126b4f;
        font-size: 14px;
        font-weight: 800;
        text-transform: uppercase;
      }
      .status {
        margin: 0 0 12px;
        color: #5c6c63;
        font-size: 13px;
        font-weight: 700;
        text-transform: uppercase;
      }
      h1 {
        max-width: 640px;
        margin: 0 0 24px;
        font-size: clamp(36px, 7vw, 56px);
        line-height: 1.05;
      }
      p {
        max-width: 640px;
        margin: 0 0 14px;
        color: #435249;
        font-size: 18px;
        line-height: 1.55;
      }
      .notice {
        margin: 10px 0 30px;
        padding: 4px 0 4px 18px;
        border-left: 3px solid #e3a51a;
      }
      a {
        display: inline-flex;
        min-height: 48px;
        align-items: center;
        justify-content: center;
        padding: 12px 20px;
        border-radius: 6px;
        background: #147a58;
        color: #fff;
        font-size: 16px;
        font-weight: 750;
        text-decoration: none;
      }
      a:focus-visible {
        outline: 3px solid #e3a51a;
        outline-offset: 3px;
      }
    </style>
  </head>
  <body>
    <main>
      <p class="brand">Veltact</p>
      <p class="status">${localDemoReturn ? "Local demo evidence" : "Pinch checkout return"}</p>
      ${
        localDemoReturn
          ? `<h1>Local demo commitment</h1>
      <div class="notice">
        <p>No Pinch transaction or external payment was created.</p>
        <p>Use the clearly labelled local demo action in Veltact to record non-authoritative demo evidence.</p>
      </div>`
          : `<h1>Payment awaiting confirmation</h1>
      <div class="notice">
        <p>Pinch redirected you back to Veltact. This page does not confirm payment success.</p>
        <p>The engagement is secured only after the backend verifies payment with Pinch.</p>
      </div>`
      }
      <a href="${buyerReturnUrl}">Return to Veltact</a>
    </main>
  </body>
</html>`);
});

pinchRouter.post("/webhooks", async (request, response) => {
  try {
    verifyPinchWebhookSignature({
      signatureHeader: request.header("pinch-signature"),
      rawBody: request.rawBody
    });

    const rapidMatchPayment = extractApprovedPinchPaymentEvent(request.body);
    const paymentEvent = extractSuccessfulPaymentEvent(request.body);
    let processed = false;
    let reason: string | undefined;
    const engagement = rapidMatchPayment
      ? getEngagement(rapidMatchPayment.engagementId)
      : undefined;
    const deployment = engagement
      ? getDeployment(engagement.id)
      : undefined;
    const milestone = rapidMatchPayment
      ? deployment?.milestones.find(
          (candidate) => candidate.id === rapidMatchPayment.milestoneId
        )
      : undefined;
    const milestonePayerId =
      milestone?.pinchPayerId ??
      (milestone?.sequence === 1 ? engagement?.pinchPayerId : undefined);
    const milestonePaymentLinkId =
      milestone?.paymentLinkId ??
      (milestone?.sequence === 1 ? engagement?.paymentLinkId : undefined);
    const milestoneHostedCheckoutUrl =
      milestone?.hostedCheckoutUrl ??
      (milestone?.sequence === 1
        ? engagement?.hostedCheckoutUrl
        : undefined);
    const matchesCommitment = Boolean(
      rapidMatchPayment &&
      engagement &&
      milestonePaymentLinkId &&
      milestonePayerId &&
      milestoneHostedCheckoutUrl &&
      milestone?.amount &&
      matchesExpectedPinchCommitment(rapidMatchPayment, {
        engagementId: engagement.id,
        needProfileId: engagement.needId,
        supplierId: engagement.supplierId,
        milestoneId: milestone.id,
        payerId: milestonePayerId,
        amountMinor: milestone.amount.amount,
        currency: milestone.amount.currency
      })
    );
    if (rapidMatchPayment && !engagement) {
      reason = "no_matching_engagement";
    } else if (rapidMatchPayment && !matchesCommitment) {
      reason = "commitment_mismatch";
    } else if (
      rapidMatchPayment &&
      engagement &&
      milestone &&
      matchesCommitment &&
      (milestone.paymentStatus === "awaiting_payment" ||
        milestone.pinchPaymentId === rapidMatchPayment.paymentId)
    ) {
      const result = recordAuthoritativePinchPayment({
        eventId: rapidMatchPayment.eventId,
        eventType: rapidMatchPayment.eventType,
        engagementId: rapidMatchPayment.engagementId,
        milestoneId: rapidMatchPayment.milestoneId,
        paymentId: rapidMatchPayment.paymentId,
        payload: request.body
      });
      processed = result.milestoneFunded;
      reason = result.duplicate ? "duplicate" : undefined;

      if (result.engagement && !result.duplicate) {
        if (milestone.sequence === 1) {
          emitPaymentStatusUpdated(result.engagement);
          emitEngagementSecured(result.engagement);
        }
        const updatedDeployment = getDeployment(result.engagement.id);
        if (updatedDeployment) {
          emitDeploymentUpdated({
            needProfileId: result.engagement.needId,
            engagementId: result.engagement.id,
            deployment: updatedDeployment
          });
        }
      }
    } else if (rapidMatchPayment) {
      reason = "engagement_not_awaiting_payment";
    }
    if (paymentEvent?.projectId && paymentEvent.milestoneId) {
      try {
        const result = await v2Service.recordPinchWebhookPayment({
          eventId: paymentEvent.eventId,
          eventType: paymentEvent.eventType,
          projectId: paymentEvent.projectId,
          milestoneId: paymentEvent.milestoneId,
          paymentId: paymentEvent.paymentId
        });
        processed = true;
        reason = result.duplicate ? "duplicate" : undefined;
        if (!result.duplicate) {
          emitV2Update(
            result.needProfileId,
            veltactV2SocketEvent.milestonePaymentUpdated,
            result
          );
        }
      } catch (error) {
        if (error instanceof V2ServiceError && error.statusCode === 404) {
          if (!processed) {
            reason = "no_matching_engagement";
          }
        } else {
          throw error;
        }
      }
    }
    if (!rapidMatchPayment && !(paymentEvent?.projectId && paymentEvent.milestoneId)) {
      reason = "unsupported_event";
    }

    const event = recordWebhookEvent(request.body, {
      processed,
      ...(reason ? { reason } : {})
    });
    if (!processed && reason === "no_matching_engagement") {
      console.warn("[pinch-webhook] Verified event has no matching engagement", {
        eventId: event.id,
        eventType: event.type
      });
    }

    response.json({
      received: true,
      processed,
      ...(reason ? { reason } : {}),
      event
    });
  } catch (error) {
    if (error instanceof PinchWebhookError) {
      response.status(error.statusCode).json({
        status: "error",
        message: error.message
      });
      return;
    }

    response.status(500).json({
      status: "error",
      message: "Unexpected Pinch webhook error"
    });
  }
});

pinchRouter.get("/webhooks/events", (_request, response) => {
  if (!allowDevelopmentUtility(response)) return;
  response.json({
    events: listWebhookEvents()
  });
});

function allowDevelopmentUtility(response: Response) {
  if (env.NODE_ENV !== "production") {
    return true;
  }

  response.status(404).json({
    status: "error",
    message: "Development utility is unavailable in production"
  });
  return false;
}

function sendPinchError(response: Response, error: unknown) {
  if (error instanceof PinchApiError) {
    response.status(error.statusCode).json({
      status: "error",
      message: error.message,
      upstreamStatus: error.upstreamStatus,
      upstreamCode: error.upstreamCode
    });
    return;
  }

  response.status(500).json({
    status: "error",
    message: "Unexpected Pinch integration error"
  });
}

function findStringValue(payload: unknown, keys: string[]): string | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const value = findStringValue(item, keys);
      if (value) {
        return value;
      }
    }
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      return value;
    }
  }

  for (const value of Object.values(record)) {
    const nested = findStringValue(value, keys);
    if (nested) {
      return nested;
    }
  }

  return undefined;
}

function extractSuccessfulPaymentEvent(payload: unknown):
  | {
      eventId: string;
      eventType: string;
      engagementId?: string;
      projectId?: string;
      milestoneId?: string;
      paymentId?: string;
    }
  | undefined {
  const eventId = getNestedString(payload, ["Id"]) ?? getNestedString(payload, ["id"]);
  const eventType = getNestedString(payload, ["Type"]) ?? getNestedString(payload, ["type"]);
  if (!eventId || !eventType) {
    return undefined;
  }

  const payment =
    getNestedObject(payload, ["Data", "Payment"]) ??
    getNestedObject(payload, ["data", "payment"]);
  if (!payment || !isAuthoritativeSuccessfulPayment(eventType, payment)) {
    return undefined;
  }

  const metadata = parseMetadata(
    getNestedValue(payment, ["Metadata"]) ?? getNestedValue(payment, ["metadata"])
  );
  const engagementId =
    getString(metadata.engagementId) ??
    getString(metadata.EngagementId) ??
    getString(metadata.engagement_id);
  const projectId =
    getString(metadata.projectId) ??
    getString(metadata.ProjectId) ??
    getString(metadata.project_id);
  const milestoneId =
    getString(metadata.milestoneId) ??
    getString(metadata.MilestoneId) ??
    getString(metadata.milestone_id);
  if (!engagementId && !(projectId && milestoneId)) {
    return undefined;
  }

  return {
    eventId,
    eventType,
    engagementId,
    projectId,
    milestoneId,
    paymentId: getNestedString(payment, ["Id"]) ?? getNestedString(payment, ["id"])
  };
}

function isAuthoritativeSuccessfulPayment(eventType: string, payment: Record<string, unknown>) {
  if (!["realtime-payment", "payment-created"].includes(eventType)) {
    return false;
  }

  const status = (
    getNestedString(payment, ["Status"]) ??
    getNestedString(payment, ["status"]) ??
    ""
  ).toLowerCase();
  return status === "approved";
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
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function getNestedObject(payload: unknown, path: string[]): Record<string, unknown> | undefined {
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
