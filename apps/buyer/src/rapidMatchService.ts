import {
  deploymentSummarySchema,
  rapidMatchApiRoute,
  rapidMatchBuyerWorkspaceSchema,
  solutionDecisionSchema,
  solutionResearchResultSchema,
  supplierResponseSchema,
  type DeploymentMilestoneStatus,
  type DeploymentSummary,
  type Engagement,
  type IntakeEvidenceSummary,
  type MarketplaceNeedProfile,
  type NeedProfile,
  type RapidMatchBuyerWorkspace,
  type SendSupplierInvitationsRequest,
  type SolutionDecision,
  type SolutionDecisionType,
  type SolutionResearchResult,
  type Supplier,
  type SupplierInvitation,
  type SupplierMatch,
  type SupplierOutreachDelivery,
  type SupplierResponse
} from "@veltact/contracts";
import { apiBaseUrl } from "./apiBase.js";
import type { BuyerRequirementInput, PrioritySignal } from "./types.js";
import { parseUrgencyDays } from "./urgency.js";

const runtimeWindow = window as Window & {
  FRONTEND_BASE_URL?: string;
};
const API_BASE = apiBaseUrl();
const FRONTEND_BASE = runtimeWindow.FRONTEND_BASE_URL ?? window.location.origin;

type LegacyNeedRecord = {
  id: string;
  buyerEmail: string;
  profile: MarketplaceNeedProfile;
  createdAt: string;
  updatedAt?: string;
  status?: string;
  needProfile?: NeedProfile;
  supplierMatches?: SupplierMatch[];
  supplierInvitations?: SupplierInvitation[];
  supplierOutreachDeliveries?: SupplierOutreachDelivery[];
  suppliers?: Supplier[];
};

type NeedEnvelope = {
  workspace?: RapidMatchBuyerWorkspace;
  buyerWorkspace?: RapidMatchBuyerWorkspace;
  need?: LegacyNeedRecord;
  needProfile?: LegacyNeedRecord;
  buyerAccessToken?: string;
};

type EngagementEnvelope = {
  workspace?: RapidMatchBuyerWorkspace;
  buyerWorkspace?: RapidMatchBuyerWorkspace;
  engagement?: Engagement;
  hostedCheckoutUrl?: string;
  deployment?: DeploymentSummary;
};

type ResearchEnvelope = {
  workspace?: RapidMatchBuyerWorkspace;
  buyerWorkspace?: RapidMatchBuyerWorkspace;
  researchResult?: SolutionResearchResult;
};

type DecisionEnvelope = {
  workspace?: RapidMatchBuyerWorkspace;
  buyerWorkspace?: RapidMatchBuyerWorkspace;
  solutionDecision?: SolutionDecision;
};

export type CreatedBuyerWorkspace = {
  workspace: RapidMatchBuyerWorkspace;
  buyerAccessToken?: string;
};

export type DownloadedNeedReport = {
  blob: Blob;
  fileName: string;
};

export class RapidMatchService {
  private readonly buyerAccessTokens = new Map<string, string>();
  private readonly marketplaceProfiles = new Map<string, MarketplaceNeedProfile>();

  setBuyerAccessToken(needProfileId: string, token: string) {
    if (token) {
      this.buyerAccessTokens.set(needProfileId, token);
    }
  }

  buyerAccessTokenForNeed(needProfileId: string) {
    return this.buyerAccessTokens.get(needProfileId);
  }

  async createNeedProfile(
    input: BuyerRequirementInput,
    priority: PrioritySignal,
    evidence: IntakeEvidenceSummary[]
  ): Promise<CreatedBuyerWorkspace> {
    const profile = requirementToMarketplaceProfile(input, priority);
    const payload = await requestJson<NeedEnvelope>(rapidMatchApiRoute.createNeedProfile, {
      method: "POST",
      body: {
        buyerEmail: input.contactEmail || "demo.buyer@example.com",
        profile
      }
    });
    const need = payload.need ?? payload.needProfile;
    const canonical = canonicalWorkspaceFrom(payload);
    if (!need && !canonical?.needProfile) {
      throw new Error("The API did not return a Need Profile.");
    }

    const needProfileId = canonical?.needProfile?.id ?? need?.id;
    if (!needProfileId) {
      throw new Error("The API returned a Need Profile without an ID.");
    }
    if (payload.buyerAccessToken) {
      this.setBuyerAccessToken(needProfileId, payload.buyerAccessToken);
    }
    this.marketplaceProfiles.set(needProfileId, profile);

    const workspace =
      canonical ??
      legacyWorkspace(need as LegacyNeedRecord, {
        phase: "find",
        status: "need_profile_review",
        nextAction: "confirm_need_profile",
        intakeEvidence: evidence
      });

    return {
      buyerAccessToken: payload.buyerAccessToken,
      workspace: {
        ...workspace,
        phase: "find",
        status: "need_profile_review",
        nextAction: "confirm_need_profile",
        intakeEvidence: evidence
      }
    };
  }

