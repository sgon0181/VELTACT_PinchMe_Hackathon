import type { SupplierClaim } from "@veltact/contracts";
import type {
  NeedRecord,
  SupplierInvitation,
  SupplierResponse
} from "../marketplace/types.js";
import { renderTextPdf } from "./pdfDocument.js";

export type SupplierDocumentContext = {
  invitation: SupplierInvitation;
  need: NeedRecord;
  claim?: SupplierClaim;
  response?: SupplierResponse;
  matchReasons: string[];
  sourceDisclosure: string;
};

export type SupplierPdfDocument = {
  body: Buffer;
  filename: string;
};

export function buildSupplierRfqPdf(
  context: SupplierDocumentContext
): SupplierPdfDocument {
  const profile = context.need.profile;
  return {
    filename: `${slug(profile.title)}-rfq.pdf`,
    body: renderTextPdf({
      title: profile.title,
      subtitle: "Private request for quote",
      reference: context.invitation.id,
      sections: [
        {
          heading: "Requirement",
          lines: [
            profile.description,
            `Location: ${profile.location}`,
            `Urgency: ${
              profile.urgencyDays
                ? `${profile.urgencyDays} day(s)`
                : "Not specified"
            }`,
            `Indicative budget: ${
              profile.budgetAud
                ? money(profile.budgetAud)
                : "Not supplied"
            }`,
            `Respond by: ${formatDateTime(context.invitation.expiresAt)}`
          ]
        },
        {
          heading: "Required capabilities",
          lines: listOrFallback(
            profile.requiredCapabilities,
            "No required capabilities supplied."
          )
        },
        {
          heading: "Why this supplier matched",
          lines: listOrFallback(
            context.matchReasons,
            "Matched to the requirement category and service location."
          )
        },
        {
          heading: "Source disclosure",
          lines: [context.sourceDisclosure]
        },
        {
          heading: "Requested response",
          lines: [
            "Confirm company and contact details.",
            "State whether the supplier can help.",
            "Provide earliest availability and a positive indicative price.",
            "Provide relevant experience, proposed approach, assumptions and conditions."
          ]
        }
      ],
      footer:
        "This RFQ is decision-support material, not engineering sign-off. The private invitation authorises one supplier response and does not create a Veltact account."
    })
  };
}

export function buildSupplierQuotePdf(
  context: SupplierDocumentContext
): SupplierPdfDocument {
  if (!context.response) {
    throw new Error("A submitted supplier response is required.");
  }
  const response = context.response;
  const canHelp = response.decision === "can_help";
  const contact = [
    context.claim?.claimantName,
    context.claim?.claimantEmail
  ]
    .filter(Boolean)
    .join(" / ");

  return {
    filename: `${slug(context.invitation.supplierName)}-quote-summary.pdf`,
    body: renderTextPdf({
      title: context.need.profile.title,
      subtitle: "Supplier quote summary",
      reference: response.id,
      sections: [
        {
          heading: "Supplier response",
          lines: [
            `Supplier: ${context.invitation.supplierName}`,
            `Contact: ${contact || "Confirmed through private invitation"}`,
            `Decision: ${canHelp ? "Can help" : "Cannot help"}`,
            `Submitted: ${formatDateTime(response.submittedAt)}`
          ]
        },
        {
          heading: "Commercial summary",
          lines: canHelp
            ? [
                `Earliest availability: ${response.earliestAvailability}`,
                `Indicative price: ${money(response.indicativePriceAud)}`
              ]
            : ["Availability: Not applicable", "Indicative price: Not supplied"]
        },
        {
          heading: "Relevant experience",
          lines: [response.relevantExperience]
        },
        {
          heading: "Proposed approach",
          lines: [
            response.proposedApproach || "No proposed approach supplied."
          ]
        },
        {
          heading: "Assumptions",
          lines: listOrFallback(
            response.assumptions,
            "No assumptions supplied."
          )
        },
        {
          heading: "Conditions",
          lines: listOrFallback(
            response.conditions,
            "No conditions supplied."
          )
        }
      ],
      footer:
        "This summary records indicative supplier intent submitted through Veltact. It is not a purchase order, supplier payout notice or evidence that engineering work has started."
    })
  };
}

function listOrFallback(
  values: readonly string[] | undefined,
  fallback: string
) {
  return values?.length
    ? values.map((value) => `- ${value}`)
    : [fallback];
}

function money(amountAud: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0
  }).format(amountAud);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Sydney"
  }).format(new Date(value));
}

function slug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64) || "veltact-supplier"
  );
}
