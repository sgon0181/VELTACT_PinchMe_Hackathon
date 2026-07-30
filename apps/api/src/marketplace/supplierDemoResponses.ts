export type SupplierDemoScenario = "general" | "plc" | "robotics";

export type SupplierDemoResponse = {
  key: string;
  scenario: SupplierDemoScenario;
  label: string;
  evidenceLabel: "Fixture";
  tradeOff: "fastest_response" | "lower_price";
  company: {
    companyName: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
  };
  response: {
    canHelp: true;
    earliestAvailability: string;
    indicativePriceAud: number;
    relevantExperience: string;
    proposedApproach: string;
    assumptions: string[];
    conditions: string[];
  };
};

const supplierDemoResponses: Record<
  Exclude<SupplierDemoScenario, "general">,
  readonly SupplierDemoResponse[]
> = {
  plc: [
    {
      key: "plc-fastest-response",
      scenario: "plc",
      label: "Metro Controls / fastest response (Fixture)",
      evidenceLabel: "Fixture",
      tradeOff: "fastest_response",
      company: {
        companyName: "Metro Controls Response",
        contactName: "Alex Chen",
        contactEmail: "alex@fixture.veltact.test",
        contactPhone: "+61400000501"
      },
      response: {
        canHelp: true,
        earliestAvailability: "Same day, within four hours",
        indicativePriceAud: 4200,
        relevantExperience:
          "Siemens S7 conveyor recovery in food and beverage plants, including intermittent I/O faults, restart validation and maintenance handover.",
        proposedApproach:
          "Review alarms and drawings remotely, dispatch a controls engineer for structured fault isolation, then validate the conveyor under guarded production conditions.",
        assumptions: [
          "Current PLC backup and alarm history are available",
          "A site electrician can support isolation and testing"
        ],
        conditions: [
          "Four-hour minimum callout",
          "Replacement hardware and after-hours attendance require buyer approval"
        ]
      }
    },
    {
      key: "plc-lower-price",
      scenario: "plc",
      label: "Western Automation / lower price (Fixture)",
      evidenceLabel: "Fixture",
      tradeOff: "lower_price",
      company: {
        companyName: "Western Automation Response",
        contactName: "Priya Nair",
        contactEmail: "priya@fixture.veltact.test",
        contactPhone: "+61400000502"
      },
      response: {
        canHelp: true,
        earliestAvailability: "Next business day",
        indicativePriceAud: 2900,
        relevantExperience:
          "Siemens PLC and conveyor controls support across Western Sydney, with packaging-line diagnostics and preventive fault reviews.",
        proposedApproach:
          "Start with a remote evidence review, attend the next business morning for diagnosis, and provide a prioritised recovery and follow-up maintenance plan.",
        assumptions: [
          "Clear fault screenshots are supplied before attendance",
          "The buyer accepts next-business-day onsite attendance"
        ],
        conditions: [
          "Price includes one onsite shift",
          "Production modifications are quoted after diagnosis"
        ]
      }
    }
  ],
  robotics: [
    {
      key: "robotics-fastest-response",
      scenario: "robotics",
      label: "Precision Robotics / earliest assessment (Fixture)",
      evidenceLabel: "Fixture",
      tradeOff: "fastest_response",
      company: {
        companyName: "Precision Robotics Response",
        contactName: "Mia Williams",
        contactEmail: "mia@fixture.veltact.test",
        contactPhone: "+61400000503"
      },
      response: {
        canHelp: true,
        earliestAvailability: "Site assessment within five business days",
        indicativePriceAud: 18500,
        relevantExperience:
          "ABB palletising cells with Siemens controls for mixed-carton food production, including safety validation, gripper trials and operator handover.",
        proposedApproach:
          "Run a rapid site assessment, capture carton and pallet data, confirm guarding and controls interfaces, then issue a concept layout and staged integration proposal.",
        assumptions: [
          "Representative cartons and pallet patterns are available",
          "Existing line drawings and safety documentation can be reviewed onsite"
        ],
        conditions: [
          "Price covers assessment, concept design and preliminary risk review",
          "Robot hardware and installation are excluded until design approval"
        ]
      }
    },
    {
      key: "robotics-lower-price",
      scenario: "robotics",
      label: "Applied Automation / lower price (Fixture)",
      evidenceLabel: "Fixture",
      tradeOff: "lower_price",
      company: {
        companyName: "Applied Automation Response",
        contactName: "Jordan Lee",
        contactEmail: "jordan@fixture.veltact.test",
        contactPhone: "+61400000504"
      },
      response: {
        canHelp: true,
        earliestAvailability: "Site survey within ten business days",
        indicativePriceAud: 12800,
        relevantExperience:
          "Palletising and end-of-line automation for Australian manufacturers, with Fanuc and ABB commissioning experience.",
        proposedApproach:
          "Complete a remote production-data review before a scheduled site survey, then compare two cell concepts against throughput, footprint and changeover needs.",
        assumptions: [
          "The buyer can provide two weeks of production data",
          "Site attendance can occur within ten business days"
        ],
        conditions: [
          "Price excludes detailed engineering and simulation",
          "Travel outside metropolitan Sydney is charged separately"
        ]
      }
    }
  ]
};

