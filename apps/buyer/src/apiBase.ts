type RuntimeWindow = Window & {
  API_BASE_URL?: string;
};

export type OutreachOverrideAvailability = {
  email: boolean;
  sms: boolean;
};

const noOutreachOverrides: OutreachOverrideAvailability = {
  email: false,
  sms: false
};

export function apiBaseUrl() {
  const configuredBase = (window as RuntimeWindow).API_BASE_URL?.trim();
  return (configuredBase || `${window.location.origin}/api`).replace(/\/$/, "");
}

export function healthAllowsDemoControls(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const environment = (value as { environment?: unknown }).environment;
  return environment === "development" || environment === "test";
}

export function healthAllowsLocalDemoPayment(value: unknown) {
  if (!healthAllowsDemoControls(value)) return false;
  const health = value as {
    paymentProvider?: unknown;
    readiness?: { localDemoPayment?: unknown };
  };
  return (
    health.paymentProvider === "local_demo" &&
    health.readiness?.localDemoPayment === true
  );
}

export function healthOutreachOverrideAvailability(
  value: unknown
): OutreachOverrideAvailability {
  if (!healthAllowsDemoControls(value)) return noOutreachOverrides;
  const health = value as {
    providerModes?: { email?: unknown; sms?: unknown };
    readiness?: {
      email?: unknown;
      sms?: unknown;
      outreachRecipientOverrides?: unknown;
    };
  };
  if (health.readiness?.outreachRecipientOverrides !== true) {
    return noOutreachOverrides;
  }
  return {
    email:
      health.readiness.email === true &&
      (health.providerModes?.email === "resend" ||
        health.providerModes?.email === "sendgrid"),
    sms:
      health.readiness.sms === true &&
      health.providerModes?.sms === "twilio"
  };
}

export async function demoControlsEnabled(
  apiBase = apiBaseUrl(),
  request: typeof fetch = fetch
) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 1500);
  try {
    const response = await request(`${apiBase.replace(/\/$/, "")}/health`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) return false;
    return healthAllowsDemoControls(await response.json());
  } catch {
    return false;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function localDemoPaymentEnabled(
  apiBase = apiBaseUrl(),
  request: typeof fetch = fetch
) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 1500);
  try {
    const response = await request(`${apiBase.replace(/\/$/, "")}/health`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) return false;
    return healthAllowsLocalDemoPayment(await response.json());
  } catch {
    return false;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function outreachOverrideAvailability(
  apiBase = apiBaseUrl(),
  request: typeof fetch = fetch
): Promise<OutreachOverrideAvailability> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 1500);
  try {
    const response = await request(`${apiBase.replace(/\/$/, "")}/health`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) return noOutreachOverrides;
    return healthOutreachOverrideAvailability(await response.json());
  } catch {
    return noOutreachOverrides;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
