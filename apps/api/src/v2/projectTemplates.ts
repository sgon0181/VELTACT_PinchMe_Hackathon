import { randomUUID } from "node:crypto";
import type {
  IndustrialProject,
  MarketplaceNeedProfile,
  ProjectMilestone,
  ProjectTask,
  SupplierCommercialResponse,
  SupplierProfile
} from "@veltact/contracts";
import { inferDemoScenario } from "./fixtures.js";

export function createIndustrialProject(input: {
  needProfileId: string;
  profile: MarketplaceNeedProfile;
  supplierLeadId: string;
  supplierProfile: SupplierProfile;
  supplierResponse: Extract<
    SupplierCommercialResponse,
    { decision: "can_help" }
  >;
  buyerName: string;
  buyerEmail: string;
  currentTime?: Date;
}): IndustrialProject {
  const currentTime = input.currentTime ?? new Date();
  const scenario = inferDemoScenario(input.profile);
  const projectId = randomUUID();
  const templateType =
    scenario === "robotics"
      ? "planned_robotic_arm_integration"
      : "urgent_plc_recovery";
  const milestoneInputs =
    scenario === "robotics"
      ? [
          {
            title: "Feasibility and safety concept",
            description:
              "Confirm process, layout, cycle-time, payload, tooling and machinery-safety requirements.",
            amount: 750_000,
            durationDays: 10,
            criteria: [
              "Agreed user requirement specification",
              "Concept layout and safety assumptions reviewed",
              "Budget and delivery basis confirmed"
            ]
          },
          {
            title: "Proof of process and detailed design",
            description:
              "Resolve high-risk tooling, sensing and integration assumptions before fabrication.",
            amount: 1_500_000,
            durationDays: 20,
            criteria: [
              "Representative process trial evidence supplied",
              "Detailed design review completed",
              "Factory acceptance test plan approved"
            ]
          },
          {
            title: "Build and factory acceptance",
            description:
              "Build the cell and demonstrate the agreed factory acceptance tests before shipment.",
            amount: 3_000_000,
            durationDays: 35,
            criteria: [
              "Factory acceptance tests passed",
              "Safety-system validation evidence supplied",
              "Site readiness checklist accepted"
            ]
          },
          {
            title: "Installation, commissioning and handover",
            description:
              "Install, commission, validate production performance and transfer operating knowledge.",
            amount: 2_250_000,
            durationDays: 15,
            criteria: [
              "Site acceptance tests passed",
              "Operators and maintenance team trained",
              "As-built files and recovery backups handed over"
            ]
          }
        ]
      : [
          {
            title: "Diagnosis and recovery plan",
            description:
              "Review safely captured evidence, verify backups and agree the controlled recovery plan.",
            amount: 150_000,
            durationDays: 1,
            criteria: [
              "Fault evidence and recent changes documented",
              "Backup provenance checked",
              "Authorised recovery plan approved"
            ]
          },
          {
            title: "Controlled recovery",
            description:
              "Execute the approved restoration work and return the line to a controlled operating state.",
            amount: 350_000,
            durationDays: 1,
            criteria: [
              "Approved controls baseline restored or repaired",
              "Safety functions checked by authorised personnel",
              "Production restart approved by the site owner"
            ]
          },
          {
            title: "Validation and recurrence prevention",
            description:
              "Validate production, preserve the final baseline and agree actions that reduce repeat downtime.",
            amount: 200_000,
            durationDays: 3,
            criteria: [
              "Production validation evidence accepted",
              "Final backup and configuration handed over",
              "Incident review and prevention actions recorded"
            ]
          }
        ];

  let cursor = new Date(currentTime);
  const milestones: ProjectMilestone[] = milestoneInputs.map((milestone, index) => {
    const id = randomUUID();
    const start = dateOnly(cursor);
    cursor = addDays(cursor, milestone.durationDays);
    return {
      id,
      projectId,
      sequence: index + 1,
      title: milestone.title,
      description: milestone.description,
      amount: {
        amount:
          index === 0 && input.supplierResponse.indicativePrice.amount > 0
            ? Math.min(
                milestone.amount,
                input.supplierResponse.indicativePrice.amount
              )
            : milestone.amount,
        currency: "AUD"
      },
      plannedStart: start,
      plannedEnd: dateOnly(cursor),
      dependencyIds: index === 0 ? [] : [],
      acceptanceCriteria: milestone.criteria.map((description) => ({
        id: randomUUID(),
        description,
        accepted: false
      })),
      status: index === 0 ? "awaiting_payment" : "draft",
      paymentStatus: "not_started",
      updatedAt: currentTime.toISOString()
    };
  });
  for (let index = 1; index < milestones.length; index += 1) {
    milestones[index].dependencyIds = [milestones[index - 1].id];
  }

  const tasks: ProjectTask[] = milestones.flatMap((milestone, index) => [
    {
      id: randomUUID(),
      projectId,
      milestoneId: milestone.id,
      title: `Prepare ${milestone.title.toLowerCase()}`,
      owner: index === 0 ? input.supplierProfile.companyName : "Joint project team",
      status: index === 0 ? "in_progress" : "not_started",
      dependencyIds:
        index === 0 ? [] : [milestones[index - 1].id],
      dueDate: milestone.plannedEnd,
      updatedAt: currentTime.toISOString()
    },
    {
      id: randomUUID(),
      projectId,
      milestoneId: milestone.id,
      title: `Review evidence for ${milestone.title.toLowerCase()}`,
      owner: input.buyerName,
      status: "not_started",
      dependencyIds: [],
      dueDate: milestone.plannedEnd,
      updatedAt: currentTime.toISOString()
    }
  ]);

  return {
    id: projectId,
    needProfileId: input.needProfileId,
    supplierLeadId: input.supplierLeadId,
    supplierProfileId: input.supplierProfile.id,
    supplierName: input.supplierProfile.companyName,
    templateType,
    title:
      scenario === "robotics"
        ? `${input.profile.title} - integration project`
        : `${input.profile.title} - recovery project`,
    objective: input.profile.description,
    siteLocation: input.profile.location,
    status: "active",
    targetCompletion: milestones.at(-1)?.plannedEnd,
    milestones,
    tasks,
    contacts: [
      {
        id: randomUUID(),
        projectId,
        name: input.buyerName,
        role: "Buyer project owner",
        organisation: "Buyer",
        email: input.buyerEmail
      },
      {
        id: randomUUID(),
        projectId,
        name: input.supplierProfile.contactName,
        role: "Supplier delivery lead",
        organisation: input.supplierProfile.companyName,
        email: input.supplierProfile.contactEmail,
        phone: input.supplierProfile.contactPhone
      }
    ],
    activities: [
      {
        id: randomUUID(),
        projectId,
        eventType: "project.created",
        summary: `Project created from the selected ${input.supplierProfile.companyName} response.`,
        actor: "Veltact",
        occurredAt: currentTime.toISOString()
      }
    ],
    risks:
      scenario === "robotics"
        ? [
            {
              id: randomUUID(),
              projectId,
              title: "Production interface assumptions remain unverified",
              impact: "high",
              mitigation:
                "Resolve utilities, controls interfaces and shutdown windows during detailed design.",
              status: "open",
              updatedAt: currentTime.toISOString()
            }
          ]
        : [
            {
              id: randomUUID(),
              projectId,
              title: "Visible PLC fault may be caused by another subsystem",
              impact: "high",
              mitigation:
                "Preserve evidence and include network, drive, safety and field I/O checks in triage.",
              status: "open",
              updatedAt: currentTime.toISOString()
            }
          ],
    issues: [],
    approvals: [
      {
        id: randomUUID(),
        projectId,
        milestoneId: milestones[0].id,
        title: `Approve ${milestones[0].title.toLowerCase()} scope`,
        status: "requested",
        requestedBy: input.supplierProfile.companyName,
        updatedAt: currentTime.toISOString()
      }
    ],
    documents: [
      {
        id: randomUUID(),
        projectId,
        title: "Demonstration scope summary",
        documentType: "scope",
        url: "https://veltact.example/demo-scope",
        provenance: "veltact_fixture",
        addedAt: currentTime.toISOString()
      }
    ],
    changeRequests: [],
    createdAt: currentTime.toISOString(),
    updatedAt: currentTime.toISOString()
  };
}

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}
