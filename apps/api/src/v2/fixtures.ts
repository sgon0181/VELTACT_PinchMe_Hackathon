import { randomUUID } from "node:crypto";
import type {
  MarketplaceNeedProfile,
  ResearchCitation,
  SolutionResearchResult,
  SupplierLead
} from "@veltact/contracts";

export type DemoScenario = "plc" | "robotics";

export function inferDemoScenario(profile: MarketplaceNeedProfile): DemoScenario {
  const evidence = [
    profile.title,
    profile.description,
    profile.category,
    profile.industry,
    ...(profile.equipmentOrTechnology ?? []),
    ...(profile.equipmentTechnology ?? [])
  ]
    .join(" ")
    .toLowerCase();
  return /\brobot|cobot|manipulator|end[- ]of[- ]arm/.test(evidence)
    ? "robotics"
    : "plc";
}

export function createFixtureResearch(
  needProfileId: string,
  profile: MarketplaceNeedProfile,
  currentTime = new Date()
): SolutionResearchResult {
  const generatedAt = currentTime.toISOString();
  const scenario = inferDemoScenario(profile);
  const sources =
    scenario === "robotics"
      ? roboticsResearchSources(generatedAt)
      : plcResearchSources(generatedAt);
  const citationIds = sources.map((source) => source.id);

  return {
    id: randomUUID(),
    needProfileId,
    sourceMode: "fixture",
    overview:
      scenario === "robotics"
        ? "A robotic cell should be framed as a staged integration project: validate the use case and safety concept, prove the process, then commission against measurable acceptance criteria."
        : "An urgent PLC outage should separate safe evidence gathering from restoration work, preserve the current machine state, and escalate quickly when authorised controls expertise or verified backups are unavailable.",
    approaches:
      scenario === "robotics"
        ? [
            {
              id: randomUUID(),
              needProfileId,
              title: "Feasibility and safety concept",
              summary:
                "Validate cycle time, payload, reach, product variability, guarding and operator interaction before selecting equipment.",
              rationale:
                "Early constraints determine whether the cell is technically and commercially viable.",
              localActions: [
                "Capture current process times, product variants and available floor space.",
                "Nominate operators, maintenance and safety stakeholders for a structured discovery session."
              ],
              outsourceTriggers: [
                "No internal machinery-safety competence is available.",
                "The process needs robot simulation, tooling design or formal risk assessment."
              ],
              requiredCapabilities: [
                "robotic cell feasibility",
                "machinery risk assessment",
                "cycle-time simulation"
              ],
              risks: [
                "Automation target is set before process variation is understood.",
                "Safety or guarding changes are discovered after equipment selection."
              ],
              confidence: 0.87,
              citationIds
            },
            {
              id: randomUUID(),
              needProfileId,
              title: "Proof of process",
              summary:
                "Trial the highest-risk handling, sensing and end-of-arm tooling assumptions before full fabrication.",
              rationale:
                "A focused trial reduces integration and commissioning risk without committing to a complete cell.",
              localActions: [
                "Provide representative parts, defect examples and target quality measures.",
                "Agree a short list of pass/fail trial outcomes."
              ],
              outsourceTriggers: [
                "Specialist vision, force control or custom tooling is required.",
                "Representative process trials cannot be performed safely on site."
              ],
              requiredCapabilities: [
                "robot programming",
                "end-of-arm tooling",
                "machine vision"
              ],
              risks: [
                "Trial samples do not represent production variability.",
                "Interfaces to existing machinery are excluded from the trial."
              ],
              confidence: 0.83,
              citationIds
            },
            {
              id: randomUUID(),
              needProfileId,
              title: "Staged integration and acceptance",
              summary:
                "Deliver design, build, factory acceptance, site commissioning and handover as separately accepted milestones.",
              rationale:
                "Milestone evidence gives the factory and integrator a shared definition of progress.",
              localActions: [
                "Nominate site access windows and production blackout constraints.",
                "Define operator training and maintenance handover evidence."
              ],
              outsourceTriggers: [
                "The factory cannot own controls integration, guarding validation or commissioning.",
                "Production downtime requires a coordinated cutover plan."
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
              confidence: 0.9,
              citationIds
            }
          ]
        : [
            {
              id: randomUUID(),
              needProfileId,
              title: "Safe evidence capture and triage",
              summary:
                "Preserve alarms, controller state, network indicators and recent change history without bypassing safeguards or changing live control logic.",
              rationale:
                "High-quality evidence shortens specialist diagnosis while avoiding unreviewed interventions.",
              localActions: [
                "Follow the site's isolation and authorisation procedure.",
                "Photograph non-sensitive alarm and status evidence and record the last known good operating state.",
                "Locate approved backups, drawings and change records without loading them."
              ],
              outsourceTriggers: [
                "The state cannot be inspected under the site's authorised procedure.",
                "There is evidence of damaged electrical equipment, safety-system involvement or unknown program changes."
              ],
              requiredCapabilities: [
                "industrial electrical fault finding",
                "PLC diagnostics",
                "safe isolation"
              ],
              risks: [
                "Unrecorded changes overwrite useful fault evidence.",
                "Production pressure encourages unsafe bypass or reset attempts."
              ],
              confidence: 0.91,
              citationIds
            },
            {
              id: randomUUID(),
              needProfileId,
              title: "Controlled recovery from verified baseline",
              summary:
                "Have an authorised controls specialist compare diagnostics and approved backups before any restoration action.",
              rationale:
                "A verified baseline reduces the chance of restoring an incorrect program or masking a hardware fault.",
              localActions: [
                "Confirm controller model, firmware and backup provenance.",
                "Identify the person authorised to approve a controlled restart."
              ],
              outsourceTriggers: [
                "No verified backup or compatible engineering environment is available.",
                "The fault crosses PLC, network, drive, safety or field-instrument boundaries."
              ],
              requiredCapabilities: [
                "PLC backup recovery",
                "industrial networking",
                "drive and I/O diagnostics"
              ],
              risks: [
                "Firmware or hardware mismatch prevents a safe restore.",
                "The visible PLC alarm is a symptom of another failed subsystem."
              ],
              confidence: 0.88,
              citationIds
            },
            {
              id: randomUUID(),
              needProfileId,
              title: "Stabilisation and recurrence prevention",
              summary:
                "After production is restored, capture the validated baseline and convert the incident into backup, spares and monitoring actions.",
              rationale:
                "Recovery is incomplete until the factory can explain the failure evidence and reduce repeat downtime.",
              localActions: [
                "Record the approved final program, firmware and hardware configuration.",
                "Schedule a short incident review with operations and maintenance."
              ],
              outsourceTriggers: [
                "The cause remains unconfirmed after restoration.",
                "Obsolescence, recurring communications faults or unsupported hardware are identified."
              ],
              requiredCapabilities: [
                "controls lifecycle planning",
                "industrial network health",
                "maintenance handover"
              ],
              risks: [
                "A temporary recovery becomes the undocumented production baseline.",
                "Obsolete components remain a single point of failure."
              ],
              confidence: 0.84,
              citationIds
            }
          ],
    citations: sources,
    missingInformation:
      scenario === "robotics"
        ? [
            "Representative part range and target cycle time",
            "Available footprint and site service constraints",
            "Required safety and quality acceptance evidence"
          ]
        : [
            "Controller make, model and visible fault state",
            "Availability and provenance of the last verified backup",
            "Whether safety-related controls are affected"
          ],
    safetyNotice:
      "This is AI-assisted procurement analysis, not a diagnosis or instruction to alter industrial equipment. Only authorised personnel should inspect, isolate, program or restart machinery.",
    generatedAt
  };
}

export function createFixtureSupplierLeads(
  needProfileId: string,
  profile: MarketplaceNeedProfile,
  currentTime = new Date()
): SupplierLead[] {
  const now = currentTime.toISOString();
  const scenario = inferDemoScenario(profile);
  const candidates =
    scenario === "robotics"
      ? [
          {
            companyName: "AxisForge Robotics (Demo)",
            website: "https://axisforge.example",
            contactEmail: "projects@axisforge.example",
            contactPhone: "+61400000101",
            location: "Sydney, NSW",
            capabilities: [
              "robotic systems integration",
              "machine vision",
              "end-of-arm tooling"
            ],
            score: 94,
            reasons: [
              "Robotic cell integration aligns with the requested capability.",
              "Sydney service coverage matches the nominated site region."
            ]
          },
          {
            companyName: "Southern Cell Automation (Demo)",
            website: "https://southerncell.example",
            contactEmail: "hello@southerncell.example",
            contactPhone: "+61400000102",
            location: "Melbourne, VIC",
            capabilities: [
              "robot programming",
              "machinery safety",
              "factory acceptance testing"
            ],
            score: 88,
            reasons: [
              "Evidence indicates staged design, safety and commissioning capability.",
              "Provides interstate project delivery in eastern Australia."
            ]
          },
          {
            companyName: "Harbour Motion Systems (Demo)",
            website: "https://harbourmotion.example",
            contactEmail: "opportunities@harbourmotion.example",
            contactPhone: "+61400000103",
            location: "Newcastle, NSW",
            capabilities: [
              "industrial controls",
              "robot simulation",
              "commissioning and training"
            ],
            score: 84,
            reasons: [
              "Controls and commissioning evidence fit the deployment phase.",
              "Regional location may reduce site-response time."
            ]
          }
        ]
      : [
          {
            companyName: "ControlLine Response (Demo)",
            website: "https://controlline.example",
            contactEmail: "response@controlline.example",
            contactPhone: "+61400000201",
            location: "Newcastle, NSW",
            capabilities: [
              "PLC diagnostics",
              "industrial networking",
              "breakdown response"
            ],
            score: 96,
            reasons: [
              "PLC recovery and breakdown response directly match the requirement.",
              "Local service coverage supports the stated urgency."
            ]
          },
          {
            companyName: "EastGrid Automation (Demo)",
            website: "https://eastgrid.example",
            contactEmail: "service@eastgrid.example",
            contactPhone: "+61400000202",
            location: "Sydney, NSW",
            capabilities: [
              "PLC backup recovery",
              "drives and I/O diagnostics",
              "controls lifecycle planning"
            ],
            score: 90,
            reasons: [
              "Recovery and lifecycle evidence covers immediate and recurrence work.",
              "Services industrial sites across NSW."
            ]
          },
          {
            companyName: "Hunter Industrial Controls (Demo)",
            website: "https://huntercontrols.example",
            contactEmail: "support@huntercontrols.example",
            contactPhone: "+61400000203",
            location: "Maitland, NSW",
            capabilities: [
              "industrial electrical fault finding",
              "safe isolation",
              "PLC diagnostics"
            ],
            score: 87,
            reasons: [
              "Electrical and controls capabilities match the cross-system fault risk.",
              "Hunter location is aligned with the demo factory."
            ]
          }
        ];

  return candidates.map((candidate, index) => {
    const citation: ResearchCitation = {
      id: randomUUID(),
      title: `${candidate.companyName} fixture profile`,
      url: candidate.website,
      sourceType: "supplier_website",
      provider: "fixture",
      evidenceNote:
        "Deterministic demonstration evidence. This is not a verified or real supplier listing.",
      accessedAt: now
    };
    return {
      id: randomUUID(),
      needProfileId,
      companyName: candidate.companyName,
      website: candidate.website,
      contactEmail: candidate.contactEmail,
      contactPhone: candidate.contactPhone,
      location: candidate.location,
      serviceRegions: ["NSW", "VIC", "Australia"],
      capabilities: candidate.capabilities,
      matchScore: candidate.score,
      matchReasons: candidate.reasons,
      risks: [
        "Fixture candidate: identity, availability and qualifications require supplier confirmation."
      ],
      evidence: [citation],
      sourceMode: "fixture",
      lifecycleStatus: "discovered",
      createdAt: new Date(currentTime.getTime() + index).toISOString(),
      updatedAt: new Date(currentTime.getTime() + index).toISOString()
    };
  });
}

function plcResearchSources(accessedAt: string): ResearchCitation[] {
  return [
    {
      id: randomUUID(),
      title: "Electrical work",
      url: "https://www.safework.nsw.gov.au/hazards-a-z/electrical-and-power/electrical-work",
      sourceType: "standards",
      provider: "fixture",
      evidenceNote:
        "SafeWork NSW guidance supports using competent, authorised workers and controlling electrical risks.",
      accessedAt
    },
    {
      id: randomUUID(),
      title: "Programmable Controllers",
      url: "https://www.rockwellautomation.com/en-au/products/hardware/allen-bradley/programmable-controllers.html",
      sourceType: "manufacturer",
      provider: "fixture",
      evidenceNote:
        "Manufacturer material establishes the controller and engineering-tool context that a recovery provider may need to support.",
      accessedAt
    },
    {
      id: randomUUID(),
      title: "SIMATIC controllers",
      url: "https://www.siemens.com/global/en/products/automation/systems/industrial/plc.html",
      sourceType: "manufacturer",
      provider: "fixture",
      evidenceNote:
        "Manufacturer material supports checking controller family, tooling and lifecycle compatibility before recovery.",
      accessedAt
    }
  ];
}

function roboticsResearchSources(accessedAt: string): ResearchCitation[] {
  return [
    {
      id: randomUUID(),
      title: "Guide for safe design of plant",
      url: "https://www.safeworkaustralia.gov.au/doc/guide-safe-design-plant",
      sourceType: "standards",
      provider: "fixture",
      evidenceNote:
        "Safe Work Australia guidance supports integrating risk controls early in plant design and considering safety across the plant lifecycle.",
      accessedAt
    },
    {
      id: randomUUID(),
      title:
        "ISO 10218-2:2025 — Robotics — Safety requirements — Part 2: Industrial robot applications and robot cells",
      url: "https://www.iso.org/standard/73934.html",
      sourceType: "standards",
      provider: "fixture",
      evidenceNote:
        "The standard identifies safety requirements for industrial robot applications and robot cells.",
      accessedAt
    },
    {
      id: randomUUID(),
      title: "ABB Robotics",
      url: "https://www.abb.com/global/en/areas/robotics",
      sourceType: "manufacturer",
      provider: "fixture",
      evidenceNote:
        "ABB's official robotics portfolio covers industrial robots, controllers, software, application solutions, services and equipment relevant to integration.",
      accessedAt
    }
  ];
}
