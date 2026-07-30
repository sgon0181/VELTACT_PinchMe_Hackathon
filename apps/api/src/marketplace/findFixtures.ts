import {
  solutionResearchResultSchema,
  supplierLeadSchema,
  type MarketplaceNeedProfile,
  type ResearchCitation,
  type SolutionApproach,
  type SolutionResearchResult,
  type SupplierLead
} from "@veltact/contracts";

export type MarketplaceDemoScenario = "plc" | "process_heating" | "robotics";

export function inferMarketplaceDemoScenario(
  profile: MarketplaceNeedProfile
): MarketplaceDemoScenario {
  const evidence = [
    profile.title,
    profile.description,
    profile.problemSummary,
    profile.category,
    profile.industry,
    ...(profile.equipmentOrTechnology ?? []),
    ...(profile.equipmentTechnology ?? []),
    ...(profile.requiredCapabilities ?? []),
    ...(profile.requiredCapability ?? [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\brobot|robotic|palletis|cobot|end[- ]of[- ]arm/.test(evidence)) {
    return "robotics";
  }
  if (
    /extrud|heater band|barrel heating|plastic processing|polymer processing|(?:plastic|polymer).{0,40}(?:melt|barrel|screw)|(?:screw|barrel).{0,40}(?:torque|heater|plastic|polymer)/.test(
      evidence
    )
  ) {
    return "process_heating";
  }
  return "plc";
}

export function createMarketplaceFixtureResearch(
  needProfileId: string,
  profile: MarketplaceNeedProfile,
  currentTime = new Date()
): SolutionResearchResult {
  const generatedAt = currentTime.toISOString();
  const scenario = inferMarketplaceDemoScenario(profile);
  const citations = fixtureCitations(needProfileId, scenario, generatedAt);
  const citationIds = citations.map((citation) => citation.id);
  const approaches =
    scenario === "robotics"
      ? roboticsApproaches(needProfileId, citationIds)
      : scenario === "process_heating"
        ? processHeatingApproaches(needProfileId, citationIds)
        : plcApproaches(needProfileId, citationIds);

  return solutionResearchResultSchema.parse({
    id: `${needProfileId}:research:${scenario}`,
    needProfileId,
    sourceMode: "fixture",
    overview:
      scenario === "robotics"
        ? "Treat the mixed-carton palletising cell as a staged integration: validate product variation, cycle time and machinery safety before proving the handling process and commissioning the full cell."
        : scenario === "process_heating"
          ? "Treat the extrusion heating loss and screw high-torque alarm as a cross-system process fault: preserve the available process evidence, use authorised electrical and plastics-equipment expertise to establish the failure boundary, then validate the approved recovery before production handover."
          : "Treat the stopped Siemens PLC line as an evidence-led recovery: preserve the current state, use authorised controls expertise for diagnosis and restoration, then validate the recovered baseline before production handover.",
    approaches,
    citations,
    missingInformation:
      scenario === "robotics"
        ? [
            "Representative carton dimensions, weights and presentation variation",
            "Target cycle time, pallet patterns and quality acceptance measures",
            "Available cell footprint, services and production cutover windows"
          ]
        : scenario === "process_heating"
          ? [
              "Extruder make, model and the Zone 3 heater-band electrical rating",
              "Zone 3 setpoint, indicated temperature and controller or sensor alarm evidence",
              "Material grade, last known good process settings and screw-torque trend",
              "Current isolation state plus available electrical and thermal-zone drawings"
            ]
          : [
              "Exact Siemens controller family, firmware and visible diagnostic state",
              "Provenance and date of the last verified PLC backup",
              "Whether drives, industrial network or safety controls are also affected"
            ],
    safetyNotice:
      "Fixture procurement research only. This is not a machinery diagnosis or an instruction to inspect, isolate, program, bypass safeguards or restart industrial equipment.",
    generatedAt
  });
}

export function createMarketplaceFixtureSupplierLeads(
  needProfileId: string,
  profile: MarketplaceNeedProfile,
  currentTime = new Date()
): SupplierLead[] {
  const scenario = inferMarketplaceDemoScenario(profile);
  const candidates =
    scenario === "robotics"
      ? roboticsLeads(profile.budgetAud)
      : scenario === "process_heating"
        ? processHeatingLeads(profile.budgetAud)
        : plcLeads(profile.budgetAud);

  return supplierLeadSchema.array().parse(
    candidates.map((candidate, index) => {
      const timestamp = new Date(currentTime.getTime() + index).toISOString();
      const website = `https://${candidate.slug}.example`;
      return {
        id: `${needProfileId}:lead:${scenario}:${index + 1}`,
        needProfileId,
        companyName: candidate.companyName,
        website,
        contactEmail: candidate.contactEmail,
        contactPhone: candidate.contactPhone,
        location: candidate.location,
        serviceRegions: candidate.serviceRegions,
        capabilities: candidate.capabilities,
        matchScore: candidate.matchScore,
        matchReasons: candidate.matchReasons,
        risks: [
          ...candidate.risks,
          "Fixture candidate: public evidence is not verification, supplier consent, enrolment or proof of current availability."
        ],
        evidence: [
          {
            id: `${needProfileId}:lead-citation:${scenario}:${index + 1}`,
            title: `${candidate.companyName} fixture evidence`,
            url: website,
            sourceType: "supplier_website",
            provider: "fixture",
            evidenceNote:
              "Deterministic fictional evidence for the RapidMatch demo. This is not a real or verified supplier listing.",
            accessedAt: timestamp
          }
        ],
        sourceMode: "fixture",
        lifecycleStatus: "discovered",
        createdAt: timestamp,
        updatedAt: timestamp
      };
    })
  );
}

function plcApproaches(
  needProfileId: string,
  citationIds: string[]
): SolutionApproach[] {
  return [
    {
      id: `${needProfileId}:approach:plc:triage`,
      needProfileId,
      title: "Safe evidence capture and specialist triage",
      summary:
        "Preserve alarms, controller state, network indicators and recent change history under the site's authorised procedure.",
      rationale:
        "High-quality evidence shortens specialist diagnosis without introducing unreviewed changes to live machinery.",
      localActions: [
        "Record visible alarms and the last known good operating state.",
        "Locate approved backups, drawings and change records without loading or modifying them."
      ],
      outsourceTriggers: [
        "Safety controls, damaged electrical equipment or unknown program changes may be involved.",
        "The factory lacks an authorised Siemens controls specialist or verified engineering backup."
      ],
      requiredCapabilities: [
        "Siemens PLC diagnostics",
        "industrial electrical fault finding",
        "safe isolation"
      ],
      risks: [
        "Reset attempts may overwrite useful fault evidence.",
        "Production pressure may encourage unsafe bypasses."
      ],
      confidence: 0.92,
      citationIds
    },
    {
      id: `${needProfileId}:approach:plc:recovery`,
      needProfileId,
      title: "Controlled recovery from a verified baseline",
      summary:
        "Have an authorised specialist compare diagnostics, hardware state and approved backups before any restoration action.",
      rationale:
        "A verified baseline reduces the risk of restoring an incompatible program or masking a failed network, drive or field device.",
      localActions: [
        "Confirm controller model, firmware and backup provenance.",
        "Nominate the authorised person who can approve controlled restart and validation."
      ],
      outsourceTriggers: [
        "The fault crosses PLC, drive, network, safety or instrumentation boundaries.",
        "No compatible engineering environment or verified backup is available."
      ],
      requiredCapabilities: [
        "PLC backup recovery",
        "industrial networking",
        "drive and I/O diagnostics"
      ],
      risks: [
        "Firmware or hardware mismatch prevents a safe restore.",
        "The PLC alarm may be a symptom of another subsystem failure."
      ],
      confidence: 0.89,
      citationIds
    },
    {
      id: `${needProfileId}:approach:plc:handover`,
      needProfileId,
      title: "Validation and recurrence prevention",
      summary:
        "Validate safe production, capture the approved final baseline and convert the incident into backup, spares and monitoring actions.",
      rationale:
        "Recovery is incomplete until the factory can explain the evidence and reduce repeat downtime.",
      localActions: [
        "Record the approved final program, firmware and hardware configuration.",
        "Schedule a short incident review with operations and maintenance."
      ],
      outsourceTriggers: [
        "The cause remains unconfirmed after restoration.",
        "Unsupported hardware or recurring communication faults are identified."
      ],
      requiredCapabilities: [
        "controls lifecycle planning",
        "industrial network health",
        "maintenance handover"
      ],
      risks: [
        "A temporary recovery becomes an undocumented production baseline.",
        "Obsolete components remain a single point of failure."
      ],
      confidence: 0.84,
      citationIds
    }
  ];
}

function processHeatingApproaches(
  needProfileId: string,
  citationIds: string[]
): SolutionApproach[] {
  return [
    {
      id: `${needProfileId}:approach:process-heating:evidence`,
      needProfileId,
      title: "Preserve process evidence and define the failed zone",
      summary:
        "Capture the available Zone 3 temperature, alarm, material and last-known-good production evidence without opening enclosures or altering the machine.",
      rationale:
        "The heating loss and torque alarm may cross thermal, electrical, instrumentation, material and mechanical boundaries, so a clear evidence package prevents a premature single-cause assumption.",
      localActions: [
        "Record the visible Zone 3 setpoint, indicated temperature, alarm text and event time from approved operator records.",
        "Collect the machine model, heater-zone drawings, material grade, last known good settings and recent maintenance history."
      ],
      outsourceTriggers: [
        "The factory cannot establish the heater-zone boundary from approved read-only records.",
        "Electrical, hot-surface, stored-energy or rotating-equipment hazards require competent specialist assessment."
      ],
      requiredCapabilities: [
        "plastics extrusion maintenance",
        "process data review",
        "temperature-control assessment"
      ],
      risks: [
        "Treating the torque alarm as proof of one failed component may hide another process or mechanical condition.",
        "Uncontrolled resets or parameter changes may remove useful evidence or introduce additional risk."
      ],
      confidence: 0.9,
      citationIds
    },
    {
      id: `${needProfileId}:approach:process-heating:recovery`,
      needProfileId,
      title: "Authorised heating-zone and extrusion assessment",
      summary:
        "Have competent specialists assess the heater-band circuit, temperature sensing and control, thermal contact and screw-load evidence under the site's isolation and OEM procedures.",
      rationale:
        "A structured cross-discipline assessment separates the observed heating failure from secondary torque symptoms before any repair or restart decision.",
      localActions: [
        "Nominate the authorised site representative and provide the approved isolation, access and maintenance records.",
        "Agree the assessment boundary, response timing and evidence required before replacement work is authorised."
      ],
      outsourceTriggers: [
        "Licensed electrical work, heater replacement, instrumentation testing or access to guarded machine components is required.",
        "The observed screw load suggests material, thermal or mechanical conditions beyond the internal team's competence."
      ],
      requiredCapabilities: [
        "industrial process heating diagnostics",
        "industrial electrical fault finding",
        "temperature control and instrumentation",
        "extrusion equipment diagnostics"
      ],
      risks: [
        "Live electrical work, hot surfaces and unexpected machine movement create serious hazards.",
        "Replacing a heater without confirming sensor, controller, thermal-contact and process evidence may not resolve the observed condition."
      ],
      confidence: 0.94,
      citationIds
    },
    {
      id: `${needProfileId}:approach:process-heating:validation`,
      needProfileId,
      title: "Controlled process validation and maintenance handover",
      summary:
        "After an approved repair, validate heating stability, screw-load trend and product quality against an agreed process window before production handover.",
      rationale:
        "The job is not complete until the factory has evidence that the thermal zone, extrusion load and product outcome remain stable under controlled operation.",
      localActions: [
        "Define the authorised acceptance evidence, production sample and handover owner before validation begins.",
        "Record the approved final heater, controller, sensor and process baseline in the maintenance system."
      ],
      outsourceTriggers: [
        "The factory lacks extrusion process-validation or temperature-control competence.",
        "Torque, temperature or product-quality evidence remains outside the approved acceptance window."
      ],
      requiredCapabilities: [
        "extrusion process validation",
        "heater-band systems",
        "maintenance handover"
      ],
      risks: [
        "A temporary temperature recovery is accepted without confirming extrusion load or product quality.",
        "The final thermal-zone configuration and failure evidence are not retained for recurrence prevention."
      ],
      confidence: 0.88,
      citationIds
    }
  ];
}

function roboticsApproaches(
  needProfileId: string,
  citationIds: string[]
): SolutionApproach[] {
  return [
    {
      id: `${needProfileId}:approach:robotics:feasibility`,
      needProfileId,
      title: "Feasibility and machinery-safety concept",
      summary:
        "Validate carton variation, payload, reach, cycle time, pallet patterns, guarding and operator interaction before selecting the cell architecture.",
      rationale:
        "These constraints determine whether the proposed automation is technically viable and what specialist disciplines are required.",
      localActions: [
        "Capture representative cartons, pallet patterns, current cycle times and available floor space.",
        "Nominate operations, maintenance and safety stakeholders for discovery."
      ],
      outsourceTriggers: [
        "No internal machinery-safety competence or robot simulation capability is available.",
        "The process needs custom tooling, vision or formal risk assessment."
      ],
      requiredCapabilities: [
        "robotic cell feasibility",
        "machinery risk assessment",
        "cycle-time simulation"
      ],
      risks: [
        "Equipment is selected before process variation is understood.",
        "Guarding and access constraints are discovered after layout approval."
      ],
      confidence: 0.9,
      citationIds
    },
    {
      id: `${needProfileId}:approach:robotics:proof`,
      needProfileId,
      title: "Proof of process for mixed cartons",
      summary:
        "Trial the highest-risk gripping, sensing and carton-presentation assumptions using representative production samples.",
      rationale:
        "A focused trial reduces tooling and integration risk before committing to full fabrication.",
      localActions: [
        "Provide representative cartons, damaged samples and target quality measures.",
        "Agree measurable pick, place, stability and cycle-time outcomes."
      ],
      outsourceTriggers: [
        "Specialist machine vision, vacuum tooling or product testing is required.",
        "Representative trials cannot be performed safely with internal resources."
      ],
      requiredCapabilities: [
        "end-of-arm tooling",
        "machine vision",
        "robot programming"
      ],
      risks: [
        "Trial samples do not represent production variability.",
        "Upstream conveyor interfaces are excluded from proof-of-process testing."
      ],
      confidence: 0.86,
      citationIds
    },
    {
      id: `${needProfileId}:approach:robotics:integration`,
      needProfileId,
      title: "Staged integration and acceptance",
      summary:
        "Deliver detailed design, build, factory acceptance, installation, commissioning and training against separate evidence-based milestones.",
      rationale:
        "Staged acceptance gives the factory and integrator a shared definition of progress and cutover readiness.",
      localActions: [
        "Nominate site access windows, utilities and production blackout constraints.",
        "Define operator training and maintenance handover evidence."
      ],
      outsourceTriggers: [
        "The factory cannot own controls integration, safety validation or commissioning.",
        "Production continuity requires a coordinated installation and cutover plan."
      ],
      requiredCapabilities: [
        "robotic systems integration",
        "industrial controls",
        "commissioning and training"
      ],
      risks: [
        "Site services or upstream equipment are not ready for commissioning.",
        "Acceptance criteria are subjective or agreed too late."
      ],
      confidence: 0.93,
      citationIds
    }
  ];
}

function fixtureCitations(
  needProfileId: string,
  scenario: MarketplaceDemoScenario,
  accessedAt: string
): ResearchCitation[] {
  const sources =
    scenario === "robotics"
      ? [
          {
            title: "Guide for safe design of plant",
            url: "https://www.safeworkaustralia.gov.au/doc/guide-safe-design-plant",
            sourceType: "standards" as const,
            evidenceNote:
              "Safe Work Australia guidance supports integrating risk controls early in plant design and considering safety across the plant lifecycle."
          },
          {
            title:
              "ISO 10218-2:2025 — Robotics — Safety requirements — Part 2: Industrial robot applications and robot cells",
            url: "https://www.iso.org/standard/73934.html",
            sourceType: "standards" as const,
            evidenceNote:
              "The standard identifies safety requirements for industrial robot applications and robot cells."
          },
          {
            title: "ABB Robotics",
            url: "https://www.abb.com/global/en/areas/robotics",
            sourceType: "manufacturer" as const,
            evidenceNote:
              "ABB's official robotics portfolio covers industrial robots, controllers, software, application solutions, services and equipment relevant to integration."
          }
        ]
      : scenario === "process_heating"
        ? [
            {
              title: "Model Code of Practice: Managing risks of plant in the workplace",
              url: "https://www.safeworkaustralia.gov.au/doc/model-code-practice-managing-risks-plant-workplace",
              sourceType: "standards" as const,
              evidenceNote:
                "Safe Work Australia guidance supports risk-managed maintenance, competent work and controlled use of machinery and connected plant."
            },
            {
              title: "Electrical risks at the workplace",
              url: "https://www.safework.nsw.gov.au/resource-library/construction/electrical-services/electrical-risks-at-the-workplace-fact-sheet",
              sourceType: "standards" as const,
              evidenceNote:
                "SafeWork NSW guidance supports controlling electrical risk and using appropriately licensed or registered people for electrical work."
            },
            {
              title: "MI Band Heaters Allow Tighter Temperature Control Than Ceramic Knuckle Band Heaters",
              url: "https://www.watlow.com/resources-and-support/technical-library/case-studies/tighter-temperature-control",
              sourceType: "manufacturer" as const,
              evidenceNote:
                "Watlow's official application evidence shows that extrusion-barrel heating performance can involve heater construction, thermal transfer and temperature-control behaviour."
            }
          ]
        : [
            {
              title: "SafeWork NSW electrical work guidance",
              url: "https://www.safework.nsw.gov.au/hazards-a-z/electrical-and-power/electrical-work",
              sourceType: "standards" as const,
              evidenceNote:
                "SafeWork NSW guidance supports competent, authorised work and control of electrical risk."
            },
            {
              title: "SIMATIC controllers",
              url: "https://www.siemens.com/global/en/products/automation/systems/industrial/plc.html",
              sourceType: "manufacturer" as const,
              evidenceNote:
                "Siemens material supports checking controller family, tooling and lifecycle compatibility before recovery."
            },
            {
              title: "Programmable controllers",
              url: "https://www.rockwellautomation.com/en-au/products/hardware/allen-bradley/programmable-controllers.html",
              sourceType: "manufacturer" as const,
              evidenceNote:
                "Manufacturer material establishes the controller and engineering-tool context a recovery provider may need."
            }
          ];

  return sources.map((source, index) => ({
    id: `${needProfileId}:research-citation:${scenario}:${index + 1}`,
    ...source,
    provider: "fixture",
    accessedAt
  }));
}

function formatAudBudget(budgetAud: number | undefined): string | undefined {
  return budgetAud === undefined
    ? undefined
    : `AUD ${budgetAud.toLocaleString("en-AU")}`;
}

function plcLeads(budgetAud: number | undefined) {
  const budget = formatAudBudget(budgetAud);

  return [
    {
      slug: "controlline-response-demo",
      companyName: "ControlLine Response (Demo)",
      contactEmail: "response@controlline-response-demo.example",
      contactPhone: "+61400000201",
      location: "Western Sydney, NSW",
      serviceRegions: ["Western Sydney", "Sydney", "NSW"],
      capabilities: [
        "Siemens PLC diagnostics",
        "industrial networking",
        "breakdown response",
        "packaging-line controls"
      ],
      matchScore: 96,
      matchReasons: [
        "Capability fit: Siemens PLC diagnostics, industrial networking and packaging-line recovery align directly with the equipment and required scope.",
        "Location fit: Western Sydney coverage matches the factory location.",
        "Availability fit: its breakdown-response model aligns with the same-day urgency and speed-first buyer priority, subject to supplier confirmation.",
        "Industry fit: packaging-line controls evidence is relevant to the food and beverage production setting."
      ],
      risks: [
        "Current same-day crew availability must be confirmed by the supplier.",
        budget
          ? `The supplier response must confirm that the indicative scope can fit the ${budget} budget.`
          : "Commercial fit is unknown until the supplier responds."
      ]
    },
    {
      slug: "eastgrid-automation-demo",
      companyName: "EastGrid Automation (Demo)",
      contactEmail: "service@eastgrid-automation-demo.example",
      contactPhone: "+61400000202",
      location: "Sydney, NSW",
      serviceRegions: ["Sydney", "Western Sydney", "NSW"],
      capabilities: [
        "PLC backup recovery",
        "drives and I/O diagnostics",
        "controls lifecycle planning"
      ],
      matchScore: 91,
      matchReasons: [
        "Capability fit: PLC backup recovery plus drives and I/O diagnostics cover controlled restoration and cross-system fault risks.",
        "Location fit: Sydney and Western Sydney service evidence aligns with the requested site.",
        "Priority fit: lifecycle planning supports the buyer's requirement for validated recovery and handover, not only a temporary restart.",
        "Industry fit: controls recovery is applicable to the stopped packaging-conveyor context."
      ],
      risks: [
        "Same-day callout timing and Siemens engineering-tool compatibility require confirmation.",
        budget
          ? `Commercial fit against the ${budget} budget is unknown until the supplier responds.`
          : "Commercial fit is unknown until the supplier responds."
      ]
    },
    {
      slug: "lineproof-controls-demo",
      companyName: "LineProof Controls (Demo)",
      contactEmail: "support@lineproof-controls-demo.example",
      contactPhone: "+61400000203",
      location: "Parramatta, NSW",
      serviceRegions: ["Parramatta", "Western Sydney", "NSW"],
      capabilities: [
        "industrial electrical fault finding",
        "safe isolation",
        "PLC diagnostics"
      ],
      matchScore: 87,
      matchReasons: [
        "Capability fit: industrial electrical fault finding, safe isolation and PLC diagnostics match the cross-system recovery constraints.",
        "Location fit: Parramatta is close to the requested Western Sydney site.",
        "Urgency fit: local coverage is credible for a speed-priority response, while actual availability remains unconfirmed.",
        "Industry fit: electrical and controls capability is relevant to a food-production packaging line."
      ],
      risks: [
        "Verified Siemens backup recovery experience must be confirmed.",
        "Price and same-day availability are not established by public fixture evidence."
      ]
    }
  ];
}

function processHeatingLeads(budgetAud: number | undefined) {
  const budget = formatAudBudget(budgetAud);

  return [
    {
      slug: "thermalzone-process-demo",
      companyName: "ThermalZone Process Services (Demo)",
      contactEmail: "response@thermalzone-process-demo.example",
      contactPhone: "+61400000301",
      location: "Western Sydney, NSW",
      serviceRegions: ["Western Sydney", "Sydney", "NSW"],
      capabilities: [
        "industrial process heating diagnostics",
        "heater-band systems",
        "temperature control and instrumentation",
        "breakdown response"
      ],
      matchScore: 95,
      matchReasons: [
        "Capability fit: process heating, heater-band and temperature-control evidence aligns with the failed extrusion barrel zone.",
        "Location fit: Western Sydney coverage supports a local assessment, subject to supplier confirmation.",
        "Technical fit: the service evidence spans heater hardware, instrumentation and control rather than assuming one failed component."
      ],
      risks: [
        "Current response timing and experience with the exact extruder make and heater rating require confirmation.",
        budget
          ? `The supplier response must confirm that the assessment can fit the ${budget} budget.`
          : "Commercial fit is unknown until the supplier responds."
      ]
    },
    {
      slug: "polymerline-maintenance-demo",
      companyName: "PolymerLine Maintenance (Demo)",
      contactEmail: "service@polymerline-maintenance-demo.example",
      contactPhone: "+61400000302",
      location: "Sydney, NSW",
      serviceRegions: ["Sydney", "Western Sydney", "NSW"],
      capabilities: [
        "plastics extrusion equipment diagnostics",
        "extruder barrel heating zones",
        "extruder screw-drive assessment",
        "extrusion process validation"
      ],
      matchScore: 92,
      matchReasons: [
        "Capability fit: plastics extrusion maintenance covers both the barrel heating symptom and the screw-load evidence.",
        "Process fit: extrusion validation capability supports an evidence-based return to production after approved repair.",
        "Location fit: Sydney and Western Sydney service regions align with the requested market."
      ],
      risks: [
        "Licensed electrical capability and current site availability must be confirmed.",
        budget
          ? `Commercial fit against the ${budget} budget requires a supplier response.`
          : "Commercial fit requires a supplier response."
      ]
    },
    {
      slug: "westcircuit-industrial-demo",
      companyName: "WestCircuit Industrial (Demo)",
      contactEmail: "support@westcircuit-industrial-demo.example",
      contactPhone: "+61400000303",
      location: "Parramatta, NSW",
      serviceRegions: ["Parramatta", "Western Sydney", "NSW"],
      capabilities: [
        "industrial electrical fault finding",
        "safe isolation",
        "heater circuits",
        "temperature instrumentation"
      ],
      matchScore: 86,
      matchReasons: [
        "Capability fit: industrial electrical fault finding and temperature instrumentation align with an authorised heating-zone assessment.",
        "Location fit: Parramatta is close to Western Sydney industrial sites.",
        "Risk fit: safe-isolation capability is relevant to electrical heating equipment and connected plant."
      ],
      risks: [
        "Plastics extrusion and screw-drive experience require confirmation before approval.",
        "Price and response timing are not established by fixture evidence."
      ]
    }
  ];
}

function roboticsLeads(budgetAud: number | undefined) {
  const budget = formatAudBudget(budgetAud);

  return [
    {
      slug: "axisforge-robotics-demo",
      companyName: "AxisForge Robotics (Demo)",
      contactEmail: "projects@axisforge-robotics-demo.example",
      contactPhone: "+61400000101",
      location: "Western Sydney, NSW",
      serviceRegions: ["Western Sydney", "Sydney", "NSW"],
      capabilities: [
        "robotic systems integration",
        "machine vision",
        "end-of-arm tooling"
      ],
      matchScore: 95,
      matchReasons: [
        "Capability fit: robotic integration, machine vision and end-of-arm tooling align with the mixed-carton equipment and proof-of-process scope.",
        "Location fit: Western Sydney project coverage matches the factory location.",
        "Priority fit: feasibility and tooling capability support the buyer's technical-fit priority and 60-day planning window.",
        "Industry fit: the evidence is specific to packaging-cell integration rather than general-purpose robotics."
      ],
      risks: [
        "Cycle-time and carton-variation capability must be proven with representative samples.",
        budget
          ? `Commercial fit against the ${budget} budget requires a supplier response.`
          : "Commercial fit requires a supplier response."
      ]
    },
    {
      slug: "southern-cell-automation-demo",
      companyName: "Southern Cell Automation (Demo)",
      contactEmail: "hello@southern-cell-automation-demo.example",
      contactPhone: "+61400000102",
      location: "Melbourne, VIC",
      serviceRegions: ["VIC", "NSW", "Eastern Australia"],
      capabilities: [
        "robot programming",
        "machinery safety",
        "factory acceptance testing"
      ],
      matchScore: 89,
      matchReasons: [
        "Capability fit: robot programming, machinery safety and factory acceptance support staged design and commissioning.",
        "Location fit: documented interstate project delivery covers NSW, with mobilisation treated as a ranking trade-off.",
        "Priority fit: safety and acceptance capability supports the buyer's technical-fit priority.",
        "Industry fit: staged acceptance is relevant to integrating automation beside an operating packaging line."
      ],
      risks: [
        "Interstate mobilisation may affect workshop and site-response timing.",
        "Machine-vision, tooling and budget fit require confirmation."
      ]
    },
    {
      slug: "harbour-motion-systems-demo",
      companyName: "Harbour Motion Systems (Demo)",
      contactEmail: "opportunities@harbour-motion-systems-demo.example",
      contactPhone: "+61400000103",
      location: "Newcastle, NSW",
      serviceRegions: ["Newcastle", "Sydney", "NSW"],
      capabilities: [
        "industrial controls",
        "robot simulation",
        "commissioning and training"
      ],
      matchScore: 84,
      matchReasons: [
        "Capability fit: controls, robot simulation, commissioning and training align with the selected deployment pathway.",
        "Location fit: NSW coverage supports site commissioning and operator training.",
        "Priority fit: simulation reduces technical risk before the buyer commits within the planned 60-day window.",
        "Industry fit: controls and commissioning capability suit integration with the existing packaging conveyor."
      ],
      risks: [
        "End-of-arm tooling and machine-vision capability require confirmation before shortlist approval.",
        "Newcastle mobilisation and commercial fit against the buyer budget remain unconfirmed."
      ]
    }
  ];
}
