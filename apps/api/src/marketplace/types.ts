import type { Supplier } from "./suppliers.js";

export type NeedProfile = {
  title: string;
  description: string;
  category: string;
  industry: string;
  location: string;
  urgencyDays?: number;
  budgetAud?: number;
  requiredCapabilities?: string[];
};

export type SupplierMatch = {
  id: string;
  supplier: Supplier;
  score: number;
  explanation: string[];
  risks: string[];
  status: "matched" | "invited" | "responded" | "declined" | "expired" | "selected" | "not_selected";
  createdAt: string;
  updatedAt: string;
};

export type NeedRecord = {
  id: string;
  buyerEmail: string;
  profile: NeedProfile;
  matches: SupplierMatch[];
  invitations: SupplierInvitation[];
  status: "responses_open" | "selected" | "payment_pending" | "secured";
  createdAt: string;
  updatedAt: string;
};

export type SupplierInvitation = {
  id: string;
  token: string;
  needId: string;
  needProfileId: string;
  supplierId: string;
  supplierName: string;
  matchId: string;
  responseUrl: string;
  status: "pending" | "sent" | "opened" | "responded" | "expired" | "cancelled";
  sentAt: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  openedAt?: string;
  respondedAt?: string;
};

export type SupplierResponse = {
  id: string;
  needId: string;
  needProfileId: string;
  supplierId: string;
  supplierName: string;
  invitationId: string;
  canHelp: boolean;
  decision: "can_help" | "cannot_help";
  earliestAvailability: string;
  availability?: string;
  indicativePriceAud: number;
  indicativePrice?: {
    amount: number;
    currency: "AUD";
  };
  relevantExperience: string;
  conditions: string;
  status: "draft" | "submitted" | "withdrawn";
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type Engagement = {
  id: string;
  needId: string;
  supplierId: string;
  supplierName: string;
  supplierResponseId: string;
  status:
    | "supplier_selected"
    | "payment_link_created"
    | "payment_pending"
    | "supplier_secured"
    | "payment_failed"
    | "cancelled";
  paymentStatus:
    | "not_started"
    | "link_created"
    | "awaiting_payment"
    | "pending"
    | "paid"
    | "failed"
    | "cancelled"
    | "refunded";
  paymentLinkId?: string;
  hostedCheckoutUrl?: string;
  pinchPayerId?: string;
  pinchPaymentId?: string;
  securedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type PinchWebhookEvidence = {
  eventId: string;
  eventType: string;
  engagementId: string;
  paymentId?: string;
  receivedAt: string;
  payload: unknown;
};
