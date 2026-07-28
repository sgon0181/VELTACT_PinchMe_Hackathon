import { env } from "../env.js";
import type {
  AuthoritativePaymentResult,
  CreateHostedPaymentLinkInput,
  HostedPaymentLink,
  PaymentProvider
} from "../payments/paymentProvider.js";

type CachedToken = {
  accessToken: string;
  expiresAt: number;
};

type TokenResponse = {
  access_token: string;
  expires_in?: number;
  token_type?: string;
};

export class PinchApiError extends Error {
  constructor(
    message: string,
    readonly statusCode = 502,
    readonly upstreamStatus?: number,
    readonly upstreamCode?: string
  ) {
    super(message);
    this.name = "PinchApiError";
  }
}

export class PinchClient implements PaymentProvider {
  readonly provider = "pinch" as const;
  private cachedToken: CachedToken | undefined;

  async health() {
    return this.request<unknown>("/health/auth", { method: "GET" });
  }

  async createPayer(input: {
    firstName: string;
    lastName?: string;
    emailAddress: string;
    companyName?: string;
  }) {
    return this.request<unknown>("/payers", {
      method: "POST",
      body: input
    });
  }

  async createPaymentLink(input: {
    payerId: string;
    amount: number;
    description: string;
    returnUrl?: string;
    metadata?: unknown;
  }) {
    return this.request<unknown>("/payment-links", {
      method: "POST",
      body: {
        amount: input.amount,
        payerId: input.payerId,
        description: input.description,
        allowedPaymentMethods: ["credit-card"],
        returnUrl: input.returnUrl ?? env.PINCH_RETURN_URL,
        ...(input.metadata === undefined
          ? {}
          : {
              metadata:
                typeof input.metadata === "string"
                  ? input.metadata
                  : JSON.stringify(input.metadata)
            })
      }
    });
  }

  async getPaymentLink(paymentLinkId: string) {
    return this.request<unknown>(`/payment-links/${encodeURIComponent(paymentLinkId)}`, {
      method: "GET"
    });
  }

  async getApprovedPaymentForLink(
    paymentLinkId: string
  ): Promise<AuthoritativePaymentResult | undefined> {
    const paymentLink = await this.getPaymentLink(paymentLinkId);
    const approvedPayment = findApprovedPayment(paymentLink);
    if (!approvedPayment) {
      return undefined;
    }

    return {
      provider: "pinch",
      paymentId: approvedPayment,
      status: "approved"
    };
  }

  async createHostedPaymentLink(
    input: CreateHostedPaymentLinkInput
  ): Promise<HostedPaymentLink> {
    const payerResponse = await this.createPayer({
      firstName: input.buyerName ?? input.buyerEmail.split("@")[0],
      emailAddress: input.buyerEmail
    });
    const payerId = findStringValue(payerResponse, ["id", "payerId"]);
    if (!payerId) {
      throw new PinchApiError("Pinch payer response was missing payer id");
    }

    const linkResponse = await this.createPaymentLink({
      payerId,
      amount: input.amount,
      description: input.description,
      returnUrl: input.returnUrl,
      metadata: {
        engagementId: input.engagementId,
        needId: input.needId,
        supplierId: input.supplierId,
        ...input.metadata
      }
    });

    const paymentLinkId = findStringValue(linkResponse, ["id", "paymentLinkId"]);
    const hostedCheckoutUrl = findStringValue(linkResponse, [
      "url",
      "hostedUrl",
      "hostedCheckoutUrl",
      "paymentUrl"
    ]);

    if (!paymentLinkId || !hostedCheckoutUrl) {
      throw new PinchApiError("Pinch payment link response was incomplete");
    }
    assertPinchHostedCheckoutUrl(hostedCheckoutUrl);

    return {
      provider: "pinch",
      payerId,
      paymentLinkId,
      hostedCheckoutUrl
    };
  }

