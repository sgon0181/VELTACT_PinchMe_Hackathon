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
  supplier: Supplier;
  score: number;
  explanation: string[];
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
  token: string;
  needId: string;
  supplierId: string;
  supplierName: string;
  status: "invited" | "viewed" | "responded";
  createdAt: string;
  viewedAt?: string;
  respondedAt?: string;
};

export type SupplierResponse = {
  id: string;
  needId: string;
  supplierId: string;
  supplierName: string;
  canHelp: boolean;
  earliestAvailability: string;
  indicativePriceAud: number;
  relevantExperience: string;
  conditions: string;
  submittedAt: string;
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
