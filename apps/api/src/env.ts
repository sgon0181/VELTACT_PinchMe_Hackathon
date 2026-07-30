import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

dotenv.config({
  path: path.join(apiRoot, ".env")
});

const optionalProviderString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional()
);
const optionalProviderEmail = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().email().optional()
);
const optionalProviderUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().url().optional()
);
const optionalBoolean = z.preprocess((value) => {
  if (value === undefined || value === "") return undefined;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return value;
}, z.boolean().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  IS_PULL_REQUEST: z.enum(["true", "false"]).optional(),
  RENDER_EXTERNAL_URL: optionalProviderUrl,
  RENDER_GIT_COMMIT: z.string().trim().regex(/^[0-9a-f]{7,40}$/i).optional(),
  VELTACT_RELEASE_SHA: z.string().trim().regex(/^[0-9a-f]{7,40}$/i).optional(),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:4000"),
  PUBLIC_BASE_URL: z.string().url().optional(),
  API_PUBLIC_URL: z.string().url().optional(),
  MARKETPLACE_DATA_FILE: optionalProviderString,
  VELTACT_V2_DATA_FILE: optionalProviderString,
  ACCOUNT_DATA_FILE: optionalProviderString,
  SUPPLIER_CATALOG_FILE: optionalProviderString,
  BUYER_CAPABILITY_AUTH_REQUIRED: optionalBoolean,
  API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  AI_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  PAYMENT_PROVIDER: z.enum(["pinch", "local_demo"]).default("pinch"),
  EMAIL_PROVIDER: z.enum(["local_demo", "resend", "sendgrid"]).default("local_demo"),
  EMAIL_FROM: optionalProviderString,
  RESEND_API_KEY: optionalProviderString,
  SENDGRID_API_KEY: optionalProviderString,
  SMS_PROVIDER: z.enum(["none", "local_demo", "twilio"]).default("none"),
  TWILIO_ACCOUNT_SID: optionalProviderString,
  TWILIO_AUTH_TOKEN: optionalProviderString,
  TWILIO_FROM_NUMBER: optionalProviderString,
  TWILIO_WHATSAPP_FROM: optionalProviderString,
  SUPPLIER_OUTREACH_EMAIL_TO: optionalProviderEmail,
  SUPPLIER_OUTREACH_SMS_TO: optionalProviderString,
  SUPPLIER_OUTREACH_WHATSAPP_TO: optionalProviderString,
  OPENAI_API_KEY: z.string().trim().min(1).optional(),
  OPENAI_MODEL: z.string().trim().min(1).default("gpt-5.4-mini"),
  VELTACT_RESEARCH_PROVIDER: z
    .enum(["auto", "openai", "fixture"])
    .default("auto"),
  VELTACT_DISCOVERY_PROVIDER: z
    .enum(["auto", "openai", "perplexity", "fixture"])
    .default("auto"),
  VELTACT_SERVICE_FEE_BPS: z.coerce.number().int().min(0).max(10_000).default(500),
  PERPLEXITY_API_KEY: optionalProviderString,
  FIRECRAWL_API_KEY: optionalProviderString,
  PINCH_CLIENT_ID: optionalProviderString,
  PINCH_SECRET_KEY: optionalProviderString,
  PINCH_AUTH_URL: optionalProviderUrl,
  PINCH_API_BASE_URL: optionalProviderUrl,
  PINCH_API_VERSION: optionalProviderString,
  PINCH_RETURN_URL: optionalProviderUrl,
  PINCH_WEBHOOK_SECRET: optionalProviderString
}).superRefine((value, context) => {
  if (value.PAYMENT_PROVIDER !== "pinch") return;
  const requiredFields = [
    "PINCH_CLIENT_ID",
    "PINCH_SECRET_KEY",
    "PINCH_AUTH_URL",
    "PINCH_API_BASE_URL"
  ] as const;
  for (const field of requiredFields) {
    if (value[field]) continue;
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [field],
      message: `${field} is required when PAYMENT_PROVIDER=pinch`
    });
  }

  if (value.NODE_ENV !== "production") return;
  if (!value.PINCH_WEBHOOK_SECRET) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["PINCH_WEBHOOK_SECRET"],
      message:
        "PINCH_WEBHOOK_SECRET is required for authoritative payment confirmation in production"
    });
  }

  for (const [field, configuredUrl] of [
    ["WEB_ORIGIN", value.WEB_ORIGIN],
    ["PUBLIC_BASE_URL", value.PUBLIC_BASE_URL ?? value.WEB_ORIGIN],
    [
      "PINCH_RETURN_URL",
      value.PINCH_RETURN_URL ??
        new URL("/api/pinch/return", value.WEB_ORIGIN).toString()
    ]
  ] as const) {
    if (new URL(configuredUrl).protocol === "https:") continue;
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [field],
      message: `${field} must use HTTPS when Pinch is enabled in production`
    });
  }
});

