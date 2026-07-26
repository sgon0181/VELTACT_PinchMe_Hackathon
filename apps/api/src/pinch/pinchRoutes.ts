import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";
import { pinchClient, PinchApiError } from "./pinchClient.js";
import { verifyPinchWebhookSignature, PinchWebhookError } from "./webhookVerifier.js";
import { listWebhookEvents, recordWebhookEvent } from "./webhookStore.js";
import { recordAuthoritativePinchPayment } from "../marketplace/store.js";
import { emitEngagementSecured, emitPaymentStatusUpdated } from "../realtime.js";
import { env } from "../env.js";
import { v2Service } from "../v2/service.js";
import { veltactV2SocketEvent } from "@veltact/contracts";
import { emitV2Update } from "../realtime.js";
import { extractApprovedPinchPaymentEvent } from "./authoritativePaymentEvent.js";

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
  response
    .status(200)
    .type("html")
    .send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Payment awaiting confirmation</title>
  </head>
  <body>
    <main>
      <h1>Payment awaiting confirmation</h1>
      <p>Pinch redirected you back to Veltact. This page does not confirm payment success.</p>
      <p>Return to Veltact and refresh the payment status. The engagement is secured only after the backend verifies payment with Pinch.</p>
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

    const event = recordWebhookEvent(request.body);
    const rapidMatchPayment = extractApprovedPinchPaymentEvent(request.body);
    const paymentEvent = extractSuccessfulPaymentEvent(request.body);
    if (rapidMatchPayment) {
      const result = recordAuthoritativePinchPayment({
        eventId: rapidMatchPayment.eventId,
        eventType: rapidMatchPayment.eventType,
        engagementId: rapidMatchPayment.engagementId,
        paymentId: rapidMatchPayment.paymentId,
        payload: request.body
      });

      if (result.engagement && !result.duplicate) {
        emitPaymentStatusUpdated(result.engagement);
        if (result.engagement.status === "supplier_secured") {
          emitEngagementSecured(result.engagement);
        }
      }
    }
    if (paymentEvent?.projectId && paymentEvent.milestoneId) {
      const result = await v2Service.recordPinchWebhookPayment({
        eventId: paymentEvent.eventId,
        eventType: paymentEvent.eventType,
        projectId: paymentEvent.projectId,
        milestoneId: paymentEvent.milestoneId,
        paymentId: paymentEvent.paymentId
      });
      if (!result.duplicate) {
        emitV2Update(
          result.needProfileId,
          veltactV2SocketEvent.milestonePaymentUpdated,
          result
        );
      }
    }

    response.json({
      received: true,
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
