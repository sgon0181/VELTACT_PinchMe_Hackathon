export type CreateHostedPaymentLinkInput = {
  engagementId: string;
  needId: string;
  supplierId: string;
  buyerEmail: string;
  buyerName?: string;
  amount: number;
  currency?: string;
  description: string;
  returnUrl: string;
  metadata?: Record<string, string>;
};

export type HostedPaymentLink = {
  provider: "pinch" | "local_demo";
  payerId: string;
  paymentLinkId: string;
  hostedCheckoutUrl: string;
};

export type AuthoritativePaymentResult = {
  provider: "pinch";
  paymentId: string;
  status: "approved";
  paymentLinkId?: string;
  payerId?: string;
  amount?: number;
  currency?: string;
  metadata?: unknown;
};

export interface PaymentProvider {
  readonly provider?: HostedPaymentLink["provider"];
  createHostedPaymentLink(input: CreateHostedPaymentLinkInput): Promise<HostedPaymentLink>;
  getApprovedPaymentForLink(paymentLinkId: string): Promise<AuthoritativePaymentResult | undefined>;
  cancelHostedPaymentLink?(paymentLinkId: string): Promise<void>;
}
