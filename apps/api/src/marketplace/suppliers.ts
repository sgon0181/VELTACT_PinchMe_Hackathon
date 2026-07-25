export type Supplier = {
  id: string;
  name: string;
  capabilities: string[];
  industries: string[];
  locations: string[];
  availabilityDays: number;
  minimumBudgetAud: number;
  maximumBudgetAud: number;
};

export const seededSuppliers: Supplier[] = [
  {
    id: "supplier-automation-nsw",
    name: "Harbour Industrial Automation",
    capabilities: ["automation", "plc", "scada", "controls", "commissioning"],
    industries: ["manufacturing", "food", "packaging", "industrial"],
    locations: ["nsw", "sydney", "australia"],
    availabilityDays: 2,
    minimumBudgetAud: 5000,
    maximumBudgetAud: 150000
  },
  {
    id: "supplier-robotics-vic",
    name: "Southern Robotics Maintenance",
    capabilities: ["robotics", "maintenance", "fault finding", "automation", "safety"],
    industries: ["manufacturing", "automotive", "industrial"],
    locations: ["vic", "melbourne", "australia"],
    availabilityDays: 4,
    minimumBudgetAud: 3000,
    maximumBudgetAud: 90000
  },
  {
    id: "supplier-electrical-qld",
    name: "LineWorks Electrical Services",
    capabilities: ["electrical", "switchboard", "instrumentation", "commissioning", "maintenance"],
    industries: ["mining", "energy", "water", "industrial"],
    locations: ["qld", "brisbane", "australia"],
    availabilityDays: 5,
    minimumBudgetAud: 8000,
    maximumBudgetAud: 200000
  },
  {
    id: "supplier-hydraulics-wa",
    name: "Pilbara Hydraulic Response",
    capabilities: ["hydraulics", "pneumatics", "maintenance", "breakdown", "field service"],
    industries: ["mining", "resources", "industrial"],
    locations: ["wa", "perth", "pilbara", "australia"],
    availabilityDays: 1,
    minimumBudgetAud: 2500,
    maximumBudgetAud: 75000
  },
  {
    id: "supplier-fabrication-sa",
    name: "Precision Plant Fabrication",
    capabilities: ["fabrication", "welding", "conveyors", "guards", "installation"],
    industries: ["manufacturing", "agriculture", "industrial"],
    locations: ["sa", "adelaide", "australia"],
    availabilityDays: 7,
    minimumBudgetAud: 4000,
    maximumBudgetAud: 120000
  }
];
