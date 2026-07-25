import { readFileSync } from "node:fs";
import {
  supplierCatalogEntrySchema,
  type SupplierProfile,
  type SupplierCatalogEntry
} from "@veltact/contracts";
import { env } from "../env.js";

export type Supplier = SupplierCatalogEntry;

type SeedSupplier = Omit<
  SupplierCatalogEntry,
  | "categories"
  | "createdAt"
  | "updatedAt"
  | "verificationStatus"
  | "verificationSource"
  | "verifiedAt"
>;

const catalogTimestamp = "2026-07-25T00:00:00.000Z";

const seededSupplierInputs: SeedSupplier[] = [
  {
    id: "supplier-automation-nsw",
    companyName: "Harbour Industrial Automation",
    contactEmail: "ops@harbour-automation.example",
    contactPhone: "+61411111001",
    capabilities: [
      "automation",
      "plc diagnostics",
      "scada",
      "controls",
      "commissioning",
      "conveyor fault recovery",
      "robotics",
      "robotic cell fault recovery",
      "abb robot diagnostics",
      "palletising"
    ],
    industries: ["manufacturing", "food", "packaging", "industrial"],
    serviceRegions: ["nsw", "sydney", "western sydney", "australia"],
    equipmentBrands: ["siemens", "simatic", "s7", "abb"],
    certifications: ["licensed electrical contractor", "machine safety"],
    trustSignals: ["Verified industrial automation supplier", "24/7 breakdown roster"],
    availabilityDays: 1,
    minimumBudgetAud: 5000,
    maximumBudgetAud: 150000,
    verified: true
  },
  {
    id: "supplier-robotics-western-sydney",
    companyName: "Atlas Robotics Field Service",
    contactEmail: "dispatch@atlas-robotics.example",
    contactPhone: "+61411111006",
    capabilities: [
      "robotics",
      "robotic cell fault recovery",
      "abb robot diagnostics",
      "palletising",
      "robot controller diagnostics",
      "same-shift onsite support"
    ],
    industries: ["manufacturing", "food", "packaging", "industrial"],
    serviceRegions: ["western sydney", "sydney", "nsw", "australia"],
    equipmentBrands: ["abb"],
    certifications: ["machine safety", "licensed electrical contractor"],
    trustSignals: ["Verified robotic cell recovery team", "24/7 production-line response"],
    availabilityDays: 1,
    minimumBudgetAud: 5000,
    maximumBudgetAud: 120000,
    verified: true
  },
  {
    id: "supplier-robot-safety-nsw",
    companyName: "CellGuard Automation Response",
    contactEmail: "response@cellguard.example",
    contactPhone: "+61411111007",
    capabilities: [
      "robotics",
      "robotic cell fault recovery",
      "safety circuits",
      "safety circuit diagnostics",
      "onsite support"
    ],
    industries: ["manufacturing", "food", "packaging", "industrial"],
    serviceRegions: ["western sydney", "sydney", "nsw", "australia"],
    equipmentBrands: ["abb"],
    certifications: ["machine safety", "licensed electrical contractor"],
    trustSignals: ["Robot-cell safety specialist", "Same-shift Sydney callout roster"],
    availabilityDays: 1,
    minimumBudgetAud: 4000,
    maximumBudgetAud: 80000,
    verified: true
  },
  {
    id: "supplier-controls-western-sydney",
    companyName: "Western Sydney Controls Response",
    contactEmail: "dispatch@ws-controls.example",
    contactPhone: "+61411111002",
    capabilities: [
      "plc diagnostics",
      "siemens plc",
      "automation",
      "fault finding",
      "safety circuits",
      "onsite support"
    ],
    industries: ["manufacturing", "food", "packaging", "industrial"],
    serviceRegions: ["western sydney", "sydney", "nsw", "australia"],
    equipmentBrands: ["siemens", "simatic", "s7"],
    certifications: ["licensed electrical contractor", "confined space"],
    trustSignals: ["Same-day Sydney response team", "Packaging-line fault recovery experience"],
    availabilityDays: 1,
    minimumBudgetAud: 3000,
    maximumBudgetAud: 90000,
    verified: true
  },
  {
    id: "supplier-electrical-sydney",
    companyName: "LineWorks Industrial Electrical",
    contactEmail: "service@lineworks-electrical.example",
    contactPhone: "+61411111003",
    capabilities: [
      "electrical",
      "plc diagnostics",
      "instrumentation",
      "commissioning",
      "maintenance",
      "automation"
    ],
    industries: ["manufacturing", "food", "packaging", "industrial"],
    serviceRegions: ["sydney", "western sydney", "nsw", "australia"],
    equipmentBrands: ["siemens", "schneider", "rockwell"],
    certifications: ["licensed electrical contractor", "arc flash trained"],
    trustSignals: ["Industrial electrical compliance record", "After-hours callout roster"],
    availabilityDays: 1,
    minimumBudgetAud: 8000,
    maximumBudgetAud: 200000,
    verified: true
  },
  {
    id: "supplier-hydraulics-wa",
    companyName: "Pilbara Hydraulic Response",
    contactEmail: "field@pilbara-hydraulics.example",
    contactPhone: "+61411111004",
    capabilities: ["hydraulics", "pneumatics", "maintenance", "breakdown", "field service"],
    industries: ["mining", "resources", "industrial"],
    serviceRegions: ["wa", "perth", "pilbara", "australia"],
    equipmentBrands: ["bosch rexroth", "parker"],
    certifications: ["mine site induction"],
    trustSignals: ["Regional field response team"],
    availabilityDays: 1,
    minimumBudgetAud: 2500,
    maximumBudgetAud: 75000,
    verified: false
  },
  {
    id: "supplier-fabrication-sa",
    companyName: "Precision Plant Fabrication",
    contactEmail: "quotes@precision-plant.example",
    contactPhone: "+61411111005",
    capabilities: ["fabrication", "welding", "conveyors", "guards", "installation"],
    industries: ["manufacturing", "agriculture", "industrial"],
    serviceRegions: ["sa", "adelaide", "australia"],
    equipmentBrands: ["conveyors", "guarding"],
    certifications: ["coded welding"],
    trustSignals: ["Plant modification experience"],
    availabilityDays: 7,
    minimumBudgetAud: 4000,
    maximumBudgetAud: 120000,
    verified: false
  }
];