/**
 * A1 integration point: obtain cloned fixture submissions here, then pass each
 * one through the canonical claim and response transitions. Do not insert these
 * objects directly into marketplace persistence.
 */
export function getSupplierDemoResponses(
  scenario: SupplierDemoScenario,
  requirementText = ""
): SupplierDemoResponse[] {
  const responses =
    scenario === "general"
      ? generalSupplierDemoResponses(requirementText)
      : supplierDemoResponses[scenario];
  return responses.map((entry) => ({
    ...entry,
    company: { ...entry.company },
    response: {
      ...entry.response,
      assumptions: [...entry.response.assumptions],
      conditions: [...entry.response.conditions]
    }
  }));
}

export function supplierDemoScenarioFromRequirement(
  requirementText: string
): SupplierDemoScenario {
  if (/robot|pallet|abb|fanuc/i.test(requirementText)) {
    return "robotics";
  }
  if (/\bplc|siemens|allen[- ]bradley|hmi|scada|controller\b/i.test(requirementText)) {
    return "plc";
  }
  return "general";
}

function generalSupplierDemoResponses(
  requirementText: string
): readonly SupplierDemoResponse[] {
  const capability = generalCapabilitySummary(requirementText);
  return [
    {
      key: "general-fastest-response",
      scenario: "general",
      label: "Regional Industrial Response / fastest response (Fixture)",
      evidenceLabel: "Fixture",
      tradeOff: "fastest_response",
      company: {
        companyName: "Regional Industrial Response",
        contactName: "Casey Morgan",
        contactEmail: "casey@fixture.veltact.test",
        contactPhone: "+61400000505"
      },
      response: {
        canHelp: true,
        earliestAvailability: "Next business day",
        indicativePriceAud: 5600,
        relevantExperience:
          `Recent industrial maintenance callouts involving ${capability}, evidence-led assessment and controlled production handover.`,
        proposedApproach:
          `Review the buyer evidence, attend site to confirm the ${capability} scope under the factory's isolation procedure, then issue a separately approved intervention and validation plan.`,
        assumptions: [
          "Equipment identification and recent fault history are available",
          "The buyer provides approved site access and isolation support"
        ],
        conditions: [
          "Price covers assessment and a written findings report",
          "Parts and repair work require separate buyer approval"
        ]
      }
    },
    {
      key: "general-lower-price",
      scenario: "general",
      label: "Industrial Service Network / lower price (Fixture)",
      evidenceLabel: "Fixture",
      tradeOff: "lower_price",
      company: {
        companyName: "Industrial Service Network",
        contactName: "Taylor Singh",
        contactEmail: "taylor@fixture.veltact.test",
        contactPhone: "+61400000506"
      },
      response: {
        canHelp: true,
        earliestAvailability: "Within two business days",
        indicativePriceAud: 3800,
        relevantExperience:
          `Planned and breakdown maintenance scopes involving ${capability}, fault-history review and acceptance evidence.`,
        proposedApproach:
          `Complete a remote evidence review first, then attend within two business days to define the ${capability} intervention and handover criteria.`,
        assumptions: [
          "Nameplate details and maintenance records are supplied before attendance",
          "The buyer accepts remote triage before the site visit"
        ],
        conditions: [
          "Price includes one assessment shift",
          "Specialist subcontractors and replacement components are excluded"
        ]
      }
    }
  ];
}

function generalCapabilitySummary(requirementText: string): string {
  if (/gearbox|mechanical contractor|thermal protection/i.test(requirementText)) {
    return "industrial gearbox diagnostics and mechanical maintenance";
  }
  if (/extrud|heater band|barrel heating|process heating/i.test(requirementText)) {
    return "industrial process heating and extrusion equipment diagnostics";
  }
  if (/pump|hydraulic/i.test(requirementText)) {
    return "industrial pump and hydraulic diagnostics";
  }
  return "the buyer-reviewed industrial equipment capabilities";
}