  async restoreWorkspace(
    needProfileId: string,
    current?: Partial<RapidMatchBuyerWorkspace>,
    engagementId?: string
  ): Promise<RapidMatchBuyerWorkspace> {
    const payload = await requestJson<NeedEnvelope>(
      routeFor(rapidMatchApiRoute.needWorkspace, { needProfileId }),
      {
        method: "GET",
        buyerAccessToken: this.buyerAccessTokens.get(needProfileId)
      }
    );
    const need = payload.need ?? payload.needProfile;
    if (need?.profile) {
      this.marketplaceProfiles.set(needProfileId, need.profile);
    }

    const canonical = canonicalWorkspaceFrom(payload);
    let workspace = canonical
      ? {
          ...canonical,
          intakeEvidence:
            canonical.intakeEvidence.length
              ? canonical.intakeEvidence
              : current?.intakeEvidence ?? [],
          researchResult:
            canonical.researchResult ?? current?.researchResult,
          solutionDecision:
            canonical.solutionDecision ?? current?.solutionDecision,
          engagement:
            canonical.engagement ?? current?.engagement,
          deployment:
            canonical.deployment ?? current?.deployment
        }
      : need
        ? legacyWorkspace(need, current)
        : undefined;
    if (!workspace) {
      throw new Error("The API did not return the buyer workspace.");
    }

    workspace = await this.loadResponses(workspace);

    if (workspace.engagement?.id || engagementId) {
      workspace = await this.loadEngagement(
        workspace,
        workspace.engagement?.id ?? engagementId as string
      );
    }

    return reconcileWorkspace(workspace);
  }

  async researchRequirement(
    workspace: RapidMatchBuyerWorkspace
  ): Promise<RapidMatchBuyerWorkspace> {
    const needProfile = requiredNeedProfile(workspace);
    try {
      const payload = await requestJson<ResearchEnvelope>(
        routeFor(rapidMatchApiRoute.research, {
          needProfileId: needProfile.id
        }),
        {
          method: "POST",
          body: {},
          buyerAccessToken: this.buyerAccessTokens.get(needProfile.id)
        }
      );
      const canonical = canonicalWorkspaceFrom(payload);
      const researchResult =
        canonical?.researchResult ??
        parseResearch(payload.researchResult);
      if (!researchResult) {
        throw new Error("Research completed without a structured result.");
      }
      return {
        ...(canonical ?? workspace),
        phase: "find",
        status: "solution_review",
        nextAction: "find_specialist",
        researchResult
      };
    } catch (error) {
      if (!isUnavailableRoute(error)) throw error;
      const profile =
        this.marketplaceProfiles.get(needProfile.id) ??
        marketplaceProfileFromNeed(needProfile);
      return {
        ...workspace,
        phase: "find",
        status: "solution_review",
        nextAction: "find_specialist",
        researchResult: fixtureResearch(needProfile.id, profile)
      };
    }
  }

  async recordSolutionDecision(
    workspace: RapidMatchBuyerWorkspace,
    decision: Extract<SolutionDecisionType, "local_trial" | "outsource">,
    selectedApproachId: string
  ): Promise<RapidMatchBuyerWorkspace> {
    const needProfile = requiredNeedProfile(workspace);
    const research = workspace.researchResult;
    if (!research) {
      throw new Error("Analyse the requirement before choosing an outcome.");
    }
    if (
      !research.approaches.some(
        (approach) => approach.id === selectedApproachId
      )
    ) {
      throw new Error("Select one pathway from the current research result.");
    }
    const selectedApproachIds = [selectedApproachId];

    try {
      const payload = await requestJson<DecisionEnvelope>(
        routeFor(rapidMatchApiRoute.solutionDecision, {
          needProfileId: needProfile.id
        }),
        {
          method: "POST",
          body: {
            decision,
            selectedApproachIds,
            approvedBy: needProfile.contactName ?? "Buyer"
          },
          buyerAccessToken: this.buyerAccessTokens.get(needProfile.id)
        }
      );
      const canonical = canonicalWorkspaceFrom(payload);
      const solutionDecision =
        canonical?.solutionDecision ??
        parseDecision(payload.solutionDecision);
      if (!solutionDecision) {
        throw new Error("The API did not return the solution decision.");
      }
      return decisionWorkspace(canonical ?? workspace, solutionDecision);
    } catch (error) {
      if (!isUnavailableRoute(error)) throw error;
      return decisionWorkspace(
        workspace,
        fixtureDecision(workspace, decision, selectedApproachId)
      );
    }
  }

  async downloadNeedReport(
    workspace: RapidMatchBuyerWorkspace,
    selectedApproachId: string
  ): Promise<DownloadedNeedReport> {
    const needProfile = requiredNeedProfile(workspace);
    const reportRoute = routeFor(rapidMatchApiRoute.needReportPdf, {
      needProfileId: needProfile.id
    });
    const response = await requestFile(
      `${reportRoute}?selectedApproachId=${encodeURIComponent(
        selectedApproachId
      )}`,
      this.buyerAccessTokens.get(needProfile.id)
    );
    const contentType = response.headers.get("content-type")?.toLowerCase();
    if (!contentType?.includes("application/pdf")) {
      throw new Error("The report API did not return a PDF.");
    }
    return {
      blob: await response.blob(),
      fileName:
        fileNameFromDisposition(response.headers.get("content-disposition")) ??
        `veltact-need-profile-${needProfile.id}.pdf`
    };
  }

