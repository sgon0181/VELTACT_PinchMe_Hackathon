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
  createdAt: string;
};

export type SupplierInvitation = {
  token: string;
  needId: string;
  supplierId: string;
  supplierName: string;
  status: "invited" | "responded";
  createdAt: string;
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
