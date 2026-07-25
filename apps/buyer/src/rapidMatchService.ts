import type {
  Engagement,
  NeedProfile,
  Supplier,
  SupplierInvitation,
  SupplierMatchStatus,
  SupplierOutreachDelivery,
  SupplierResponse
} from "@veltact/contracts";
import type { BuyerRequirementInput, BuyerWorkspace, PrioritySignal, SupplierMatchView } from "./types";

const runtimeWindow = window as Window & {
  API_BASE_URL?: string;
  FRONTEND_BASE_URL?: string;
};
const API_BASE = runtimeWindow.API_BASE_URL ?? defaultApiBase();
const FRONTEND_BASE = runtimeWindow.FRONTEND_BASE_URL ?? window.location.origin;

type ApiNeedProfile = {
  title: string;
  description: string;
  category: string;
  industry: string;
  location: string;
  urgencyDays?: number;
  budgetAud?: number;
  requiredCapabilities?: string[];
};

type ApiMatch = {
  supplierId: string;
  supplierName: string;
  score: number;
  explanation: string[];
};

type ApiInvitation = {
  id?: string;
  token: string;
  needId: string;
  supplierId: string;
  supplierName?: string;
  status: "invited" | "viewed" | "responded";
  createdAt: string;
  viewedAt?: string;
  respondedAt?: string;
};

type ApiOutreachDelivery = {
  invitationId: string;
  supplierId: string;
  channel: "email" | "sms";
  destination: string;
  deliveryStatus: "not_sent" | "queued" | "sent" | "failed";
  sentAt?: string;
  errorMessage?: string;
};

type ApiNeed = {
  id: string;
  buyerEmail: string;
  profile: ApiNeedProfile;
  createdAt: string;
  matches: ApiMatch[];
  invitations: ApiInvitation[];
  supplierOutreachDeliveries?: ApiOutreachDelivery[];
};

type ApiSupplierResponse = {
  id: string;
  needId: string;
  needProfileId?: string;
  supplierId: string;
  supplierName: string;
  invitationId?: string;
  canHelp?: boolean;
  decision?: "can_help" | "cannot_help";
  earliestAvailability?: string;
  availability?: string;
  indicativePriceAud?: number;
  indicativePrice?: {
    amount: number;
    currency: "AUD";
  };
  relevantExperience: string;
  conditions: string | string[];
  submittedAt: string;
};

type ApiEngagement = {
  id: string;
  needId: string;
  supplierId: string;
  supplierName: string;
  supplierResponseId: string;
  status: Engagement["status"];
  paymentStatus: Engagement["paymentStatus"];
  paymentLinkId?: string;
  hostedCheckoutUrl?: string;
  pinchPayerId?: string;
  pinchPaymentId?: string;
  securedAt?: string;
  createdAt: string;
  updatedAt: string;
};

type ApiNeedResponse = {
  need?: ApiNeed;
  needProfile?: ApiNeed;
};

type ApiResponsesResponse = {
  responses?: ApiSupplierResponse[];
  supplierResponses?: ApiSupplierResponse[];
};

type ApiEngagementResponse = {
  engagement: ApiEngagement;
  hostedCheckoutUrl?: string;
};

type ApiOutreachResponse = {
  need?: ApiNeed;
  needProfile?: ApiNeed;
  supplierOutreachDeliveries?: ApiOutreachDelivery[];
};

export class RapidMatchService {
  private apiNeeds = new Map<string, ApiNeed>();

