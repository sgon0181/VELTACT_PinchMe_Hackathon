import { pinchClient } from "../pinch/pinchClient.js";
import type { PaymentProvider } from "./paymentProvider.js";

let paymentProvider: PaymentProvider = pinchClient;

export function getPaymentProvider() {
  return paymentProvider;
}

export function setPaymentProviderForTest(provider: PaymentProvider) {
  paymentProvider = provider;
}

export function resetPaymentProviderForTest() {
  paymentProvider = pinchClient;
}