export const seededSuppliers: Supplier[] = seededSupplierInputs.map((supplier) =>
  supplierCatalogEntrySchema.parse({
    ...supplier,
    categories: supplier.industries,
    verificationStatus: supplier.verified ? "demo_verified" : "unverified",
    verificationSource: supplier.verified ? "Curated RapidMatch demo catalog" : undefined,
    verifiedAt: supplier.verified ? catalogTimestamp : undefined,
    createdAt: catalogTimestamp,
    updatedAt: catalogTimestamp
  })
);

export const supplierCatalog = loadSupplierCatalog();

export function registerActivatedSupplier(profile: SupplierProfile) {
  const supplierId = `v2-${profile.id}`;
  const existing = supplierCatalog.find((supplier) => supplier.id === supplierId);
  if (existing) {
    return existing;
  }

  const supplier = supplierCatalogEntrySchema.parse({
    id: supplierId,
    companyName: profile.companyName,
    contactName: profile.contactName,
    contactEmail: profile.contactEmail,
    contactPhone: profile.contactPhone,
    categories: profile.categories,
    industries: profile.industries,
    serviceRegions: profile.serviceRegions,
    capabilities: profile.capabilities,
    equipmentBrands: [],
    certifications: profile.certifications,
    trustSignals: [
      "Supplier-approved profile",
      "Buyer-approved Veltact onboarding"
    ],
    availabilityDays: 7,
    minimumBudgetAud: 0,
    maximumBudgetAud: 10_000_000,
    verified: false,
    verificationStatus: "unverified",
    verificationSource:
      "Supplier-confirmed and buyer-approved profile; independent verification not completed",
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt
  });
  supplierCatalog.push(supplier);
  return supplier;
}

function loadSupplierCatalog(): Supplier[] {
  if (!env.SUPPLIER_CATALOG_FILE) {
    return seededSuppliers;
  }

  const payload = JSON.parse(readFileSync(env.SUPPLIER_CATALOG_FILE, "utf8")) as unknown;
  return supplierCatalogEntrySchema.array().min(1).parse(payload);
}