  async createNeedProfile(input: BuyerRequirementInput): Promise<NeedProfile> {
    const profile: ApiNeedProfile = {
      title: input.title || "Industrial supplier requirement",
      description: input.description,
      category: input.category || inferCategory(input.description),
      industry: "Food manufacturing",
      location: input.location,
      urgencyDays: urgencyDays(input.requiredBy),
      budgetAud: input.budgetAmount || parseBudgetAmount(input.budgetRange),
      requiredCapabilities: input.requiredCapabilities.length
        ? input.requiredCapabilities
        : inferCapabilities(input.description)
    };

    const payload = await requestJson<ApiNeedResponse>("/need-profiles", {
      method: "POST",
      body: {
        buyerEmail: input.contactEmail || "demo.buyer@example.com",
        profile
      }
    });

    const need = payload.need ?? payload.needProfile;
    if (!need) {
      throw new Error("The API did not return a Need Profile.");
    }

    this.apiNeeds.set(need.id, need);
    return mapNeedProfile(need, input);
  }

  async submitPriority(needProfile: NeedProfile, priority: PrioritySignal): Promise<BuyerWorkspace> {
    const need = await this.loadNeed(needProfile.id);
    const responses = await this.loadResponses(need.id);
    return this.toWorkspace(need, needProfile, priority, responses);
  }

  async refreshWorkspace(workspace: BuyerWorkspace, priority: PrioritySignal): Promise<BuyerWorkspace> {
    const need = await this.loadNeed(workspace.needProfile.id);
    const responses = await this.loadResponses(need.id);
    const engagement = workspace.engagement
      ? await this.loadEngagement(workspace.engagement.id)
      : undefined;
    return {
      ...this.toWorkspace(need, workspace.needProfile, priority, responses),
      engagement,
      hostedCheckoutUrl: engagement?.hostedCheckoutUrl ?? workspace.hostedCheckoutUrl
    };
  }

  async sendSupplierOutreach(workspace: BuyerWorkspace, priority: PrioritySignal): Promise<BuyerWorkspace> {
    const payload = await requestJson<ApiOutreachResponse>(
      `/need-profiles/${encodeURIComponent(workspace.needProfile.id)}/invitations/send`,
      {
        method: "POST",
        body: {}
      }
    );
    const need = payload.need ?? payload.needProfile ?? (await this.loadNeed(workspace.needProfile.id));
    const responses = await this.loadResponses(need.id);
    return this.toWorkspace(need, workspace.needProfile, priority, responses, payload.supplierOutreachDeliveries);
  }

  async selectSupplier(workspace: BuyerWorkspace, supplierResponseId: string): Promise<BuyerWorkspace> {
    const payload = await requestJson<ApiEngagementResponse>(
      `/need-profiles/${encodeURIComponent(workspace.needProfile.id)}/engagements`,
      {
        method: "POST",
        body: { supplierResponseId }
      }
    );

    return {
      ...workspace,
      needProfile: { ...workspace.needProfile, status: "selected", updatedAt: payload.engagement.updatedAt },
      engagement: mapEngagement(payload.engagement)
    };
  }

  async createPaymentLink(workspace: BuyerWorkspace): Promise<BuyerWorkspace> {
    if (!workspace.engagement) {
      throw new Error("Create an engagement before starting payment.");
    }

    const payload = await requestJson<ApiEngagementResponse>(
      `/engagements/${encodeURIComponent(workspace.engagement.id)}/payment-link`,
      {
        method: "POST",
        body: {}
      }
    );
    const engagement = mapEngagement(payload.engagement);

    return {
      ...workspace,
      needProfile: {
        ...workspace.needProfile,
        status: engagement.status === "supplier_secured" ? "secured" : "payment_pending",
        updatedAt: engagement.updatedAt
      },
      engagement,
      hostedCheckoutUrl: payload.hostedCheckoutUrl ?? engagement.hostedCheckoutUrl
    };
  }

  async confirmSupplierSecured(workspace: BuyerWorkspace): Promise<BuyerWorkspace> {
    if (!workspace.engagement) {
      throw new Error("Payment cannot be confirmed without an engagement.");
    }

    const engagement = await this.loadEngagement(workspace.engagement.id);

    return {
      ...workspace,
      needProfile: {
        ...workspace.needProfile,
        status: engagement.status === "supplier_secured" ? "secured" : workspace.needProfile.status,
        updatedAt: engagement.updatedAt
      },
      engagement
    };
  }

