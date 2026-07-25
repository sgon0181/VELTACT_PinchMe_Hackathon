import crypto from "node:crypto";
import { env } from "../env.js";

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export type VerifiedWebhook = {
  timestamp: number;
};

export class PinchWebhookError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400
  ) {
    super(message);
    this.name = "PinchWebhookError";
  }
}

export function verifyPinchWebhookSignature(input: {
  signatureHeader: string | undefined;
  rawBody: Buffer | undefined;
}): VerifiedWebhook {
  const webhookSecret = process.env.PINCH_WEBHOOK_SECRET ?? env.PINCH_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new PinchWebhookError("Pinch webhook secret is not configured", 503);
  }

  if (!input.rawBody) {
    throw new PinchWebhookError("Webhook raw body is unavailable");
  }

  if (!input.signatureHeader) {
    throw new PinchWebhookError("Missing Pinch webhook signature");
  }

  const signatureParts = parseSignatureHeader(input.signatureHeader);
  if (!signatureParts.timestamp || !signatureParts.signature) {
    throw new PinchWebhookError("Invalid Pinch webhook signature");
  }

  const timestamp = Number(signatureParts.timestamp);
  if (!Number.isInteger(timestamp)) {
    throw new PinchWebhookError("Invalid Pinch webhook timestamp");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    throw new PinchWebhookError("Pinch webhook timestamp is outside tolerance");
  }

  const signedPayload = `${signatureParts.timestamp}.${input.rawBody.toString("utf8")}`;
  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(signedPayload)
    .digest("hex");

  if (!timingSafeEqualHex(expectedSignature, signatureParts.signature)) {
    throw new PinchWebhookError("Pinch webhook signature verification failed");
  }

  return { timestamp };
}

function parseSignatureHeader(header: string) {
  return header.split(",").reduce(
    (parts, pair) => {
      const [key, value] = pair.split("=");
      if (key === "t") {
        parts.timestamp = value;
      }
      if (key === "v2") {
        parts.signature = value;
      }
      return parts;
    },
    {} as { timestamp?: string; signature?: string }
  );
}

function timingSafeEqualHex(left: string, right: string) {
  try {
    const leftBuffer = Buffer.from(left, "hex");
    const rightBuffer = Buffer.from(right, "hex");
    return (
      leftBuffer.length === rightBuffer.length &&
      crypto.timingSafeEqual(leftBuffer, rightBuffer)
    );
  } catch {
    return false;
  }
}
