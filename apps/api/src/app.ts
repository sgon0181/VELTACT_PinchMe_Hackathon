import cors from "cors";
import express from "express";
import type { Request } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./env.js";
import { aiIntakeRouter } from "./aiIntake/aiIntakeRoutes.js";
import { marketplaceRouter } from "./marketplace/marketplaceRoutes.js";
import { pinchRouter } from "./pinch/pinchRoutes.js";
import { createRateLimiter } from "./rateLimit.js";
import { v2Router } from "./v2/routes.js";

export const app = express();
app.disable("x-powered-by");
const buyerPublicPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../buyer/public"
);

app.use(
  cors({
    origin: env.WEB_ORIGIN
  })
);
app.use((_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});
app.use(
  "/api/ai-intake",
  createRateLimiter({
    limit: env.AI_RATE_LIMIT_MAX,
    scope: "ai-intake"
  })
);
app.use(
  "/api",
  createRateLimiter({
    limit: env.API_RATE_LIMIT_MAX,
    scope: "api"
  })
);
app.use(
  express.json({
    limit: "12mb",
    verify: (request, _response, buffer) => {
      (request as Request).rawBody = buffer;
    }
  })
);

app.get("/api/health", (_request, response) => {
  response.json({
    application: "veltact-api",
    status: "ok",
    environment: env.NODE_ENV,
    readiness: {
      persistence: Boolean(env.MARKETPLACE_DATA_FILE),
      v2Persistence: Boolean(env.VELTACT_V2_DATA_FILE),
      buyerCapabilityAuth: env.BUYER_CAPABILITY_AUTH_REQUIRED,
      pinch: true,
      openAi: Boolean(env.OPENAI_API_KEY),
      v2Research:
        env.VELTACT_RESEARCH_PROVIDER === "fixture" || Boolean(env.OPENAI_API_KEY),
      email:
        env.EMAIL_PROVIDER === "local_demo"
          ? env.NODE_ENV !== "production"
          : Boolean(
              env.EMAIL_FROM &&
                (env.EMAIL_PROVIDER === "resend"
                  ? env.RESEND_API_KEY
                  : env.SENDGRID_API_KEY)
            ),
      sms: Boolean(
        env.SMS_PROVIDER === "twilio" &&
          env.TWILIO_ACCOUNT_SID &&
          env.TWILIO_AUTH_TOKEN &&
          env.TWILIO_FROM_NUMBER &&
          env.SUPPLIER_OUTREACH_SMS_TO
      ),
      whatsapp: Boolean(
        env.SMS_PROVIDER === "twilio" &&
          env.TWILIO_ACCOUNT_SID &&
          env.TWILIO_AUTH_TOKEN &&
          env.TWILIO_WHATSAPP_FROM &&
          env.SUPPLIER_OUTREACH_WHATSAPP_TO
      )
    },
    timestamp: new Date().toISOString()
  });
});

app.use("/api/pinch", pinchRouter);
app.use("/api/ai-intake", aiIntakeRouter);
app.use("/api/v2", v2Router);
app.use("/api", marketplaceRouter);

app.get("/", (_request, response) => {
  response.sendFile(path.join(buyerPublicPath, "landing.html"));
});
app.use(express.static(buyerPublicPath, { index: false }));