  async refreshEngagement(workspace: BuyerWorkspace): Promise<BuyerWorkspace> {
    return this.confirmSupplierSecured(workspace);
  }

  async completeDemoPayment(workspace: BuyerWorkspace): Promise<BuyerWorkspace> {
    if (!workspace.engagement) {
      throw new Error("Create an engagement before completing the demo payment.");
    }

    const payload = await requestJson<ApiEngagementResponse>(
      `/engagements/${encodeURIComponent(workspace.engagement.id)}/demo-payment`,
      {
        method: "POST",
        body: {}
      }
    );
    const engagement = mapEngagement(payload.engagement);

    return {
      ...workspace,
      needProfile: {
        ...workspace.needProfile,
        status: "secured",
        updatedAt: engagement.updatedAt
      },
      engagement
    };
  }

  private async loadNeed(needId: string) {
    const payload = await requestJson<{ needProfile: ApiNeed }>(
      `/need-profiles/${encodeURIComponent(needId)}`,
      { method: "GET" }
    );
    this.apiNeeds.set(payload.needProfile.id, payload.needProfile);
    return payload.needProfile;
  }

  private async loadResponses(needId: string) {
    const payload = await requestJson<ApiResponsesResponse>(
      `/need-profiles/${encodeURIComponent(needId)}/responses`,
      { method: "GET" }
    );
    return payload.supplierResponses ?? payload.responses ?? [];
  }

  private async loadEngagement(engagementId: string) {
    const payload = await requestJson<ApiEngagementResponse>(
      `/engagements/${encodeURIComponent(engagementId)}`,
      { method: "GET" }
    );
    return mapEngagement(payload.engagement);
  }

  private toWorkspace(
    need: ApiNeed,
    needProfile: NeedProfile,
    priority: PrioritySignal,
    responses: ApiSupplierResponse[],
    outreachDeliveriesOverride?: ApiOutreachDelivery[]
  ): BuyerWorkspace {
    const suppliers = mapSuppliers(need);
    const responseViews = responses.map((response) => mapSupplierResponse(response, need));
    const matches = mapMatches(need, priority, responseViews);
    return {
      needProfile: {
        ...needProfile,
        status: responseViews.length ? "selection_ready" : "responses_open",
        updatedAt: new Date().toISOString()
      },
      suppliers,
      matches,
      invitations: need.invitations.map((invitation, index) => mapInvitation(invitation, index)),
      outreachDeliveries: (outreachDeliveriesOverride ?? need.supplierOutreachDeliveries ?? []).map(mapOutreachDelivery),
      responses: responseViews
    };
  }
}

async function requestJson<T>(path: string, options: { method: "GET" | "POST"; body?: unknown }): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method,
      headers: options.body === undefined ? undefined : { "content-type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
  } catch {
    throw new Error(
      "Cannot reach the Veltact API. Run `npm run dev` and open http://localhost:4000/."
    );
  }
  const payload = (await response.json()) as T & { message?: string };
  if (!response.ok) {
    throw new Error(payload.message ?? "Veltact API request failed.");
  }
  return payload;
}

function defaultApiBase() {
  if (
    ["localhost", "127.0.0.1"].includes(window.location.hostname) &&
    window.location.port !== "4000"
  ) {
    return "http://localhost:4000/api";
  }
  return `${window.location.origin}/api`;
}