  private async getAccessToken() {
    assertPinchSandboxConfiguration({
      authUrl: env.PINCH_AUTH_URL,
      apiBaseUrl: env.PINCH_API_BASE_URL,
      secretKey: env.PINCH_SECRET_KEY
    });
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 60_000) {
      return this.cachedToken.accessToken;
    }

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      scope: "api1"
    });

    const basicToken = Buffer.from(
      `${env.PINCH_CLIENT_ID}:${env.PINCH_SECRET_KEY}`
    ).toString("base64");

    let response: Response;
    try {
      response = await fetch(env.PINCH_AUTH_URL, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json"
        },
        body
      });
    } catch {
      throw new PinchApiError("Unable to reach Pinch authentication service");
    }

    const payload = await safeReadJson(response);
    if (!response.ok) {
      throw new PinchApiError(
        "Pinch authentication failed",
        502,
        response.status,
        getErrorCode(payload)
      );
    }

    const token = parseTokenResponse(payload);
    const expiresInSeconds = token.expires_in ?? 3600;
    this.cachedToken = {
      accessToken: token.access_token,
      expiresAt: now + expiresInSeconds * 1000
    };

    return token.access_token;
  }

  private async request<T>(
    path: string,
    options: { method: "GET" | "POST"; body?: unknown }
  ): Promise<T> {
    const token = await this.getAccessToken();
    const url = new URL(`${trimTrailingSlash(env.PINCH_API_BASE_URL)}${path}`);

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method,
        headers: {
          Authorization: `Bearer ${token}`,
          "pinch-version": env.PINCH_API_VERSION,
          Accept: "application/json",
          ...(options.body === undefined
            ? {}
            : { "Content-Type": "application/json" })
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
      });
    } catch {
      throw new PinchApiError("Unable to reach Pinch API");
    }

    const payload = await safeReadJson(response);
    if (!response.ok) {
      throw new PinchApiError(
        "Pinch API request failed",
        502,
        response.status,
        getErrorCode(payload)
      );
    }

    return payload as T;
  }
}

export function assertPinchSandboxConfiguration(input: {
  authUrl?: string;
  apiBaseUrl: string;
  secretKey: string;
}) {
  const apiUrl = new URL(input.apiBaseUrl);
  const usesOfficialSandbox =
    apiUrl.protocol === "https:" &&
    apiUrl.hostname === "api.getpinch.com.au" &&
    ["/test", "/test/"].includes(apiUrl.pathname) &&
    apiUrl.username === "" &&
    apiUrl.password === "" &&
    apiUrl.search === "" &&
    apiUrl.hash === "";
  const isTestFixtureHost =
    apiUrl.protocol === "https:" && apiUrl.hostname.endsWith(".test");
  const usesObviousLiveSecret = input.secretKey
    .toLowerCase()
    .startsWith("sk_live_");
  if (
    usesObviousLiveSecret ||
    (!usesOfficialSandbox && !isTestFixtureHost)
  ) {
    throw new PinchApiError(
      "Live Pinch configuration is not permitted in this integration",
      503
    );
  }

  if (input.authUrl) {
    const authUrl = new URL(input.authUrl);
    const usesOfficialAuth =
      authUrl.protocol === "https:" &&
      authUrl.hostname === "auth.getpinch.com.au" &&
      authUrl.pathname === "/connect/token" &&
      authUrl.username === "" &&
      authUrl.password === "" &&
      authUrl.search === "" &&
      authUrl.hash === "";
    const usesTestFixtureAuth =
      authUrl.protocol === "https:" && authUrl.hostname.endsWith(".test");
    if (!usesOfficialAuth && !usesTestFixtureAuth) {
      throw new PinchApiError(
        "Untrusted Pinch authentication configuration is not permitted",
        503
      );
    }
  }
}

export function assertPinchHostedCheckoutUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PinchApiError(
      "Pinch payment link response contained an untrusted URL"
    );
  }
  if (
    url.protocol !== "https:" ||
    !["pay.getpinch.com.au", "sandbox.getpinch.com.au"].includes(
      url.hostname
    ) ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new PinchApiError(
      "Pinch payment link response contained an untrusted URL"
    );
  }
}

function parseTokenResponse(payload: unknown): TokenResponse {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "access_token" in payload &&
    typeof payload.access_token === "string"
  ) {
    return payload as TokenResponse;
  }

  throw new PinchApiError("Pinch authentication response was invalid");
}

async function safeReadJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: "Pinch returned a non-JSON response" };
  }
}

function getErrorCode(payload: unknown): string | undefined {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const nested: string | undefined = getErrorCode(item);
      if (nested) {
        return nested;
      }
    }
    return undefined;
  }

  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  const code = record.error ?? record.code ?? record.errorCode ?? record.message ?? record.title;
  if (typeof code === "string") {
    return code;
  }

  for (const value of Object.values(record)) {
    const nested: string | undefined = getErrorCode(value);
    if (nested) {
      return nested;
    }
  }

  return undefined;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
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

function findApprovedPayment(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  const payments = record.payments ?? record.Payments;
  if (!Array.isArray(payments)) {
    return undefined;
  }

  for (const payment of payments) {
    if (typeof payment !== "object" || payment === null) {
      continue;
    }

    const paymentRecord = payment as Record<string, unknown>;
    const status = String(paymentRecord.status ?? paymentRecord.Status ?? "").toLowerCase();
    const paymentId = paymentRecord.id ?? paymentRecord.Id;
    if (status === "approved" && typeof paymentId === "string") {
      return paymentId;
    }
  }

  return undefined;
}

export const pinchClient = new PinchClient();
