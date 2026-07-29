export function apiBaseUrl() {
    const configuredBase = window.API_BASE_URL?.trim();
    return (configuredBase || `${window.location.origin}/api`).replace(/\/$/, "");
}
export function healthAllowsDemoControls(value) {
    if (!value || typeof value !== "object")
        return false;
    const environment = value.environment;
    return environment === "development" || environment === "test";
}
export function healthAllowsLocalDemoPayment(value) {
    if (!healthAllowsDemoControls(value))
        return false;
    const health = value;
    return (health.paymentProvider === "local_demo" &&
        health.readiness?.localDemoPayment === true);
}
export async function demoControlsEnabled(apiBase = apiBaseUrl(), request = fetch) {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), 1500);
    try {
        const response = await request(`${apiBase.replace(/\/$/, "")}/health`, {
            headers: { Accept: "application/json" },
            cache: "no-store",
            signal: controller.signal
        });
        if (!response.ok)
            return false;
        return healthAllowsDemoControls(await response.json());
    }
    catch {
        return false;
    }
    finally {
        globalThis.clearTimeout(timeout);
    }
}
export async function localDemoPaymentEnabled(apiBase = apiBaseUrl(), request = fetch) {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), 1500);
    try {
        const response = await request(`${apiBase.replace(/\/$/, "")}/health`, {
            headers: { Accept: "application/json" },
            cache: "no-store",
            signal: controller.signal
        });
        if (!response.ok)
            return false;
        return healthAllowsLocalDemoPayment(await response.json());
    }
    catch {
        return false;
    }
    finally {
        globalThis.clearTimeout(timeout);
    }
}