function mapNeedProfile(need: ApiNeed, input: BuyerRequirementInput): NeedProfile {
  return {
    id: need.id,
    companyName: input.companyName || "Demo buyer",
    contactName: input.contactName || undefined,
    contactEmail: input.contactEmail || "demo.buyer@example.com",
    title: need.profile.title,
    description: need.profile.description,
    category: need.profile.category,
    location: need.profile.location,
    priority: "urgent",
    requiredBy: input.requiredBy || availabilityLabel(need.profile.urgencyDays),
    budget:
      need.profile.budgetAud === undefined
        ? undefined
        : { amount: need.profile.budgetAud * 100, currency: "AUD" },
    mustHaves: [
      ...(input.equipmentOrTechnology.length
        ? input.equipmentOrTechnology.map((item) => `Equipment: ${item}`)
        : []),
      ...(need.profile.requiredCapabilities ?? [])
    ],
    niceToHaves: ["Comparable supplier response", "Clear availability and commercial conditions"],
    constraints: [
      need.profile.industry,
      availabilityLabel(need.profile.urgencyDays),
      ...input.constraints
    ].filter(Boolean),
    status: "submitted",
    createdAt: need.createdAt,
    updatedAt: need.createdAt
  };
}

function mapSuppliers(need: ApiNeed): Supplier[] {
  return need.matches.map((match) => ({
    id: match.supplierId,
    companyName: match.supplierName || match.supplierId,
    contactEmail: `${match.supplierId}@veltact-demo.example`,
    categories: [need.profile.category],
    serviceRegions: [need.profile.location],
    capabilities: need.profile.requiredCapabilities ?? [],
    verified: match.score >= 70,
    createdAt: need.createdAt,
    updatedAt: need.createdAt
  }));
}

function mapMatches(
  need: ApiNeed,
  priority: PrioritySignal,
  responses: SupplierResponse[]
): SupplierMatchView[] {
  return need.matches
    .map((match, index) => {
      const supplier = mapSuppliers(need).find((item) => item.id === match.supplierId);
      if (!supplier) {
        throw new Error(`Missing supplier for ${match.supplierId}`);
      }
      const response = responses.find((item) => item.supplierId === match.supplierId);
      const status: SupplierMatchStatus = response ? "responded" : "invited";
      return {
        id: `${need.id}-match-${match.supplierId}`,
        needProfileId: need.id,
        supplierId: match.supplierId,
        score: match.score,
        reasons: match.explanation,
        risks: match.score < 70 ? ["Lower confidence match; review response conditions carefully."] : [],
        status,
        createdAt: need.createdAt,
        updatedAt: response?.updatedAt ?? need.createdAt,
        supplier,
        weightedScore: weightedScore(match.score, priority, index),
        priorityReason: priorityReason(priority, match, response)
      };
    })
    .sort((left, right) => right.weightedScore - left.weightedScore);
}

