import {
  solutionResearchResultSchema,
  supplierLeadSchema,
  truncateIntakeTitle,
  type MarketplaceNeedProfile,
  type ResearchCitation,
  type SolutionApproach,
  type SolutionResearchResult,
  type SupplierLead
} from "@veltact/contracts";

export type MarketplaceDemoScenario = "general" | "plc" | "robotics";

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
  if (/\bplc|siemens|allen[- ]bradley|hmi|scada|controller\b/.test(evidence)) {
    return "plc";
  }
  return "general";
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
      : scenario === "plc"
        ? plcApproaches(needProfileId, citationIds)
        : generalApproaches(needProfileId, profile, citationIds);

  return solutionResearchResultSchema.parse({
    id: `${needProfileId}:research:${scenario}`,
    needProfileId,
    sourceMode: "fixture",
    overview:
      scenario === "robotics"
        ? "Treat the mixed-carton palletising cell as a staged integration: validate product variation, cycle time and machinery safety before proving the handling process and commissioning the full cell."
        : scenario === "plc"
          ? "Treat the stopped Siemens PLC line as an evidence-led recovery: preserve the current state, use authorised controls expertise for diagnosis and restoration, then validate the recovered baseline before production handover."
          : generalOverview(profile),
    approaches,
    citations,
    missingInformation:
      scenario === "robotics"
        ? [
            "Representative carton dimensions, weights and presentation variation",
            "Target cycle time, pallet patterns and quality acceptance measures",
            "Available cell footprint, services and production cutover windows"
          ]
        : scenario === "plc"
          ? [
              "Exact Siemens controller family, firmware and visible diagnostic state",
              "Provenance and date of the last verified PLC backup",
              "Whether drives, industrial network or safety controls are also affected"
            ]
          : [
              `Equipment make, model and nameplate data for ${primaryEquipment(profile)}`,
              "Recent maintenance, fault and operating history, including the last known good condition",
              "Whether adjacent mechanical, electrical, control or process systems are also affected"
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
      : scenario === "plc"
        ? plcLeads(profile.budgetAud)
        : generalLeads(profile);

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

function generalApproaches(
  needProfileId: string,
  profile: MarketplaceNeedProfile,
  citationIds: string[]
): SolutionApproach[] {
  const equipment = primaryEquipment(profile);
  const category = profile.category.trim();
  const capabilities = profileCapabilities(profile);
  const capabilitySummary = capabilities.slice(0, 3).join(", ");
  const context = requirementExcerpt(profile);

  return [
    {
      id: `${needProfileId}:approach:general:evidence`,
      needProfileId,
      title: `Capture ${equipment} evidence and operating context`,
      summary:
        `Preserve the available evidence for ${equipment} and the reported condition: ${context}`,
      rationale:
        "A factual operating record helps a competent provider define the affected system without assuming a single cause or changing machinery.",
      localActions: [
        `Record approved operator-visible symptoms, timing and the last known good condition for ${equipment}.`,
        "Collect the nameplate, manufacturer documentation, maintenance history and relevant drawings without opening guarded or energised equipment."
      ],
      outsourceTriggers: [
        "The factory cannot establish the affected equipment boundary from approved records.",
        "Electrical, mechanical, stored-energy, hot-surface or moving-equipment hazards require authorised specialist assessment."
      ],
      requiredCapabilities: capabilities,
      risks: [
        "A symptom may be treated as proof of one failed component before connected systems are assessed.",
        "Uncontrolled resets, adjustments or dismantling may remove useful evidence or introduce additional risk."
      ],
      confidence: 0.9,
      citationIds
    },
    {
      id: `${needProfileId}:approach:general:intervention`,
      needProfileId,
      title: `Controlled ${category.toLowerCase()} intervention`,
      summary:
        `Engage a competent provider with ${capabilitySummary} capability to assess the approved scope and propose a controlled intervention.`,
      rationale:
        "A defined scope, isolation boundary and acceptance evidence keep diagnosis, repair and commercial approval separate and reviewable.",
      localActions: [
        "Nominate the authorised site representative and provide the approved access, isolation and permit requirements.",
        "Agree the assessment boundary, response timing and evidence required before repair work is authorised."
      ],
      outsourceTriggers: [
        `The work requires specialist capability in ${capabilitySummary}.`,
        "The condition crosses equipment disciplines or the internal team cannot perform the work within its authorisation and competence."
      ],
      requiredCapabilities: capabilities,
      risks: [
        "Work starts before the affected-system boundary and safety controls are agreed.",
        "Commercial pressure turns an assessment scope into unapproved repair activity."
      ],
      confidence: 0.93,
      citationIds
    },
    {
      id: `${needProfileId}:approach:general:validation`,
      needProfileId,
      title: `Validate ${equipment} performance and prevent recurrence`,
      summary:
        "After an approved intervention, validate the equipment against agreed operating, safety and quality evidence before production handover.",
      rationale:
        "The work is not complete until the factory can show that the approved outcome is stable and retain a useful maintenance baseline.",
      localActions: [
        "Define the authorised acceptance evidence and production handover owner before validation begins.",
        "Record the approved final configuration, replaced components, test evidence and follow-up actions."
      ],
      outsourceTriggers: [
        "The factory lacks the competence or instruments needed to validate the repaired system.",
        "Performance remains outside the agreed acceptance window or the cause remains unconfirmed."
      ],
      requiredCapabilities: [
        ...capabilities.slice(0, 2),
        "industrial equipment validation",
        "maintenance handover"
      ],
      risks: [
        "A temporary recovery is accepted without confirming stable operation or product quality.",
        "The final condition and failure evidence are not retained for recurrence prevention."
      ],
      confidence: 0.87,
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
      : scenario === "plc"
        ? [
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
          ]
        : [
            {
              title: "Model Code of Practice: Managing risks of plant in the workplace",
              url: "https://www.safeworkaustralia.gov.au/doc/model-code-practice-managing-risks-plant-workplace",
              sourceType: "standards" as const,
              evidenceNote:
                "Safe Work Australia guidance supports risk-managed maintenance, competent work and controlled use of machinery and connected plant."
            },
            {
              title:
                "ISO 12100:2010 — Safety of machinery — Risk assessment and risk reduction",
              url: "https://www.iso.org/standard/51528.html",
              sourceType: "standards" as const,
              evidenceNote:
                "ISO 12100 provides general machinery risk-assessment and risk-reduction principles across equipment technologies."
            },
            {
              title: "Plant, Equipment and Machinery Energy Isolation Guidelines",
              url: "https://www.safework.nsw.gov.au/__data/assets/pdf_file/0004/1078177/plant-equipment-and-machinery-energy-isolation-guidelines.pdf",
              sourceType: "standards" as const,
              evidenceNote:
                "SafeWork NSW guidance supports controlled isolation and competent maintenance across electrical, mechanical and stored-energy hazards."
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

function generalLeads(profile: MarketplaceNeedProfile) {
  const budget = formatAudBudget(profile.budgetAud);
  const capabilities = profileCapabilities(profile);
  const equipment = primaryEquipment(profile);
  const location = profile.location;
  const capabilitySummary = capabilities.slice(0, 3).join(", ");

  return [
    {
      slug: "plantbridge-industrial-demo",
      companyName: "PlantBridge Industrial Response (Demo)",
      contactEmail: "response@plantbridge-industrial-demo.example",
      contactPhone: "+61400000401",
      location,
      serviceRegions: generalServiceRegions(location),
      capabilities: [...capabilities, "breakdown response"],
      matchScore: 94,
      matchReasons: [
        `Capability fit: ${capabilitySummary} aligns with the buyer-reviewed scope for ${equipment}.`,
        `Location fit: fixture coverage includes ${location}, subject to supplier confirmation.`,
        "Response fit: the provider fixture supports evidence-led assessment before separately approved repair work."
      ],
      risks: [
        "Current availability, licences and experience with the exact equipment make and model require confirmation.",
        budget
          ? `The supplier response must confirm fit against the ${budget} budget.`
          : "Commercial fit requires a supplier response."
      ]
    },
    {
      slug: "regional-maintenance-partners-demo",
      companyName: "Regional Maintenance Partners (Demo)",
      contactEmail: "service@regional-maintenance-partners-demo.example",
      contactPhone: "+61400000402",
      location,
      serviceRegions: generalServiceRegions(location),
      capabilities: [
        ...capabilities.slice().reverse(),
        "industrial maintenance planning"
      ],
      matchScore: 90,
      matchReasons: [
        `Capability fit: the fixture capability record includes ${capabilitySummary}.`,
        `Equipment fit: its maintenance scope is relevant to ${equipment} without assuming a specific failure cause.`,
        "Delivery fit: assessment, intervention and handover can be quoted as separate buyer-approved stages."
      ],
      risks: [
        "The supplier must confirm the required response time and any specialist subcontractor dependencies.",
        budget
          ? `Commercial fit against the ${budget} budget requires a supplier response.`
          : "Commercial fit requires a supplier response."
      ]
    },
    {
      slug: "evidenceworks-engineering-demo",
      companyName: "EvidenceWorks Engineering (Demo)",
      contactEmail: "projects@evidenceworks-engineering-demo.example",
      contactPhone: "+61400000403",
      location,
      serviceRegions: generalServiceRegions(location),
      capabilities: [
        ...capabilities.slice(0, 2),
        "industrial equipment validation",
        "maintenance handover"
      ],
      matchScore: 85,
      matchReasons: [
        `Capability fit: ${capabilities.slice(0, 2).join(", ")} supports the reviewed requirement.`,
        `Validation fit: the fixture record covers acceptance evidence and handover for ${equipment}.`,
        `Location fit: the stated fixture service region includes ${location}.`
      ],
      risks: [
        "Hands-on repair capability and equipment-specific experience require confirmation.",
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

function profileCapabilities(profile: MarketplaceNeedProfile): string[] {
  const capabilities = [
    ...(profile.requiredCapabilities ?? []),
    ...(profile.requiredCapability ?? [])
  ].filter((value, index, all) => value && all.indexOf(value) === index);
  return capabilities.length
    ? capabilities
    : ["industrial equipment diagnostics"];
}

function primaryEquipment(profile: MarketplaceNeedProfile): string {
  return (
    profile.equipmentOrTechnology?.[0] ??
    profile.equipmentTechnology?.[0] ??
    profile.category
  ).trim();
}

function requirementExcerpt(profile: MarketplaceNeedProfile): string {
  const firstSentence =
    (profile.description || profile.problemSummary || profile.title)
      .split(/[.!?]/)[0]
      ?.trim() || profile.title;
  return truncateIntakeTitle(firstSentence);
}

function generalOverview(profile: MarketplaceNeedProfile): string {
  const equipment = primaryEquipment(profile);
  const capabilities = profileCapabilities(profile).slice(0, 3).join(", ");
  return `Treat the ${equipment} requirement as an evidence-led industrial response: preserve the reported context, use competent ${capabilities} capability to define and deliver the approved intervention, then validate the outcome before production handover.`;
}

function generalServiceRegions(location: string): string[] {
  const state = location.split(",").at(-1)?.trim();
  return [
    ...new Set(
      [location, state, "Australia"].filter(
        (value): value is string => Boolean(value)
      )
    )
  ];
}
