import type {
  Engagement as ContractEngagement,
  MarketplaceAuditEvent,
  MarketplaceNeedProfile,
  NeedProfileStatus,
  SolutionDecision,
  SolutionResearchResult,
  SupplierClaim,
  SupplierInvitation as ContractSupplierInvitation,
  SupplierLead,
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
  outreachApprovedAt?: string;
  providerWarnings?: {
    research?: string;
    discovery?: string;
  };
  status: Extract<
    NeedProfileStatus,
    "responses_open" | "selected" | "payment_pending" | "secured"
  >;
  createdAt: string;
  updatedAt: string;
};

export type NeedReportRecord = {
  id: string;
  needProfileId: string;
  researchResultId: string;
  solutionDecisionId?: string;
  selectedApproachId: string;
  selectionProvenance: {
    source: "report_request" | "solution_decision";
    selectedBy: string;
    selectedAt: string;
  };
  sourceMode: SolutionResearchResult["sourceMode"];
  generatedAt: string;
  fileName: string;
  contentType: "application/pdf";
  byteLength: number;
  sha256: string;
  pdfBase64: string;
};

export type SupplierInvitation = ContractSupplierInvitation & {
  needId: string;
  supplierName: string;
  openedAt?: string;
  respondedAt?: string;
};

export type {
  MarketplaceAuditEvent,
  SolutionDecision,
  SolutionResearchResult,
  SupplierClaim,
  SupplierLead,
  SupplierOutreachDelivery
};

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

export type LocalDemoPaymentEvidence = {
  provider: "local_demo";
  source: "local_demo";
  authoritative: false;
  eventId: string;
  eventType: string;
  engagementId: string;
  paymentId: string;
  receivedAt: string;
  payload: unknown;
};
