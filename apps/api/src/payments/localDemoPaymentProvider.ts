import type {
  CreateHostedPaymentLinkInput,
  HostedPaymentLink,
  PaymentProvider
} from "./paymentProvider.js";

const localDemoPayerPrefix = "local_demo_payer_";
const localDemoPaymentLinkPrefix = "local_demo_link_";

type LocalDemoHostedPaymentLinkIdentity = Pick<
  HostedPaymentLink,
  "payerId" | "paymentLinkId" | "hostedCheckoutUrl"
>;

export class LocalDemoPaymentProvider implements PaymentProvider {
  readonly provider = "local_demo" as const;

  async createHostedPaymentLink(
    input: CreateHostedPaymentLinkInput
  ): Promise<HostedPaymentLink> {
    const paymentLinkId = `${localDemoPaymentLinkPrefix}${input.engagementId}`;
    const hostedCheckoutUrl = new URL(input.returnUrl);
    hostedCheckoutUrl.searchParams.set("payment_provider", "local_demo");
    hostedCheckoutUrl.searchParams.set("payment_link_id", paymentLinkId);

    return {
      provider: "local_demo",
      payerId: `${localDemoPayerPrefix}${input.needId}`,
      paymentLinkId,
      hostedCheckoutUrl: hostedCheckoutUrl.toString()
    };
  }

  async getApprovedPaymentForLink(_paymentLinkId: string) {
    // Local demo evidence is recorded only by the explicit demo-payment route.
    // It must never be presented as an authoritative provider payment.
    return undefined;
  }
}

export function isLocalDemoPaymentLinkId(paymentLinkId: string) {
  return paymentLinkId.startsWith(localDemoPaymentLinkPrefix);
}

export function isLocalDemoHostedPaymentLink(
  link: LocalDemoHostedPaymentLinkIdentity
) {
  if (
    !link.payerId.startsWith(localDemoPayerPrefix) ||
    !isLocalDemoPaymentLinkId(link.paymentLinkId)
  ) {
    return false;
  }
  try {
    const url = new URL(link.hostedCheckoutUrl);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      url.searchParams.get("payment_provider") === "local_demo" &&
      url.searchParams.get("payment_link_id") === link.paymentLinkId
    );
  } catch {
    return false;
  }
}

export const localDemoPaymentProvider = new LocalDemoPaymentProvider();
