import type {
  BuyerPriority,
  RapidMatchBuyerWorkspace
} from "@veltact/contracts";

export type PrioritySignal = BuyerPriority;

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

export type BuyerWorkspace = RapidMatchBuyerWorkspace;
