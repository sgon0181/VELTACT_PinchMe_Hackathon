import { env } from "../env.js";

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

class PinchClient {
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
    metadata?: unknown;
  }) {
    return this.request<unknown>("/payment-links", {
      method: "POST",
      body: {
        amount: input.amount,
        payerId: input.payerId,
        description: input.description,
        allowedPaymentMethods: ["credit-card"],
        returnUrl: env.PINCH_RETURN_URL,
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

  private async getAccessToken() {
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

function getErrorCode(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  const code = record.error ?? record.code ?? record.errorCode;
  return typeof code === "string" ? code : undefined;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export const pinchClient = new PinchClient();