export function parseEnvironment(
  source: Record<string, unknown>
) {
  const previewOverrides = renderPreviewOverrides(source);
  return envSchema.parse({
    ...source,
    ...previewOverrides,
    PINCH_CLIENT_ID: source.PINCH_CLIENT_ID ?? source.PINCH_APPLICATION_ID
  });
}

const parsedEnv = parseEnvironment(process.env);

export const env = {
  ...parsedEnv,
  RELEASE_REVISION:
    parsedEnv.VELTACT_RELEASE_SHA ?? parsedEnv.RENDER_GIT_COMMIT ?? "local",
  PINCH_CLIENT_ID: parsedEnv.PINCH_CLIENT_ID ?? "",
  PINCH_SECRET_KEY: parsedEnv.PINCH_SECRET_KEY ?? "",
  PINCH_AUTH_URL: parsedEnv.PINCH_AUTH_URL ?? "",
  PINCH_API_BASE_URL: parsedEnv.PINCH_API_BASE_URL ?? "",
  PINCH_API_VERSION: parsedEnv.PINCH_API_VERSION ?? "2020.1",
  MARKETPLACE_DATA_FILE:
    parsedEnv.MARKETPLACE_DATA_FILE === undefined
      ? parsedEnv.NODE_ENV === "test"
        ? undefined
        : path.join(apiRoot, ".data", "marketplace.json")
      : resolveApiPath(parsedEnv.MARKETPLACE_DATA_FILE),
  SUPPLIER_CATALOG_FILE:
    parsedEnv.SUPPLIER_CATALOG_FILE === undefined
      ? undefined
      : resolveApiPath(parsedEnv.SUPPLIER_CATALOG_FILE),
  VELTACT_V2_DATA_FILE:
    parsedEnv.VELTACT_V2_DATA_FILE === undefined
      ? parsedEnv.NODE_ENV === "test"
        ? undefined
        : path.join(apiRoot, ".data", "veltact-v2.json")
      : resolveApiPath(parsedEnv.VELTACT_V2_DATA_FILE),
  ACCOUNT_DATA_FILE:
    parsedEnv.ACCOUNT_DATA_FILE === undefined
      ? parsedEnv.NODE_ENV === "test"
        ? undefined
        : path.join(apiRoot, ".data", "accounts.json")
      : resolveApiPath(parsedEnv.ACCOUNT_DATA_FILE),
  BUYER_CAPABILITY_AUTH_REQUIRED:
    parsedEnv.BUYER_CAPABILITY_AUTH_REQUIRED ?? (parsedEnv.NODE_ENV === "production"),
  API_PUBLIC_URL: parsedEnv.API_PUBLIC_URL ?? `http://localhost:${parsedEnv.PORT}`,
  PUBLIC_BASE_URL: parsedEnv.PUBLIC_BASE_URL ?? parsedEnv.WEB_ORIGIN,
  PINCH_RETURN_URL:
    parsedEnv.PINCH_RETURN_URL ?? new URL("/api/pinch/return", parsedEnv.WEB_ORIGIN).toString()
};

function resolveApiPath(value: string) {
  return path.isAbsolute(value) ? value : path.resolve(apiRoot, value);
}

function renderPreviewOverrides(source: Record<string, unknown>) {
  if (source.IS_PULL_REQUEST !== "true") return {};

  const externalUrl = optionalProviderUrl.parse(source.RENDER_EXTERNAL_URL);
  if (!externalUrl) {
    throw new Error(
      "RENDER_EXTERNAL_URL is required for a Render pull request preview"
    );
  }

  const parsed = new URL(externalUrl);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      "RENDER_EXTERNAL_URL must be a credential-free HTTPS origin"
    );
  }

  const origin = parsed.origin;
  return {
    WEB_ORIGIN: origin,
    PUBLIC_BASE_URL: origin,
    API_PUBLIC_URL: origin,
    PINCH_RETURN_URL: new URL("/api/pinch/return", origin).toString()
  };
}
