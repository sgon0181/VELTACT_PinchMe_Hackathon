import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

dotenv.config({
  path: path.join(apiRoot, ".env")
});

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:4000"),
  API_PUBLIC_URL: z.string().url().optional(),
  EMAIL_PROVIDER: z.enum(["local_demo", "resend", "sendgrid"]).default("local_demo"),
  EMAIL_FROM: z.string().trim().min(1).optional(),
  RESEND_API_KEY: z.string().trim().min(1).optional(),
  SENDGRID_API_KEY: z.string().trim().min(1).optional(),
  SMS_PROVIDER: z.enum(["none", "twilio"]).default("none"),
  TWILIO_ACCOUNT_SID: z.string().trim().min(1).optional(),
  TWILIO_AUTH_TOKEN: z.string().trim().min(1).optional(),
  TWILIO_FROM_NUMBER: z.string().trim().min(1).optional(),
  SUPPLIER_OUTREACH_EMAIL_TO: z.string().trim().email().optional(),
  SUPPLIER_OUTREACH_SMS_TO: z.string().trim().min(1).optional(),
  OPENAI_API_KEY: z.string().trim().min(1).optional(),
  OPENAI_MODEL: z.string().trim().min(1).default("gpt-5.6"),
  PINCH_CLIENT_ID: z.string().min(1, "PINCH_CLIENT_ID is required"),
  PINCH_SECRET_KEY: z.string().min(1, "PINCH_SECRET_KEY is required"),
  PINCH_AUTH_URL: z.string().url(),
  PINCH_API_BASE_URL: z.string().url(),
  PINCH_API_VERSION: z.string().min(1).default("2020.1"),
  PINCH_RETURN_URL: z.string().url().optional(),
  PINCH_WEBHOOK_SECRET: z.string().min(1).optional()
});

const rawEnv = {
  ...process.env,
  PINCH_CLIENT_ID: process.env.PINCH_CLIENT_ID ?? process.env.PINCH_APPLICATION_ID
};

const parsedEnv = envSchema.parse(rawEnv);

export const env = {
  ...parsedEnv,
  API_PUBLIC_URL: parsedEnv.API_PUBLIC_URL ?? `http://localhost:${parsedEnv.PORT}`,
  PINCH_RETURN_URL:
    parsedEnv.PINCH_RETURN_URL ?? new URL("/api/pinch/return", parsedEnv.WEB_ORIGIN).toString()
};
