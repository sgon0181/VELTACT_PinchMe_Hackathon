export type Supplier = {
  id: string;
  name: string;
  contactEmail: string;
  capabilities: string[];
  industries: string[];
  locations: string[];
  equipmentBrands: string[];
  certifications: string[];
  trustSignals: string[];
  availabilityDays: number;
  minimumBudgetAud: number;
  maximumBudgetAud: number;
  verified: boolean;
};

export const seededSuppliers: Supplier[] = [
  {
    id: "supplier-automation-nsw",
    name: "Harbour Industrial Automation",
    contactEmail: "ops@harbour-automation.example",
    capabilities: [
      "automation",
      "plc diagnostics",
      "scada",
      "controls",
      "commissioning",
      "conveyor fault recovery"
    ],
    industries: ["manufacturing", "food", "packaging", "industrial"],
    locations: ["nsw", "sydney", "western sydney", "australia"],
    equipmentBrands: ["siemens", "simatic", "s7"],
    certifications: ["licensed electrical contractor", "machine safety"],
    trustSignals: ["Verified industrial automation supplier", "24/7 breakdown roster"],
    availabilityDays: 1,
    minimumBudgetAud: 5000,
    maximumBudgetAud: 150000,
    verified: true
  },
  {
    id: "supplier-controls-western-sydney",
    name: "Western Sydney Controls Response",
    contactEmail: "dispatch@ws-controls.example",
    capabilities: [
      "plc diagnostics",
      "siemens plc",
      "automation",
      "fault finding",
      "safety circuits",
      "onsite support"
    ],
    industries: ["manufacturing", "food", "packaging", "industrial"],
    locations: ["western sydney", "sydney", "nsw", "australia"],
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
    name: "LineWorks Industrial Electrical",
    contactEmail: "service@lineworks-electrical.example",
    capabilities: [
      "electrical",
      "plc diagnostics",
      "instrumentation",
      "commissioning",
      "maintenance",
      "automation"
    ],
    industries: ["manufacturing", "food", "packaging", "industrial"],
    locations: ["sydney", "western sydney", "nsw", "australia"],
    equipmentBrands: ["siemens", "schneider", "rockwell"],
    certifications: ["licensed electrical contractor", "arc flash trained"],
    trustSignals: ["Industrial electrical compliance record", "After-hours callout roster"],
    availabilityDays: 2,
    minimumBudgetAud: 8000,
    maximumBudgetAud: 200000,
    verified: true
  },
  {
    id: "supplier-hydraulics-wa",
    name: "Pilbara Hydraulic Response",
    contactEmail: "field@pilbara-hydraulics.example",
    capabilities: ["hydraulics", "pneumatics", "maintenance", "breakdown", "field service"],
    industries: ["mining", "resources", "industrial"],
    locations: ["wa", "perth", "pilbara", "australia"],
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
    name: "Precision Plant Fabrication",
    contactEmail: "quotes@precision-plant.example",
    capabilities: ["fabrication", "welding", "conveyors", "guards", "installation"],
    industries: ["manufacturing", "agriculture", "industrial"],
    locations: ["sa", "adelaide", "australia"],
    equipmentBrands: ["conveyors", "guarding"],
    certifications: ["coded welding"],
    trustSignals: ["Plant modification experience"],
    availabilityDays: 7,
    minimumBudgetAud: 4000,
    maximumBudgetAud: 120000,
    verified: false
  }
];
