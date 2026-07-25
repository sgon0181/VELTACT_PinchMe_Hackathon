export type CreateHostedPaymentLinkInput = {
  engagementId: string;
  needId: string;
  supplierId: string;
  buyerEmail: string;
  buyerName?: string;
  amount: number;
  description: string;
  returnUrl: string;
};

export type HostedPaymentLink = {
  provider: "pinch";
  payerId: string;
  paymentLinkId: string;
  hostedCheckoutUrl: string;
};

export interface PaymentProvider {
  createHostedPaymentLink(input: CreateHostedPaymentLinkInput): Promise<HostedPaymentLink>;
}