  async discoverSuppliers(
    workspace: RapidMatchBuyerWorkspace
  ): Promise<RapidMatchBuyerWorkspace> {
    const needProfile = requiredNeedProfile(workspace);
    try {
      const payload = await requestJson<unknown>(
        routeFor(rapidMatchApiRoute.discoverSuppliers, {
          needProfileId: needProfile.id
        }),
        {
          method: "POST",
          body: {},
          buyerAccessToken: this.buyerAccessTokens.get(needProfile.id)
        }
      );
      const canonical = canonicalWorkspaceFrom(payload);
      if (canonical) {
        return {
          ...canonical,
          phase: "connect",
          status: "supplier_outreach",
          nextAction: "approve_outreach"
        };
      }
      return this.restoreWorkspace(needProfile.id, {
        ...workspace,
        phase: "connect",
        status: "supplier_outreach",
        nextAction: "approve_outreach"
      });
    } catch (error) {
      if (!isUnavailableRoute(error)) throw error;
      const restored = await this.restoreWorkspace(needProfile.id, workspace);
      return {
        ...restored,
        phase: "connect",
        status: "supplier_outreach",
        nextAction: "approve_outreach"
      };
    }
  }

  async sendSupplierOutreach(
    workspace: RapidMatchBuyerWorkspace,
    supplierLeadIds: string[],
    deliveryChannels: SendSupplierInvitationsRequest["deliveryChannels"]
  ): Promise<RapidMatchBuyerWorkspace> {
    const needProfile = requiredNeedProfile(workspace);
    const body: SendSupplierInvitationsRequest = {
      supplierLeadIds,
      deliveryChannels
    };
    await requestJson(
      routeFor(rapidMatchApiRoute.sendInvitations, {
        needProfileId: needProfile.id
      }),
      {
        method: "POST",
        body,
        buyerAccessToken: this.buyerAccessTokens.get(needProfile.id)
      }
    );
    const restored = await this.restoreWorkspace(needProfile.id, workspace);
    return {
      ...restored,
      phase: "connect",
      status: restored.responses.length ? "supplier_responses" : "supplier_outreach",
      nextAction: restored.responses.length ? "compare_responses" : "await_responses"
    };
  }

  async refreshWorkspace(
    workspace: RapidMatchBuyerWorkspace
  ): Promise<RapidMatchBuyerWorkspace> {
    const needProfile = requiredNeedProfile(workspace);
    return this.restoreWorkspace(
      needProfile.id,
      workspace,
      workspace.engagement?.id
    );
  }

  async selectSupplier(
    workspace: RapidMatchBuyerWorkspace,
    supplierResponseId: string
  ): Promise<RapidMatchBuyerWorkspace> {
    const needProfile = requiredNeedProfile(workspace);
    const payload = await requestJson<EngagementEnvelope>(
      routeFor(rapidMatchApiRoute.createEngagement, {
        needProfileId: needProfile.id
      }),
      {
        method: "POST",
        body: { supplierResponseId },
        buyerAccessToken: this.buyerAccessTokens.get(needProfile.id)
      }
    );
    const canonical = canonicalWorkspaceFrom(payload);
    const engagement = canonical?.engagement ?? payload.engagement;
    if (!engagement) {
      throw new Error("The API did not create a supplier engagement.");
    }
    return {
      ...(canonical ?? workspace),
      phase: "deploy",
      status: "commitment_pending",
      nextAction: "open_pinch_checkout",
      engagement
    };
  }

  async createPaymentLink(
    workspace: RapidMatchBuyerWorkspace
  ): Promise<RapidMatchBuyerWorkspace> {
    const needProfile = requiredNeedProfile(workspace);
    const engagement = requiredEngagement(workspace);
    const payload = await requestJson<EngagementEnvelope>(
      routeFor(rapidMatchApiRoute.paymentLink, {
        engagementId: engagement.id
      }),
      {
        method: "POST",
        body: {},
        buyerAccessToken: this.buyerAccessTokens.get(needProfile.id)
      }
    );
    const nextEngagement: Engagement = {
      ...(payload.engagement ?? engagement),
      hostedCheckoutUrl:
        payload.hostedCheckoutUrl ??
        payload.engagement?.hostedCheckoutUrl ??
        engagement.hostedCheckoutUrl
    };
    let next: RapidMatchBuyerWorkspace = {
      ...workspace,
      phase: "deploy" as const,
      status: "commitment_pending" as const,
      nextAction: "await_payment_confirmation" as const,
      engagement: nextEngagement
    };
    next = await this.loadDeployment(next);
    return next;
  }

  async refreshEngagement(
    workspace: RapidMatchBuyerWorkspace
  ): Promise<RapidMatchBuyerWorkspace> {
    const engagement = requiredEngagement(workspace);
    return this.loadEngagement(workspace, engagement.id);
  }

