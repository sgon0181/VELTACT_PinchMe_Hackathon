import { env } from "../env.js";
import { pinchClient } from "../pinch/pinchClient.js";
import { localDemoPaymentProvider } from "./localDemoPaymentProvider.js";
import type { PaymentProvider } from "./paymentProvider.js";

export type PaymentProviderMode = "pinch" | "local_demo";

export function createConfiguredPaymentProvider(input: {
  nodeEnv: "development" | "test" | "production";
  mode: PaymentProviderMode;
}): PaymentProvider {
  if (input.mode === "local_demo") {
    if (input.nodeEnv === "production") {
      throw new Error(
        "PAYMENT_PROVIDER=local_demo is unavailable in production"
      );
    }
    return localDemoPaymentProvider;
  }
  return pinchClient;
}

const configuredPaymentProvider = createConfiguredPaymentProvider({
  nodeEnv: env.NODE_ENV,
  mode: env.PAYMENT_PROVIDER
});
let paymentProvider: PaymentProvider = configuredPaymentProvider;

export function getPaymentProvider() {
  return paymentProvider;
}

export function setPaymentProviderForTest(provider: PaymentProvider) {
  paymentProvider = provider;
}

export function resetPaymentProviderForTest() {
  paymentProvider = configuredPaymentProvider;
}
