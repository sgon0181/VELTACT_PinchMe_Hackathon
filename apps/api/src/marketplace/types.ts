import type {
  Engagement as ContractEngagement,
  MarketplaceAuditEvent,
  MarketplaceNeedProfile,
  NeedProfileStatus,
  SupplierInvitation as ContractSupplierInvitation,
  SupplierMatch as ContractSupplierMatch,
  SupplierOutreachDelivery,
  SupplierResponse as ContractSupplierResponse
} from "@veltact/contracts";
import type { Supplier } from "./suppliers.js";

export type NeedProfile = MarketplaceNeedProfile;

export type SupplierMatch = Omit<
  ContractSupplierMatch,
  "needProfileId" | "supplierId" | "reasons"
> & {
  supplier: Supplier;
  explanation: ContractSupplierMatch["reasons"];
};

export type NeedRecord = {
  id: string;
  buyerEmail: string;
  buyerAccessTokenHash: string;
  profile: NeedProfile;
  matches: SupplierMatch[];
  invitations: SupplierInvitation[];
  status: Extract<
    NeedProfileStatus,
    "responses_open" | "selected" | "payment_pending" | "secured"
  >;
  createdAt: string;
  updatedAt: string;
};

export type SupplierInvitation = Omit<ContractSupplierInvitation, "sentAt"> & {
  needId: string;
  supplierName: string;
  sentAt: string;
  openedAt?: string;
  respondedAt?: string;
};

export type { MarketplaceAuditEvent, SupplierOutreachDelivery };

export type SupplierResponse = Omit<
  ContractSupplierResponse,
  "availability" | "indicativePrice" | "relevantExperience" | "conditions" | "submittedAt"
> & {
  needId: string;
  supplierName: string;
  canHelp: boolean;
  earliestAvailability: string;
  availability: string;
  indicativePriceAud: number;
  indicativePrice: {
    amount: number;
    currency: "AUD";
  };
  relevantExperience: string;
  conditions: string[];
  submittedAt: string;
};

export type Engagement = Omit<ContractEngagement, "needProfileId"> & {
  needId: string;
  supplierName: string;
};

export type PinchWebhookEvidence = {
  eventId: string;
  eventType: string;
  engagementId: string;
  paymentId?: string;
  receivedAt: string;
  payload: unknown;
};