  async updateDeploymentMilestone(
    workspace: RapidMatchBuyerWorkspace,
    milestoneId: string,
    status: Extract<
      DeploymentMilestoneStatus,
      "in_progress" | "completed"
    >,
    latestUpdate: string
  ): Promise<RapidMatchBuyerWorkspace> {
    const needProfile = requiredNeedProfile(workspace);
    const engagement = requiredEngagement(workspace);
    const payload = await requestJson<unknown>(
      routeFor(rapidMatchApiRoute.deploymentMilestone, {
        engagementId: engagement.id,
        milestoneId
      }),
      {
        method: "PATCH",
        body: { status, latestUpdate },
        buyerAccessToken: this.buyerAccessTokens.get(needProfile.id)
      }
    );
    const canonical = canonicalWorkspaceFrom(payload);
    const deployment =
      canonical?.deployment ??
      parseDeployment(
        isRecord(payload) ? payload.deployment : undefined
      ) ??
      parseDeployment(payload);
    if (!deployment) {
      throw new Error("The API did not return the updated deployment.");
    }
    return reconcileWorkspace({
      ...(canonical ?? workspace),
      deployment
    });
  }

  async completeDemoPayment(
    workspace: RapidMatchBuyerWorkspace
  ): Promise<RapidMatchBuyerWorkspace> {
    const needProfile = requiredNeedProfile(workspace);
    const engagement = requiredEngagement(workspace);
    const payload = await requestJson<EngagementEnvelope>(
      `/api/engagements/${encodeURIComponent(engagement.id)}/demo-payment`,
      {
        method: "POST",
        body: {},
        buyerAccessToken: this.buyerAccessTokens.get(needProfile.id)
      }
    );
    if (!payload.engagement) {
      throw new Error("The local demo did not return payment evidence.");
    }
    return this.loadDeployment({
      ...workspace,
      phase: "deploy",
      status: "supplier_secured",
      nextAction: "track_delivery",
      engagement: payload.engagement
    });
  }

  private async loadResponses(
    workspace: RapidMatchBuyerWorkspace
  ): Promise<RapidMatchBuyerWorkspace> {
    const needProfile = requiredNeedProfile(workspace);
    try {
      const payload = await requestJson<{
        supplierResponses?: unknown[];
        responses?: unknown[];
      }>(
        routeFor(rapidMatchApiRoute.responses, {
          needProfileId: needProfile.id
        }),
        {
          method: "GET",
          buyerAccessToken: this.buyerAccessTokens.get(needProfile.id)
        }
      );
      const responsePayload = payload.supplierResponses ?? payload.responses ?? [];
      const responses = responsePayload.flatMap((item) => {
        const parsed = supplierResponseSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      });
      return {
        ...workspace,
        responses
      };
    } catch (error) {
      if (!isUnavailableRoute(error)) throw error;
      return workspace;
    }
  }

  private async loadEngagement(
    workspace: RapidMatchBuyerWorkspace,
    engagementId: string
  ): Promise<RapidMatchBuyerWorkspace> {
    const needProfile = requiredNeedProfile(workspace);
    const payload = await requestJson<EngagementEnvelope>(
      routeFor(rapidMatchApiRoute.engagement, { engagementId }),
      {
        method: "GET",
        buyerAccessToken: this.buyerAccessTokens.get(needProfile.id)
      }
    );
    const canonical = canonicalWorkspaceFrom(payload);
    const engagement = canonical?.engagement ?? payload.engagement;
    if (!engagement) {
      throw new Error("The API did not return the supplier engagement.");
    }
    return this.loadDeployment(
      reconcileWorkspace({
        ...(canonical ?? workspace),
        engagement
      })
    );
  }

  private async loadDeployment(
    workspace: RapidMatchBuyerWorkspace
  ): Promise<RapidMatchBuyerWorkspace> {
    const engagement = workspace.engagement;
    if (!engagement) return workspace;
    const needProfile = requiredNeedProfile(workspace);
    try {
      const payload = await requestJson<unknown>(
        routeFor(rapidMatchApiRoute.deployment, {
          engagementId: engagement.id
        }),
        {
          method: "GET",
          buyerAccessToken: this.buyerAccessTokens.get(needProfile.id)
        }
      );
      const canonical = canonicalWorkspaceFrom(payload);
      const deployment =
        canonical?.deployment ??
        parseDeployment(
          isRecord(payload) ? payload.deployment : undefined
        ) ??
        parseDeployment(payload);
      return {
        ...(canonical ?? workspace),
        deployment
      };
    } catch (error) {
      if (!isUnavailableRoute(error)) throw error;
      return {
        ...workspace,
        deployment: fixtureDeployment(workspace)
      };
    }
  }
}

async function requestJson<T = unknown>(
  route: string,
  options: {
    method: "GET" | "POST" | "PATCH";
    body?: unknown;
    buyerAccessToken?: string;
  }
): Promise<T> {
  let response: Response;
  try {
    const headers = new Headers();
    if (options.body !== undefined) {
      headers.set("content-type", "application/json");
    }
    if (options.buyerAccessToken) {
      headers.set("x-veltact-buyer-token", options.buyerAccessToken);
    }
    response = await fetch(canonicalApiUrl(route), {
      method: options.method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
  } catch {
    throw new Error(
      "Cannot reach the Veltact API. Start the API and retry this buyer action."
    );
  }
  const payload = (await response.json().catch(() => ({}))) as T & {
    message?: string;
  };
  if (!response.ok) {
    throw new ApiRequestError(
      response.status,
      payload.message ?? `Veltact API request failed (${response.status}).`
    );
  }
  return payload;
}

async function requestFile(
  route: string,
  buyerAccessToken?: string
): Promise<Response> {
  let response: Response;
  try {
    const headers = new Headers();
    if (buyerAccessToken) {
      headers.set("x-veltact-buyer-token", buyerAccessToken);
    }
    response = await fetch(canonicalApiUrl(route), {
      method: "GET",
      headers
    });
  } catch {
    throw new Error(
      "Cannot reach the Veltact API. Start the API and retry this buyer action."
    );
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new ApiRequestError(
      response.status,
      payload.message ?? `Veltact report request failed (${response.status}).`
    );
  }
  return response;
}

class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

function fileNameFromDisposition(value: string | null) {
  if (!value) return undefined;
  const encoded = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded).replaceAll(/[/\\]/g, "-");
    } catch {
      return encoded.replaceAll(/[/\\]/g, "-");
    }
  }
  const plain = value.match(/filename="?([^";]+)"?/i)?.[1];
  return plain?.replaceAll(/[/\\]/g, "-");
}

