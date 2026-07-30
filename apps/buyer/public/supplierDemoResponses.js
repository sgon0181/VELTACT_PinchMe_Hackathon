const today = () => new Date().toISOString().slice(0, 10);

const presets = {
  plc: [
    {
      id: "plc-fast-response",
      label: "PLC / fastest response (Fixture)",
      company: {
        companyName: "Metro Controls Response",
        contactName: "Alex Chen",
        contactEmail: "alex@fixture.veltact.test",
        contactPhone: "+61400000501"
      },
      canHelp: true,
      earliestAvailability: today,
      indicativePriceAud: 4200,
      relevantExperience:
        "We have recovered Siemens S7-controlled conveyors in food and beverage plants, including intermittent I/O faults, safe restart validation and maintenance handover.",
      proposedApproach:
        "Review alarm history and electrical drawings remotely, dispatch a controls engineer for structured fault isolation, then validate the conveyor under guarded production conditions.",
      assumptions: [
        "Current PLC backup and alarm history are available",
        "A site electrician can support isolation and testing"
      ],
      conditions: [
        "Four-hour minimum callout",
        "Replacement hardware and after-hours attendance require buyer approval"
      ]
    },
    {
      id: "plc-value-response",
      label: "PLC / lower price (Fixture)",
      company: {
        companyName: "Western Automation Response",
        contactName: "Priya Nair",
        contactEmail: "priya@fixture.veltact.test",
        contactPhone: "+61400000502"
      },
      canHelp: true,
      earliestAvailability: today,
      indicativePriceAud: 2900,
      relevantExperience:
        "Our automation team supports Siemens PLC and conveyor controls across Western Sydney, with recent packaging-line diagnostics and preventive fault reviews.",
      proposedApproach:
        "Start with a remote evidence review, attend the next business morning for diagnosis, and provide a prioritised recovery and follow-up maintenance plan.",
      assumptions: [
        "Remote access or clear fault screenshots are supplied before attendance",
        "The buyer accepts next-business-day onsite attendance"
      ],
      conditions: [
        "Price includes one onsite shift",
        "Production modifications are quoted after diagnosis"
      ]
    }
  ],
  robotics: [
    {
      id: "robotics-fast-assessment",
      label: "Robotics / earliest assessment (Fixture)",
      company: {
        companyName: "Precision Robotics Response",
        contactName: "Mia Williams",
        contactEmail: "mia@fixture.veltact.test",
        contactPhone: "+61400000503"
      },
      canHelp: true,
      earliestAvailability: today,
      indicativePriceAud: 18500,
      relevantExperience:
        "We have delivered ABB palletising cells with Siemens controls for mixed-carton food production, including safety validation, gripper trials and operator handover.",
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
    },
    {
      id: "robotics-value-design",
      label: "Robotics / lower price (Fixture)",
      company: {
        companyName: "Applied Automation Response",
        contactName: "Jordan Lee",
        contactEmail: "jordan@fixture.veltact.test",
        contactPhone: "+61400000504"
      },
      canHelp: true,
      earliestAvailability: today,
      indicativePriceAud: 12800,
      relevantExperience:
        "Our integration team designs palletising and end-of-line automation for Australian manufacturers, with Fanuc and ABB commissioning experience.",
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
  ]
};

export function demoResponsesForRequirement(requirementText) {
  const scenario = supplierDemoScenario(requirementText);
  const responses =
    scenario === "general"
      ? generalResponses(requirementText)
      : presets[scenario];
  return responses.map((preset) => ({
    ...preset,
    company: { ...preset.company },
    earliestAvailability: preset.earliestAvailability(),
    assumptions: [...preset.assumptions],
    conditions: [...preset.conditions]
  }));
}

export function demoPresetIndexForInvitationToken(token, presetCount) {
  if (!token || !Number.isInteger(presetCount) || presetCount < 1) return 0;
  let hash = 0;
  for (const character of token) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash % presetCount;
}

function supplierDemoScenario(requirementText) {
  if (/robot|pallet|abb|fanuc/i.test(requirementText)) return "robotics";
  if (
    /\bplc|siemens|allen[- ]bradley|hmi|scada|controller\b/i.test(
      requirementText
    )
  ) {
    return "plc";
  }
  return "general";
}

function generalResponses(requirementText) {
  const capability = generalCapabilitySummary(requirementText);
  return [
    {
      id: "general-fast-response",
      label: "Industrial maintenance / fastest response (Fixture)",
      company: {
        companyName: "Regional Industrial Response",
        contactName: "Casey Morgan",
        contactEmail: "casey@fixture.veltact.test",
        contactPhone: "+61400000505"
      },
      canHelp: true,
      earliestAvailability: today,
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
    },
    {
      id: "general-value-response",
      label: "Industrial maintenance / lower price (Fixture)",
      company: {
        companyName: "Industrial Service Network",
        contactName: "Taylor Singh",
        contactEmail: "taylor@fixture.veltact.test",
        contactPhone: "+61400000506"
      },
      canHelp: true,
      earliestAvailability: today,
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
  ];
}

function generalCapabilitySummary(requirementText) {
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
