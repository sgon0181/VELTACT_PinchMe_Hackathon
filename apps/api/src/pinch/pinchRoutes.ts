import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";
import { pinchClient, PinchApiError } from "./pinchClient.js";

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