function mapInvitation(invitation: ApiInvitation, index: number): SupplierInvitation {
  const status = invitation.status === "invited" ? "sent" : invitation.status === "viewed" ? "opened" : "responded";
  const id = invitation.id ?? `${invitation.needId}-invitation-${index + 1}`;
  return {
    id,
    needProfileId: invitation.needId,
    supplierId: invitation.supplierId,
    matchId: `${invitation.needId}-match-${invitation.supplierId}`,
    token: invitation.token,
    responseUrl: `${FRONTEND_BASE}/supplier.html?token=${encodeURIComponent(invitation.token)}`,
    status,
    sentAt: invitation.createdAt,
    expiresAt: new Date(Date.parse(invitation.createdAt) + 3 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: invitation.createdAt,
    updatedAt: invitation.respondedAt ?? invitation.viewedAt ?? invitation.createdAt
  };
}

function mapOutreachDelivery(delivery: ApiOutreachDelivery): SupplierOutreachDelivery {
  return {
    invitationId: delivery.invitationId,
    supplierId: delivery.supplierId,
    channel: delivery.channel,
    destination: delivery.destination,
    deliveryStatus: delivery.deliveryStatus,
    sentAt: delivery.sentAt,
    errorMessage: delivery.errorMessage
  };
}

function mapSupplierResponse(response: ApiSupplierResponse, need: ApiNeed): SupplierResponse {
  const invitation = need.invitations.find((item) => item.supplierId === response.supplierId);
  const canHelp = response.canHelp ?? response.decision === "can_help";
  const availability = response.earliestAvailability ?? response.availability;
  const indicativePrice =
    response.indicativePrice ??
    (response.indicativePriceAud === undefined
      ? undefined
      : { amount: response.indicativePriceAud * 100, currency: "AUD" as const });
  const conditions = Array.isArray(response.conditions)
    ? response.conditions
    : response.conditions
      ? [response.conditions]
      : [];

  return {
    id: response.id,
    needProfileId: response.needId ?? response.needProfileId ?? need.id,
    supplierId: response.supplierId,
    invitationId:
      response.invitationId ??
      (invitation ? `${need.id}-invitation-${need.invitations.indexOf(invitation) + 1}` : response.supplierId),
    decision: canHelp ? "can_help" : "cannot_help",
    availability,
    indicativePrice,
    relevantExperience: response.relevantExperience,
    conditions,
    message: canHelp ? `${response.supplierName ?? "Supplier"} has confirmed commercial intent.` : undefined,
    status: "submitted",
    submittedAt: response.submittedAt,
    createdAt: response.submittedAt,
    updatedAt: response.submittedAt
  };
}

function mapEngagement(engagement: ApiEngagement): Engagement {
  return {
    id: engagement.id,
    needProfileId: engagement.needId,
    supplierId: engagement.supplierId,
    supplierResponseId: engagement.supplierResponseId,
    status: engagement.status,
    paymentStatus: engagement.paymentStatus,
    paymentLinkId: engagement.paymentLinkId,
    hostedCheckoutUrl: engagement.hostedCheckoutUrl,
    pinchPayerId: engagement.pinchPayerId,
    pinchPaymentId: engagement.pinchPaymentId,
    securedAt: engagement.securedAt,
    createdAt: engagement.createdAt,
    updatedAt: engagement.updatedAt
  };
}

function inferCategory(description: string) {
  const normalised = description.toLowerCase();
  if (normalised.includes("plc") || normalised.includes("automation") || normalised.includes("conveyor")) {
    return "Industrial automation";
  }
  return "Industrial services";
}

function inferCapabilities(description: string) {
  const normalised = description.toLowerCase();
  const capabilities = new Set<string>();
  if (normalised.includes("siemens")) capabilities.add("Siemens PLC diagnostics");
  if (normalised.includes("plc")) capabilities.add("PLC diagnostics");
  if (normalised.includes("conveyor")) capabilities.add("Conveyor fault recovery");
  if (normalised.includes("safety")) capabilities.add("Safety circuits");
  capabilities.add("Onsite support");
  return [...capabilities];
}

function urgencyDays(requiredBy: string) {
  const normalised = requiredBy.toLowerCase();
  if (normalised.includes("today") || normalised.includes("immediate")) return 1;
  if (normalised.includes("week")) return 7;
  return undefined;
}

function parseBudgetAmount(budgetRange: string) {
  const match = budgetRange.match(/(\d[\d,]*)/);
  return match ? Number(match[1].replaceAll(",", "")) : undefined;
}

function availabilityLabel(days?: number) {
  if (!days) return "Availability not specified";
  if (days === 1) return "Required today";
  return `Required within ${days} days`;
}

function weightedScore(score: number, priority: PrioritySignal, index: number) {
  const priorityBoost: Record<PrioritySignal, number> = {
    speed: 4,
    technical_fit: 3,
    quality: 2,
    trust: 2,
    price: 1
  };
  return Math.max(0, Math.min(100, score + priorityBoost[priority] - index));
}

function priorityReason(priority: PrioritySignal, match: ApiMatch, response?: SupplierResponse) {
  if (response) {
    return `${match.supplierName} has responded with availability, price and conditions for comparison.`;
  }
  const labels: Record<PrioritySignal, string> = {
    speed: "Ranked for urgent response potential and location fit.",
    technical_fit: "Ranked for capability fit against the Need Profile.",
    quality: "Ranked for relevant industrial evidence and match strength.",
    trust: "Ranked for confidence signals in the supplier match.",
    price: "Ranked for likely commercial fit against the stated budget."
  };
  return labels[priority];
}
