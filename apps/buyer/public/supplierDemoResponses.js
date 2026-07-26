const today = () => new Date().toISOString().slice(0, 10);

const presets = {
  plc: [
    {
      id: "plc-fast-response",
      label: "PLC / fastest response (Fixture)",
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
      canHelp: true,
      earliestAvailability: today,
      indicativePriceAud: 2850,
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
  const scenario = /robot|pallet|abb|fanuc/i.test(requirementText)
    ? "robotics"
    : "plc";
  return presets[scenario].map((preset) => ({
    ...preset,
    earliestAvailability: preset.earliestAvailability(),
    assumptions: [...preset.assumptions],
    conditions: [...preset.conditions]
  }));
}
