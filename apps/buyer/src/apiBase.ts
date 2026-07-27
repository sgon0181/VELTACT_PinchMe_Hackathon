type RuntimeWindow = Window & {
  API_BASE_URL?: string;
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
