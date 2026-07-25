import type {
  Engagement,
  NeedProfile,
  Supplier,
  SupplierInvitation,
  SupplierMatch,
  SupplierResponse
} from "@veltact/contracts";

export type PrioritySignal = "speed" | "technical_fit" | "quality" | "trust" | "price";

export type BuyerRequirementInput = {
  companyName: string;
  contactName: string;
  contactEmail: string;
  title: string;
  description: string;
  category: string;
  location: string;
  requiredBy: string;
  budgetAmount: number;
};

export type SupplierMatchView = SupplierMatch & {
  supplier: Supplier;
  weightedScore: number;
  priorityReason: string;
};

export type BuyerWorkspace = {
  needProfile: NeedProfile;
  suppliers: Supplier[];
  matches: SupplierMatchView[];
  invitations: SupplierInvitation[];
  responses: SupplierResponse[];
  engagement?: Engagement;
  hostedCheckoutUrl?: string;
};

