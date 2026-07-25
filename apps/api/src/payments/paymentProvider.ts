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

export type AuthoritativePaymentResult = {
  provider: "pinch";
  paymentId: string;
  status: "approved";
};

export interface PaymentProvider {
  createHostedPaymentLink(input: CreateHostedPaymentLinkInput): Promise<HostedPaymentLink>;
  getApprovedPaymentForLink(paymentLinkId: string): Promise<AuthoritativePaymentResult | undefined>;
}