function isUnavailableRoute(error: unknown) {
  return (
    error instanceof ApiRequestError &&
    [404, 405, 501].includes(error.status)
  );
}

function canonicalApiUrl(route: string) {
  const base = API_BASE.replace(/\/$/, "");
  return base.endsWith("/api") ? `${base}${route.slice(4)}` : `${base}${route}`;
}

function routeFor(
  template: string,
  values: Record<string, string>
) {
  return Object.entries(values).reduce(
    (route, [key, value]) =>
      route.replace(`:${key}`, encodeURIComponent(value)),
    template
  );
}

function canonicalWorkspaceFrom(value: unknown) {
  const candidates = [
    value,
    isRecord(value) ? value.workspace : undefined,
    isRecord(value) ? value.buyerWorkspace : undefined
  ];
  for (const candidate of candidates) {
    const parsed = rapidMatchBuyerWorkspaceSchema.safeParse(candidate);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}

function legacyWorkspace(
  need: LegacyNeedRecord,
  current: Partial<RapidMatchBuyerWorkspace> = {}
): RapidMatchBuyerWorkspace {
  const needProfile =
    need.needProfile ??
    legacyNeedProfile(need);
  const responses = current.responses ?? [];
  const invitations = need.supplierInvitations ?? [];
  return {
    phase: current.phase ?? "find",
    status: current.status ?? "need_profile_review",
    nextAction: current.nextAction ?? "confirm_need_profile",
    needProfile,
    intakeEvidence: current.intakeEvidence ?? [],
    researchResult: current.researchResult,
    solutionDecision: current.solutionDecision,
    discoveredSuppliers: current.discoveredSuppliers ?? [],
    suppliers: need.suppliers ?? current.suppliers ?? [],
    matches: need.supplierMatches ?? current.matches ?? [],
    invitations: invitations.map((invitation) => ({
      ...invitation,
      responseUrl:
        invitation.responseUrl ||
        `${FRONTEND_BASE}/supplier.html?token=${encodeURIComponent(invitation.token)}`
    })),
    outreachDeliveries:
      need.supplierOutreachDeliveries ??
      current.outreachDeliveries ??
      [],
    responses,
    engagement: current.engagement,
    deployment: current.deployment
  };
}

function legacyNeedProfile(need: LegacyNeedRecord): NeedProfile {
  const profile = need.profile;
  const createdAt = need.createdAt;
  return {
    id: need.id,
    companyName: companyNameFromEmail(need.buyerEmail),
    contactEmail: need.buyerEmail,
    title: profile.title,
    description: profile.problemSummary ?? profile.description,
    category: profile.category,
    location: profile.location,
    priority: contractNeedPriority(profile),
    requiredBy: availabilityLabel(profile.urgencyDays),
    budget:
      profile.budgetAud === undefined
        ? undefined
        : { amount: profile.budgetAud * 100, currency: "AUD" },
    mustHaves: [
      ...(profile.equipmentOrTechnology ?? profile.equipmentTechnology ?? []).map(
        (item) => `Equipment: ${item}`
      ),
      ...(profile.requiredCapabilities ?? profile.requiredCapability ?? [])
    ],
    niceToHaves: [
      "Comparable supplier response",
      "Clear commercial assumptions"
    ],
    constraints: profile.constraints ?? [],
    status: needStatus(need.status),
    createdAt,
    updatedAt: need.updatedAt ?? createdAt
  };
}

function reconcileWorkspace(
  workspace: RapidMatchBuyerWorkspace
): RapidMatchBuyerWorkspace {
  const engagement = workspace.engagement;
  if (engagement?.status === "supplier_secured") {
    return {
      ...workspace,
      phase: "deploy",
      status: workspace.deployment?.status === "completed"
        ? "delivery_complete"
        : workspace.deployment?.status === "active"
          ? "delivery_active"
          : "supplier_secured",
      nextAction: "track_delivery"
    };
  }
  if (engagement) {
    return {
      ...workspace,
      phase: "deploy",
      status: "commitment_pending",
      nextAction: engagement.hostedCheckoutUrl
        ? "await_payment_confirmation"
        : "open_pinch_checkout"
    };
  }
  if (workspace.responses.length >= 2) {
    return {
      ...workspace,
      phase: "connect",
      status: "supplier_selection",
      nextAction: "select_supplier"
    };
  }
  if (workspace.responses.length > 0) {
    return {
      ...workspace,
      phase: "connect",
      status: "supplier_responses",
      nextAction: "compare_responses"
    };
  }
  return workspace;
}

function decisionWorkspace(
  workspace: RapidMatchBuyerWorkspace,
  solutionDecision: SolutionDecision
): RapidMatchBuyerWorkspace {
  const internal = solutionDecision.decision === "local_trial";
  return {
    ...workspace,
    phase: "find",
    status: internal ? "internal_plan_ready" : "supplier_matching",
    nextAction: internal ? "none" : "find_specialist",
    solutionDecision
  };
}

function parseResearch(value: unknown) {
  const parsed = solutionResearchResultSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function parseDecision(value: unknown) {
  const parsed = solutionDecisionSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function parseDeployment(value: unknown) {
  const parsed = deploymentSummarySchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function requiredNeedProfile(workspace: RapidMatchBuyerWorkspace) {
  if (!workspace.needProfile) {
    throw new Error("Create a Need Profile before continuing.");
  }
  return workspace.needProfile;
}

function requiredEngagement(workspace: RapidMatchBuyerWorkspace) {
  if (!workspace.engagement) {
    throw new Error("Select a supplier before starting the commitment.");
  }
  return workspace.engagement;
}

function requirementToMarketplaceProfile(
  input: BuyerRequirementInput,
  priority: PrioritySignal
): MarketplaceNeedProfile {
  return {
    title: input.title || "Industrial supplier requirement",
    description: input.description,
    problemSummary: input.description,
    category: input.category || inferCategory(input.description),
    industry: "Manufacturing",
    equipmentOrTechnology: input.equipmentOrTechnology,
    location: input.location,
    urgencyDays: parseUrgencyDays(input.requiredBy),
    budgetAud: input.budgetAmount || parseBudgetAmount(input.budgetRange),
    constraints: input.constraints,
    buyerPriority: priority,
    requiredCapabilities: input.requiredCapabilities.length
      ? input.requiredCapabilities
      : inferCapabilities(input.description)
  };
}

function marketplaceProfileFromNeed(
  needProfile: NeedProfile
): MarketplaceNeedProfile {
  return {
    title: needProfile.title,
    description: needProfile.description,
    problemSummary: needProfile.description,
    category: needProfile.category,
    industry: "Manufacturing",
    equipmentOrTechnology: needProfile.mustHaves
      .filter((item) => item.startsWith("Equipment: "))
      .map((item) => item.slice("Equipment: ".length)),
    location: needProfile.location,
    urgencyDays: needProfile.priority === "urgent" ? 1 : undefined,
    budgetAud: needProfile.budget
      ? Math.round(needProfile.budget.amount / 100)
      : undefined,
    constraints: needProfile.constraints,
    buyerPriority: needProfile.priority === "urgent" ? "speed" : "technical_fit",
    requiredCapabilities: needProfile.mustHaves.filter(
      (item) => !item.startsWith("Equipment: ")
    )
  };
}

function fixtureResearch(
  needProfileId: string,
  profile: MarketplaceNeedProfile
): SolutionResearchResult {
  const robotics = isRobotics(profile);
  const generatedAt = new Date().toISOString();
  const citations = robotics
    ? [
        fixtureCitation(
          `${needProfileId}-citation-safety`,
          "Guide for safe design of plant",
          "https://www.safeworkaustralia.gov.au/doc/guide-safe-design-plant",
          "Safe Work Australia guidance supports integrating risk controls early in plant design and considering safety across the plant lifecycle.",
          generatedAt
        ),
        fixtureCitation(
          `${needProfileId}-citation-standard`,
          "ISO 10218-2:2025 — Robotics — Safety requirements — Part 2: Industrial robot applications and robot cells",
          "https://www.iso.org/standard/73934.html",
          "The standard identifies safety requirements for industrial robot applications and robot cells.",
          generatedAt
        ),
        fixtureCitation(
          `${needProfileId}-citation-manufacturer`,
          "ABB Robotics",
          "https://www.abb.com/global/en/areas/robotics",
          "ABB's official robotics portfolio covers industrial robots, controllers, software, application solutions, services and equipment relevant to integration.",
          generatedAt
        )
      ]
    : [
        fixtureCitation(
          `${needProfileId}-citation-safety`,
          "Electrical work",
          "https://www.safework.nsw.gov.au/hazards-a-z/electrical-and-power/electrical-work",
          "SafeWork NSW guidance supports using competent, authorised workers and controlling electrical risks.",
          generatedAt
        ),
        fixtureCitation(
          `${needProfileId}-citation-controller`,
          "SIMATIC controllers",
          "https://www.siemens.com/global/en/products/automation/systems/industrial/plc.html",
          "Manufacturer material supports checking controller family, tooling and lifecycle compatibility before recovery.",
          generatedAt
        )
      ];
  const citationIds = citations.map((citation) => citation.id);
  const approaches = robotics
    ? [
        {
          id: `${needProfileId}-approach-recommended`,
          needProfileId,
          title: "Staged integration with safety-led acceptance",
          summary:
            "Validate the use case and safety concept, prove the handling process, then commission against measurable acceptance criteria.",
          rationale:
            "A staged integrator-led path contains technical and production risk while preserving clear commercial milestones.",
          localActions: [
            "Capture carton variants, cycle-time targets and available footprint.",
            "Nominate operations, maintenance and safety stakeholders."
          ],
          outsourceTriggers: [
            "Formal machinery risk assessment or guarding design is required.",
            "The cell needs robot simulation, tooling design or controls integration."
          ],
          requiredCapabilities: [
            "robotic systems integration",
            "machinery safety",
            "commissioning"
          ],
          risks: [
            "Process variation is not represented in early trials.",
            "Site interfaces are discovered after equipment selection."
          ],
          confidence: 0.9,
          citationIds
        },
        {
          id: `${needProfileId}-approach-alternative-1`,
          needProfileId,
          title: "Proof of process before full cell design",
          summary:
            "Trial the highest-risk handling, sensing and end-of-arm tooling assumptions before committing to full fabrication.",
          rationale:
            "A focused trial reduces integration risk where product variation or tooling performance is uncertain.",
          localActions: [
            "Provide representative cartons and failure examples.",
            "Agree measurable pass/fail trial outcomes."
          ],
          outsourceTriggers: [
            "Specialist vision or custom tooling is required."
          ],
          requiredCapabilities: [
            "robot programming",
            "end-of-arm tooling",
            "machine vision"
          ],
          risks: ["Trial samples may not represent production variability."],
          confidence: 0.83,
          citationIds
        },
        {
          id: `${needProfileId}-approach-alternative-2`,
          needProfileId,
          title: "Phased cell delivery with gated acceptance",
          summary:
            "Separate design, fabrication, installation and commissioning into evidence-backed acceptance gates tied to production outcomes.",
          rationale:
            "Commercial and technical gates keep scope, safety evidence and factory disruption visible throughout delivery.",
          localActions: [
            "Define target throughput, availability and handover evidence.",
            "Reserve production windows for installation and validation."
          ],
          outsourceTriggers: [
            "Controls, guarding and production cutover require coordinated specialist ownership."
          ],
          requiredCapabilities: [
            "controls integration",
            "site installation",
            "commissioning"
          ],
          risks: [
            "Unclear acceptance criteria shift technical risk into commissioning."
          ],
          confidence: 0.78,
          citationIds
        }
      ]
    : [
        {
          id: `${needProfileId}-approach-recommended`,
          needProfileId,
          title: "Safe evidence capture and controlled recovery",
          summary:
            "Preserve alarms, controller state and recent change history, then have an authorised controls specialist compare diagnostics with an approved baseline.",
          rationale:
            "This shortens specialist fault-finding without encouraging unreviewed changes or unsafe bypasses.",
          localActions: [
            "Follow the site's isolation and authorisation procedure.",
            "Capture non-sensitive alarm evidence and locate approved backups without loading them."
          ],
          outsourceTriggers: [
            "Safety-related controls or unknown program changes may be involved.",
            "No verified backup or compatible engineering environment is available."
          ],
          requiredCapabilities: [
            "industrial electrical fault finding",
            "PLC diagnostics",
            "safe isolation"
          ],
          risks: [
            "Unrecorded changes may overwrite useful fault evidence.",
            "The visible PLC alarm may be a symptom of another subsystem."
          ],
          confidence: 0.91,
          citationIds
        },
        {
          id: `${needProfileId}-approach-alternative-1`,
          needProfileId,
          title: "Stabilisation and recurrence prevention",
          summary:
            "After recovery, capture the validated baseline and convert the incident into backup, spares and monitoring actions.",
          rationale:
            "Recovery is incomplete until the factory reduces the likelihood and impact of repeat downtime.",
          localActions: [
            "Record approved firmware and hardware configuration.",
            "Schedule a short incident review."
          ],
          outsourceTriggers: [
            "The cause remains unconfirmed after restoration."
          ],
          requiredCapabilities: [
            "controls lifecycle planning",
            "industrial network health"
          ],
          risks: ["A temporary recovery may become an undocumented baseline."],
          confidence: 0.84,
          citationIds
        },
        {
          id: `${needProfileId}-approach-alternative-2`,
          needProfileId,
          title: "Controls lifecycle and resilience review",
          summary:
            "Use the incident evidence to assess obsolescence, backup integrity, spares and recurring network or power risks.",
          rationale:
            "A bounded resilience review can reduce future downtime once immediate production recovery is under control.",
          localActions: [
            "Catalogue controller, I/O, drive and network hardware.",
            "Confirm ownership and storage of approved backups."
          ],
          outsourceTriggers: [
            "Unsupported hardware or repeated communications faults are identified."
          ],
          requiredCapabilities: [
            "controls lifecycle planning",
            "industrial network assessment",
            "backup governance"
          ],
          risks: [
            "A broader review may distract from the immediate recovery window."
          ],
          confidence: 0.77,
          citationIds
        }
      ];

  return solutionResearchResultSchema.parse({
    id: `${needProfileId}-fixture-research`,
    needProfileId,
    sourceMode: "fixture",
    overview: robotics
      ? "A robotic cell is best framed as a staged integration project with early process, safety and acceptance validation."
      : "An urgent PLC outage should separate safe evidence gathering from restoration work and escalate quickly when authorised controls expertise is unavailable.",
    approaches,
    citations,
    missingInformation: robotics
      ? [
          "Representative carton range and target cycle time",
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
  });
}

function fixtureCitation(
  id: string,
  title: string,
  url: string,
  evidenceNote: string,
  accessedAt: string
) {
  return {
    id,
    title,
    url,
    sourceType: title.includes("ABB") || title.includes("SIMATIC")
      ? "manufacturer" as const
      : "standards" as const,
    provider: "fixture" as const,
    evidenceNote,
    accessedAt
  };
}

function fixtureDecision(
  workspace: RapidMatchBuyerWorkspace,
  decision: Extract<SolutionDecisionType, "local_trial" | "outsource">,
  selectedApproachId: string
): SolutionDecision {
  const needProfile = requiredNeedProfile(workspace);
  const research = workspace.researchResult;
  if (!research) throw new Error("Research is required.");
  return solutionDecisionSchema.parse({
    id: `${needProfile.id}-fixture-decision`,
    needProfileId: needProfile.id,
    researchResultId: research.id,
    decision,
    selectedApproachIds: [selectedApproachId],
    approvedBy: needProfile.contactName ?? "Buyer",
    approvedAt: new Date().toISOString()
  });
}

function fixtureDeployment(
  workspace: RapidMatchBuyerWorkspace
): DeploymentSummary {
  const engagement = requiredEngagement(workspace);
  const needProfile = requiredNeedProfile(workspace);
  const robotics = /robot|palletis/i.test(
    `${needProfile.title} ${needProfile.description} ${needProfile.category}`
  );
  const titles = robotics
    ? [
        "Site Assessment / Scoping Visit",
        "Design",
        "Installation",
        "Commissioning"
      ]
    : ["Diagnosis", "Recovery", "Validation", "Handover"];
  const secured = engagement.status === "supplier_secured";
  const paymentPending = engagement.paymentStatus !== "not_started";
  const updatedAt = engagement.updatedAt;
  return deploymentSummarySchema.parse({
    engagementId: engagement.id,
    title: robotics
      ? "Robotic integration delivery"
      : "PLC recovery delivery",
    status: secured ? "active" : paymentPending ? "commitment_pending" : "not_started",
    progressPercentage: 0,
    currentMilestoneId: `${engagement.id}-fixture-milestone-1`,
    nextMilestoneId: `${engagement.id}-fixture-milestone-2`,
    milestones: titles.map((title, index) => ({
      id: `${engagement.id}-fixture-milestone-${index + 1}`,
      engagementId: engagement.id,
      sequence: index + 1,
      title,
      status:
        index === 0
          ? secured
            ? "funded"
            : paymentPending
              ? "awaiting_payment"
              : "not_started"
          : "not_started",
      paymentStatus:
        index === 0 ? engagement.paymentStatus : "not_started",
      progressPercentage: 0,
      latestUpdate:
        index === 0 && secured
          ? "Commitment funded; engineering work has not been marked complete."
          : undefined,
      updatedAt
    })),
    latestUpdate: secured
      ? "Supplier commitment verified. Current milestone is ready to begin."
      : "Deployment projection is waiting for authoritative payment evidence.",
    updatedAt
  });
}

function isRobotics(profile: MarketplaceNeedProfile) {
  return /robot|palletis|cobot|manipulator/i.test(
    [
      profile.title,
      profile.description,
      profile.category,
      ...(profile.equipmentOrTechnology ?? [])
    ].join(" ")
  );
}

function inferCategory(description: string) {
  return /robot|plc|automation|conveyor/i.test(description)
    ? "Industrial automation"
    : "Industrial services";
}

function inferCapabilities(description: string) {
  const capabilities = new Set<string>();
  const normalised = description.toLowerCase();
  if (normalised.includes("robot")) capabilities.add("Robotic systems integration");
  if (normalised.includes("abb")) capabilities.add("ABB robotics");
  if (normalised.includes("siemens")) capabilities.add("Siemens PLC diagnostics");
  if (normalised.includes("plc")) capabilities.add("PLC diagnostics");
  if (normalised.includes("safety")) capabilities.add("Machinery safety");
  capabilities.add("Industrial onsite support");
  return [...capabilities];
}

function parseBudgetAmount(value: string) {
  const match = value.match(/(\d[\d,]*)/);
  return match ? Number(match[1].replaceAll(",", "")) : undefined;
}

function availabilityLabel(days?: number) {
  if (!days) return undefined;
  if (days === 1) return "Required today";
  return `Required within ${days} days`;
}

function contractNeedPriority(profile: MarketplaceNeedProfile) {
  if (
    profile.buyerPriority === "speed" ||
    (profile.urgencyDays !== undefined && profile.urgencyDays <= 1)
  ) {
    return "urgent" as const;
  }
  if (
    profile.urgencyDays !== undefined &&
    profile.urgencyDays <= 14
  ) {
    return "soon" as const;
  }
  return "planned" as const;
}

function needStatus(value?: string): NeedProfile["status"] {
  const statuses: NeedProfile["status"][] = [
    "draft",
    "submitted",
    "matching",
    "inviting",
    "responses_open",
    "selection_ready",
    "selected",
    "payment_pending",
    "secured",
    "cancelled"
  ];
  return statuses.includes(value as NeedProfile["status"])
    ? value as NeedProfile["status"]
    : "submitted";
}

function companyNameFromEmail(email: string) {
  const domain = email.split("@")[1]?.split(".")[0];
  return domain
    ? domain.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "Buyer organisation";
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
