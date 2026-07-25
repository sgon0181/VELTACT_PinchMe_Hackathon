import type {
  Engagement,
  NeedProfile,
  Supplier,
  SupplierInvitation,
  SupplierMatch,
  SupplierOutreachDelivery,
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
  equipmentOrTechnology: string[];
  requiredCapabilities: string[];
  location: string;
  requiredBy: string;
  budgetRange: string;
  budgetAmount: number;
  constraints: string[];
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
  outreachDeliveries: SupplierOutreachDelivery[];
  responses: SupplierResponse[];
  engagement?: Engagement;
  hostedCheckoutUrl?: string;
};
