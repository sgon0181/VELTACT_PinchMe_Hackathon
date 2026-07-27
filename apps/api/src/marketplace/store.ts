import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual
} from "node:crypto";
import { matchSuppliers } from "./matching.js";
import {
  getOutreachDeliveryReadiness,
  sendSupplierOpportunity
} from "./outreachDelivery.js";
import { supplierCatalog } from "./suppliers.js";
import { env } from "../env.js";
import {
  loadMarketplaceSnapshot,
  saveMarketplaceSnapshot
} from "./persistence.js";
import {
  runSolutionResearch,
  runSupplierDiscovery
} from "./findProviders.js";
import {
  createMarketplaceFixtureResearch,
  createMarketplaceFixtureSupplierLeads,
  inferMarketplaceDemoScenario
} from "./findFixtures.js";
import type { DeploymentSummary } from "@veltact/contracts";
import { syncCommitmentPayment } from "../deployment/templates.js";
import type {
  Engagement,
  LocalDemoPaymentEvidence,
  MarketplaceAuditEvent,
  NeedProfile,
  NeedRecord,
  PinchWebhookEvidence,
  SolutionDecision,
  SolutionResearchResult,
  SupplierClaim,
  SupplierInvitation,
  SupplierLead,
  SupplierOutreachDelivery,
  SupplierResponse
} from "./types.js";

const initialSnapshot = loadMarketplaceSnapshot(env.MARKETPLACE_DATA_FILE);
const needs = new Map<string, NeedRecord>(
  initialSnapshot?.needs.map((need) => [need.id, need]) ?? []
);
const researchResults = new Map<string, SolutionResearchResult>(
  initialSnapshot?.researchResults.map((result) => [
    result.needProfileId,
    result
  ]) ?? []
);
const solutionDecisions = new Map<string, SolutionDecision>(
  initialSnapshot?.solutionDecisions.map((decision) => [
    decision.needProfileId,
    decision
  ]) ?? []
);
const supplierLeads = new Map<string, SupplierLead>(
  initialSnapshot?.supplierLeads.map((lead) => [lead.id, lead]) ?? []
);
const invitations = new Map<string, SupplierInvitation>(
  initialSnapshot?.invitations.map((invitation) => [invitation.token, invitation]) ?? []
);
const supplierClaims = new Map<string, SupplierClaim>(
  initialSnapshot?.supplierClaims.map((claim) => [claim.token, claim]) ?? []
);
const outreachDeliveries = new Map<string, SupplierOutreachDelivery>(
  initialSnapshot?.outreachDeliveries.map((delivery) => [
    deliveryKey(delivery.invitationId, delivery.channel),
    delivery
  ]) ?? []
);
const responses = new Map<string, SupplierResponse>(
  initialSnapshot?.responses.map((supplierResponse) => [
    supplierResponse.id,
    supplierResponse
  ]) ?? []
);
const engagements = new Map<string, Engagement>(
  initialSnapshot?.engagements.map((engagement) => [engagement.id, engagement]) ?? []
);
const deployments = new Map<string, DeploymentSummary>(
  initialSnapshot?.deployments.map((deployment) => [
    deployment.engagementId,
    deployment
  ]) ?? []
);
const processedPinchEventIds = new Set<string>(
  initialSnapshot?.processedPinchEventIds ?? []
);
const pinchWebhookEvidence = new Map<string, PinchWebhookEvidence>(
  initialSnapshot?.pinchWebhookEvidence.map((evidence) => [
    evidence.eventId,
    evidence
  ]) ?? []
);
const localDemoPaymentEvidence = new Map<string, LocalDemoPaymentEvidence>(
  initialSnapshot?.localDemoPaymentEvidence.map((evidence) => [
    evidence.eventId,
    evidence
  ]) ?? []
);
const auditEvents: MarketplaceAuditEvent[] = initialSnapshot?.auditEvents ?? [];
const issuedBuyerAccessTokens = new Map<string, string>();

relinkNeedInvitations();

export type SupplierResponseSubmissionResult =
  | { status: "submitted"; supplierResponse: SupplierResponse }
  | { status: "not_found" }
  | { status: "expired" }
  | { status: "not_claimed" }
  | { status: "closed" };

export type SolutionDecisionCreationResult =
  | { status: "created"; solutionDecision: SolutionDecision }
  | { status: "not_found" }
  | { status: "research_required" }
  | { status: "invalid_approaches" }
  | { status: "discovery_started" };

export type SupplierDiscoveryResult =
  | {
      status: "discovered";
      supplierLeads: SupplierLead[];
      providerWarning?: string;
    }
  | { status: "not_found" }
  | { status: "research_required" }
  | { status: "decision_required" }
  | { status: "external_path_required" };

export type SupplierClaimResult =
  | { status: "claimed"; supplierClaim: SupplierClaim }
  | { status: "not_found" }
  | { status: "expired" }
  | { status: "outreach_required" }
  | { status: "closed" };

export type SupplierLeadInvitationPreparationResult =
  | {
      status: "prepared";
      invitations: SupplierInvitation[];
      supplierLeadIds: string[];
    }
  | { status: "not_found" }
  | { status: "invalid_leads" }
  | { status: "invalid_lifecycle" };

export type EngagementCreationResult =
  | { status: "created"; engagement: Engagement }
  | { status: "existing"; engagement: Engagement }
  | { status: "not_found" }
  | { status: "not_selectable" }
  | { status: "already_selected" };

export function createNeed(
  input: { buyerEmail: string; profile: NeedProfile },
  currentTime = new Date()
): NeedRecord {
  const id = randomUUID();
  const buyerAccessToken = secureAccessToken();
  const createdAt = currentTime.toISOString();
  const matches = matchSuppliers(input.profile, supplierCatalog);
  const needInvitations = matches.map((match) => {
    const token = secureAccessToken();
    const invitationId = `${id}-invitation-${match.supplier.id}`;
    const invitation: SupplierInvitation = {
      id: invitationId,
      token,
      needId: id,
      needProfileId: id,
      supplierId: match.supplier.id,
      supplierName: match.supplier.companyName,
      matchId: `${id}-${match.id}`,
      responseUrl: new URL(
        `/supplier.html?token=${encodeURIComponent(token)}`,
        env.PUBLIC_BASE_URL
      ).toString(),
      status: "pending",
      expiresAt: new Date(Date.parse(createdAt) + 3 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt,
      updatedAt: createdAt
    };
    invitations.set(invitation.token, invitation);
    supplierClaims.set(invitation.token, {
      id: `${invitation.id}-claim`,
      supplierLeadId: invitation.supplierId,
      invitationId: invitation.id,
      token: invitation.token,
      status: "pending",
      expiresAt: invitation.expiresAt,
      createdAt,
      updatedAt: createdAt
    });
    outreachDeliveries.set(deliveryKey(invitation.id, "email"), {
      invitationId: invitation.id,
      supplierId: invitation.supplierId,
      channel: "email",
      destination: env.SUPPLIER_OUTREACH_EMAIL_TO ?? match.supplier.contactEmail,
      deliveryStatus: "not_sent"
    });
    const mobileDestination = env.SUPPLIER_OUTREACH_WHATSAPP_TO
      ? whatsappAddress(env.SUPPLIER_OUTREACH_WHATSAPP_TO)
      : env.SUPPLIER_OUTREACH_SMS_TO ?? match.supplier.contactPhone;
    if (mobileDestination) {
      outreachDeliveries.set(deliveryKey(invitation.id, "sms"), {
        invitationId: invitation.id,
        supplierId: invitation.supplierId,
        channel: "sms",
        destination: mobileDestination,
        deliveryStatus: "not_sent"
      });
    }
    return invitation;
  });

  const need: NeedRecord = {
    id,
    buyerEmail: input.buyerEmail,
    buyerAccessTokenHash: accessTokenHash(buyerAccessToken),
    profile: input.profile,
    matches,
    invitations: needInvitations,
    status: "responses_open",
    createdAt,
    updatedAt: createdAt
  };
  needs.set(id, need);
  issuedBuyerAccessTokens.set(id, buyerAccessToken);
  commitMarketplaceMutation({
    eventType: "need.created",
    actorType: "buyer",
    actorId: input.buyerEmail,
    entityType: "need",
    entityId: id,
    metadata: {
      matchCount: matches.length,
      category: input.profile.category
    }
  });
  return need;
}

export function consumeIssuedBuyerAccessToken(needId: string) {
  const token = issuedBuyerAccessTokens.get(needId);
  issuedBuyerAccessTokens.delete(needId);
  return token;
}

export function isBuyerAuthorised(needId: string, accessToken: string | undefined) {
  if (!env.BUYER_CAPABILITY_AUTH_REQUIRED) {
    return true;
  }

  const expectedHash = needs.get(needId)?.buyerAccessTokenHash;
  if (!expectedHash || !accessToken) {
    return false;
  }

  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(accessTokenHash(accessToken), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function listMarketplaceAuditEvents() {
  return [...auditEvents];
}

export function listPinchWebhookEvidence() {
  return [...pinchWebhookEvidence.values()];
}

export function listLocalDemoPaymentEvidence() {
  return [...localDemoPaymentEvidence.values()];
}

export function getNeed(id: string): NeedRecord | undefined {
  return needs.get(id);
}

export function getResearchResultForNeed(
  needId: string
): SolutionResearchResult | undefined {
  return researchResults.get(needId);
}

export function getSolutionDecisionForNeed(
  needId: string
): SolutionDecision | undefined {
  return solutionDecisions.get(needId);
}

export function listSupplierLeadsForNeed(needId: string): SupplierLead[] {
  return [...supplierLeads.values()]
    .filter((lead) => lead.needProfileId === needId)
    .sort((left, right) => {
      if (right.matchScore !== left.matchScore) {
        return right.matchScore - left.matchScore;
      }
      return left.id.localeCompare(right.id);
    });
}

export function getProviderWarningsForNeed(needId: string): string[] {
  const warningState = needs.get(needId)?.providerWarnings;
  return [warningState?.research, warningState?.discovery].filter(
    (warning): warning is string => Boolean(warning)
  );
}

export async function researchNeed(needId: string): Promise<
  | {
      researchResult: SolutionResearchResult;
      providerWarning?: string;
    }
  | undefined
> {
  const need = needs.get(needId);
  if (!need) {
    return undefined;
  }

  const existing = researchResults.get(needId);
  if (existing) {
    return {
      researchResult: existing,
      providerWarning: need.providerWarnings?.research
    };
  }

  const execution = await runSolutionResearch(needId, need.profile);
  if (needs.get(needId) !== need) {
    return undefined;
  }
  const saved = researchResults.get(needId) ?? execution.value;
  researchResults.set(needId, saved);
  need.providerWarnings = {
    ...need.providerWarnings,
    research: execution.warning
  };
  need.updatedAt = new Date().toISOString();
  commitMarketplaceMutation({
    eventType: "research.completed",
    actorType: "buyer",
    actorId: need.buyerEmail,
    entityType: "need",
    entityId: needId,
    metadata: {
      sourceMode: saved.sourceMode,
      approachCount: saved.approaches.length
    }
  });
  return {
    researchResult: saved,
    providerWarning: execution.warning
  };
}

export function createSolutionDecision(
  needId: string,
  input: {
    decision: SolutionDecision["decision"];
    selectedApproachIds: string[];
    buyerNote?: string;
  },
  currentTime = new Date()
): SolutionDecisionCreationResult {
  const need = needs.get(needId);
  if (!need) {
    return { status: "not_found" };
  }
  const researchResult = researchResults.get(needId);
  if (!researchResult) {
    return { status: "research_required" };
  }

  const selectedIds = new Set(input.selectedApproachIds);
  const validApproachIds = new Set(
    researchResult.approaches.map((approach) => approach.id)
  );
  if (
    selectedIds.size === 0 ||
    selectedIds.size !== input.selectedApproachIds.length ||
    [...selectedIds].some((id) => !validApproachIds.has(id))
  ) {
    return { status: "invalid_approaches" };
  }

  const existing = solutionDecisions.get(needId);
  if (listSupplierLeadsForNeed(needId).length > 0) {
    const unchanged =
      existing?.decision === input.decision &&
      existing.selectedApproachIds.length === selectedIds.size &&
      existing.selectedApproachIds.every((id) => selectedIds.has(id));
    return unchanged && existing
      ? { status: "created", solutionDecision: existing }
      : { status: "discovery_started" };
  }

  const approvedAt = currentTime.toISOString();
  const solutionDecision: SolutionDecision = {
    id: existing?.id ?? randomUUID(),
    needProfileId: needId,
    researchResultId: researchResult.id,
    decision: input.decision,
    selectedApproachIds: [...selectedIds],
    buyerNote: input.buyerNote,
    approvedBy: need.buyerEmail,
    approvedAt
  };
  solutionDecisions.set(needId, solutionDecision);
  need.updatedAt = approvedAt;
  commitMarketplaceMutation({
    eventType: "solution_decision.recorded",
    actorType: "buyer",
    actorId: need.buyerEmail,
    entityType: "need",
    entityId: needId,
    metadata: {
      decision: solutionDecision.decision,
      selectedApproachCount: solutionDecision.selectedApproachIds.length
    }
  });
  return { status: "created", solutionDecision };
}

export async function discoverNeedSuppliers(
  needId: string
): Promise<SupplierDiscoveryResult> {
  const need = needs.get(needId);
  if (!need) {
    return { status: "not_found" };
  }
  const researchResult = researchResults.get(needId);
  if (!researchResult) {
    return { status: "research_required" };
  }
  const solutionDecision = solutionDecisions.get(needId);
  if (!solutionDecision) {
    return { status: "decision_required" };
  }
  if (solutionDecision.decision === "local_trial") {
    return { status: "external_path_required" };
  }

  const existing = listSupplierLeadsForNeed(needId);
  if (existing.length > 0) {
    return {
      status: "discovered",
      supplierLeads: existing,
      providerWarning: need.providerWarnings?.discovery
    };
  }

  const selectedApproachIds = new Set(
    solutionDecision.selectedApproachIds
  );
  const requiredCapabilities = [
    ...new Set(
      researchResult.approaches
        .filter((approach) => selectedApproachIds.has(approach.id))
        .flatMap((approach) => approach.requiredCapabilities)
    )
  ];
  const execution = await runSupplierDiscovery(
    needId,
    need.profile,
    requiredCapabilities.length > 0
      ? requiredCapabilities
      : need.profile.requiredCapabilities ??
          need.profile.requiredCapability ??
          []
  );
  if (needs.get(needId) !== need) {
    return { status: "not_found" };
  }
  for (const lead of execution.value) {
    supplierLeads.set(lead.id, lead);
  }
  need.providerWarnings = {
    ...need.providerWarnings,
    discovery: execution.warning
  };
  need.updatedAt = new Date().toISOString();
  commitMarketplaceMutation({
    eventType: "supplier_discovery.completed",
    actorType: "buyer",
    actorId: need.buyerEmail,
    entityType: "need",
    entityId: needId,
    metadata: {
      sourceMode: execution.value[0]?.sourceMode ?? "fixture",
      leadCount: execution.value.length
    }
  });
  return {
    status: "discovered",
    supplierLeads: listSupplierLeadsForNeed(needId),
    providerWarning: execution.warning
  };
}

export function seedMarketplaceDemoFindState(
  needId: string,
  currentTime = new Date()
):
  | {
      researchResult: SolutionResearchResult;
      solutionDecision: SolutionDecision;
      supplierLeads: SupplierLead[];
    }
  | undefined {
  const need = needs.get(needId);
  if (!need) {
    return undefined;
  }
  const scenario = inferMarketplaceDemoScenario(need.profile);
  const researchResult = createMarketplaceFixtureResearch(
    needId,
    need.profile,
    currentTime
  );
  const discoveredLeads = createMarketplaceFixtureSupplierLeads(
    needId,
    need.profile,
    currentTime
  );
  const solutionDecision: SolutionDecision = {
    id: `${needId}:decision:${scenario}`,
    needProfileId: needId,
    researchResultId: researchResult.id,
    decision: scenario === "robotics" ? "outsource" : "hybrid",
    selectedApproachIds: researchResult.approaches.map(
      (approach) => approach.id
    ),
    buyerNote:
      scenario === "robotics"
        ? "Use a specialist integrator for feasibility, safety, proof of process and staged commissioning."
        : "Preserve evidence internally, then use an authorised specialist for controlled recovery and validation.",
    approvedBy: need.buyerEmail,
    approvedAt: currentTime.toISOString()
  };

  researchResults.set(needId, researchResult);
  solutionDecisions.set(needId, solutionDecision);
  for (const lead of discoveredLeads) {
    supplierLeads.set(lead.id, lead);
  }
  need.providerWarnings = undefined;
  need.updatedAt = currentTime.toISOString();
  commitMarketplaceMutation({
    eventType: "demo_find_state.seeded",
    actorType: "system",
    entityType: "need",
    entityId: needId,
    metadata: {
      scenario,
      leadCount: discoveredLeads.length
    }
  });
  return {
    researchResult,
    solutionDecision,
    supplierLeads: discoveredLeads
  };
}

export function getInvitation(token: string): SupplierInvitation | undefined {
  return invitations.get(token);
}

export function getSupplierClaim(token: string): SupplierClaim | undefined {
  return supplierClaims.get(token);
}

export function getResponseForInvitation(invitationId: string): SupplierResponse | undefined {
  return [...responses.values()].find((response) => response.invitationId === invitationId);
}

export function prepareSupplierLeadInvitationsForNeed(
  needId: string,
  requestedSupplierLeadIds?: string[],
  currentTime = new Date()
): SupplierLeadInvitationPreparationResult {
  const need = needs.get(needId);
  if (!need) {
    return { status: "not_found" };
  }
  const availableLeads = listSupplierLeadsForNeed(needId);
  if (availableLeads.length === 0) {
    return {
      status: "prepared",
      invitations: [],
      supplierLeadIds: []
    };
  }

  const selectedIds = requestedSupplierLeadIds
    ? [...new Set(requestedSupplierLeadIds)]
    : availableLeads.map((lead) => lead.id);
  if (
    selectedIds.length === 0 ||
    selectedIds.length !== (requestedSupplierLeadIds?.length ?? selectedIds.length)
  ) {
    return { status: "invalid_leads" };
  }
  const selectedIdSet = new Set(selectedIds);
  const selectedLeads = availableLeads.filter((lead) =>
    selectedIdSet.has(lead.id)
  );
  if (selectedLeads.length !== selectedIds.length) {
    return { status: "invalid_leads" };
  }
  if (
    selectedLeads.some(
      (lead) =>
        ![
          "discovered",
          "approved_for_outreach",
          "invited",
          "claimed"
        ].includes(lead.lifecycleStatus)
    )
  ) {
    return { status: "invalid_lifecycle" };
  }

  const createdAt = currentTime.toISOString();
  const newlyApproved = !need.outreachApprovedAt;
  need.outreachApprovedAt ??= createdAt;
  const preparedInvitations: SupplierInvitation[] = [];
  for (const lead of selectedLeads) {
    if (lead.lifecycleStatus === "discovered") {
      lead.lifecycleStatus = "approved_for_outreach";
      lead.approvedForOutreachAt = createdAt;
      lead.updatedAt = createdAt;
    }

    let invitation = need.invitations.find(
      (candidate) => candidate.supplierId === lead.id
    );
    if (!invitation) {
      const token = secureAccessToken();
      invitation = {
        id: `${needId}-invitation-${lead.id}`,
        token,
        needId,
        needProfileId: needId,
        supplierId: lead.id,
        supplierName: lead.companyName,
        matchId: `${needId}-${lead.id}`,
        responseUrl: new URL(
          `/supplier.html?token=${encodeURIComponent(token)}`,
          env.PUBLIC_BASE_URL
        ).toString(),
        status: "pending",
        expiresAt: new Date(
          currentTime.getTime() + 3 * 24 * 60 * 60 * 1000
        ).toISOString(),
        createdAt,
        updatedAt: createdAt
      };
      need.invitations.push(invitation);
      invitations.set(token, invitation);
      createPendingSupplierClaim(invitation);

      const emailDestination =
        env.SUPPLIER_OUTREACH_EMAIL_TO ?? lead.contactEmail;
      if (emailDestination) {
        outreachDeliveries.set(deliveryKey(invitation.id, "email"), {
          invitationId: invitation.id,
          supplierId: lead.id,
          channel: "email",
          destination: emailDestination,
          deliveryStatus: "not_sent"
        });
      }
      const mobileDestination = env.SUPPLIER_OUTREACH_WHATSAPP_TO
        ? whatsappAddress(env.SUPPLIER_OUTREACH_WHATSAPP_TO)
        : env.SUPPLIER_OUTREACH_SMS_TO ?? lead.contactPhone;
      if (mobileDestination) {
        outreachDeliveries.set(deliveryKey(invitation.id, "sms"), {
          invitationId: invitation.id,
          supplierId: lead.id,
          channel: "sms",
          destination: mobileDestination,
          deliveryStatus: "not_sent"
        });
      }
    }
    preparedInvitations.push(invitation);
  }

  need.updatedAt = createdAt;
  if (newlyApproved) {
    commitMarketplaceMutation({
      eventType: "outreach.approved",
      actorType: "buyer",
      actorId: need.buyerEmail,
      entityType: "need",
      entityId: needId,
      metadata: {}
    });
  }
  commitMarketplaceMutation({
    eventType: "supplier_leads.approved_for_outreach",
    actorType: "buyer",
    actorId: need.buyerEmail,
    entityType: "need",
    entityId: needId,
    metadata: {
      supplierLeadCount: selectedLeads.length
    }
  });
  return {
    status: "prepared",
    invitations: preparedInvitations,
    supplierLeadIds: selectedIds
  };
}

export function approveSupplierOutreachForNeed(
  needId: string,
  currentTime = new Date()
): NeedRecord | undefined {
  const need = needs.get(needId);
  if (!need) {
    return undefined;
  }
  if (need.outreachApprovedAt) {
    return need;
  }

  need.outreachApprovedAt = currentTime.toISOString();
  need.updatedAt = need.outreachApprovedAt;
  commitMarketplaceMutation({
    eventType: "outreach.approved",
    actorType: "buyer",
    actorId: need.buyerEmail,
    entityType: "need",
    entityId: needId,
    metadata: {}
  });
  return need;
}

export async function sendSupplierOutreachForNeed(
  needId: string,
  onDeliveryUpdated?: (delivery: SupplierOutreachDelivery) => void,
  supplierIds?: Set<string>
): Promise<SupplierOutreachDelivery[] | undefined> {
  const need = needs.get(needId);
  if (!need) {
    return undefined;
  }
  if (!need.outreachApprovedAt) {
    return [];
  }

  const updatedDeliveries: SupplierOutreachDelivery[] = [];
  for (const invitation of need.invitations) {
    if (supplierIds && !supplierIds.has(invitation.supplierId)) {
      continue;
    }
    for (const channel of ["email", "sms"] as const) {
      const delivery = outreachDeliveries.get(deliveryKey(invitation.id, channel));
      if (!delivery) {
        continue;
      }
      updatedDeliveries.push(
        ...(await sendOutreachDelivery(delivery, invitation, need, onDeliveryUpdated))
      );
    }
  }

  return updatedDeliveries;
}

export function listOutreachDeliveriesForNeed(needId: string): SupplierOutreachDelivery[] | undefined {
  const need = needs.get(needId);
  if (!need) {
    return undefined;
  }

  const invitationIds = new Set(need.invitations.map((invitation) => invitation.id));
  return [...outreachDeliveries.values()].filter((delivery) => invitationIds.has(delivery.invitationId));
}

export function markInvitationViewed(
  token: string,
  currentTime = new Date()
): SupplierInvitation | undefined {
  const invitation = invitations.get(token);
  if (!invitation) {
    return undefined;
  }

  const previousStatus = invitation.status;
  if (expireInvitationIfNeeded(invitation, currentTime)) {
    if (invitation.status !== previousStatus) {
      commitMarketplaceMutation({
        eventType: "invitation.expired",
        actorType: "system",
        entityType: "invitation",
        entityId: invitation.id,
        metadata: { supplierId: invitation.supplierId }
      });
    }
    return invitation;
  }

  if (invitation.status === "sent" || invitation.status === "pending") {
    const openedAt = currentTime.toISOString();
    invitation.status = "opened";
    invitation.openedAt = openedAt;
    invitation.updatedAt = openedAt;
    commitMarketplaceMutation({
      eventType: "invitation.opened",
      actorType: "supplier",
      actorId: invitation.supplierId,
      entityType: "invitation",
      entityId: invitation.id,
      metadata: {}
    });
  }

  return invitation;
}

export function claimSupplierInvitation(
  token: string,
  input: {
    claimantName?: string;
    claimantEmail?: string;
  },
  currentTime = new Date()
): SupplierClaimResult {
  const invitation = invitations.get(token);
  if (!invitation) {
    return { status: "not_found" };
  }

  const previousStatus = invitation.status;
  if (expireInvitationIfNeeded(invitation, currentTime)) {
    if (invitation.status !== previousStatus) {
      commitMarketplaceMutation({
        eventType: "invitation.expired",
        actorType: "system",
        entityType: "invitation",
        entityId: invitation.id,
        metadata: { supplierId: invitation.supplierId }
      });
    }
    return { status: "expired" };
  }

  const need = needs.get(invitation.needId);
  if (!need || invitation.status === "cancelled") {
    return { status: "not_found" };
  }
  if (need.status !== "responses_open") {
    return { status: "closed" };
  }
  if (!need.outreachApprovedAt) {
    if (!invitation.sentAt) {
      return { status: "outreach_required" };
    }
    // Version 1 snapshots predate the approval field; a recorded send is the
    // only safe evidence that approval had already occurred.
    need.outreachApprovedAt = invitation.sentAt;
  }

  const claim =
    supplierClaims.get(token) ??
    createPendingSupplierClaim(invitation);
  if (
    claim.status === "expired" ||
    claim.status === "revoked" ||
    Date.parse(claim.expiresAt) <= currentTime.getTime()
  ) {
    claim.status = "expired";
    claim.updatedAt = currentTime.toISOString();
    commitMarketplaceMutation({
      eventType: "supplier_claim.expired",
      actorType: "system",
      entityType: "invitation",
      entityId: invitation.id,
      metadata: { supplierId: invitation.supplierId }
    });
    return { status: "expired" };
  }

  const claimedAt = currentTime.toISOString();
  const alreadyClaimed = claim.status === "claimed";
  claim.status = "claimed";
  claim.claimantName = input.claimantName ?? claim.claimantName;
  claim.claimantEmail = input.claimantEmail ?? claim.claimantEmail;
  claim.claimedAt = claim.claimedAt ?? claimedAt;
  claim.updatedAt = claimedAt;
  if (invitation.status === "sent" || invitation.status === "pending") {
    invitation.status = "opened";
    invitation.openedAt = invitation.openedAt ?? claimedAt;
    invitation.updatedAt = claimedAt;
  }

  const lead = supplierLeads.get(invitation.supplierId);
  if (
    lead?.lifecycleStatus === "invited" ||
    lead?.lifecycleStatus === "approved_for_outreach"
  ) {
    lead.lifecycleStatus = "claimed";
    lead.claimedAt = lead.claimedAt ?? claimedAt;
    lead.updatedAt = claimedAt;
  }

  if (!alreadyClaimed || input.claimantName || input.claimantEmail) {
    commitMarketplaceMutation({
      eventType: "supplier_claim.claimed",
      actorType: "supplier",
      actorId: invitation.supplierId,
      entityType: "invitation",
      entityId: invitation.id,
      metadata: {}
    });
  }
  return { status: "claimed", supplierClaim: claim };
}

export function submitSupplierResponse(
  token: string,
  input: {
    canHelp: boolean;
    earliestAvailability: string;
    indicativePriceAud: number;
    relevantExperience: string;
    proposedApproach?: string;
    assumptions?: string[];
    conditions: string | string[];
  },
  currentTime = new Date()
): SupplierResponseSubmissionResult {
  const conditions = Array.isArray(input.conditions)
    ? input.conditions
    : [input.conditions];
  const invitation = invitations.get(token);
  if (!invitation) {
    return { status: "not_found" };
  }

  if (expireInvitationIfNeeded(invitation, currentTime)) {
    commitMarketplaceMutation({
      eventType: "invitation.expired",
      actorType: "system",
      entityType: "invitation",
      entityId: invitation.id,
      metadata: { supplierId: invitation.supplierId }
    });
    return { status: "expired" };
  }

  const need = needs.get(invitation.needId);
  if (!need || invitation.status === "cancelled") {
    return { status: "not_found" };
  }
  if (need.status !== "responses_open") {
    return { status: "closed" };
  }
  if (supplierClaims.get(token)?.status !== "claimed") {
    return { status: "not_claimed" };
  }

  const existingResponse = [...responses.values()].find(
    (response) => response.needId === invitation.needId && response.supplierId === invitation.supplierId
  );
  if (existingResponse) {
    const updatedAt = currentTime.toISOString();
    existingResponse.canHelp = input.canHelp;
    existingResponse.decision = input.canHelp ? "can_help" : "cannot_help";
    existingResponse.earliestAvailability = input.earliestAvailability;
    existingResponse.availability = input.earliestAvailability;
    existingResponse.indicativePriceAud = input.indicativePriceAud;
    existingResponse.indicativePrice = {
      amount: input.indicativePriceAud * 100,
      currency: "AUD"
    };
    existingResponse.relevantExperience = input.relevantExperience;
    existingResponse.proposedApproach = input.proposedApproach;
    existingResponse.assumptions = input.assumptions ?? [];
    existingResponse.conditions = conditions;
    existingResponse.updatedAt = updatedAt;
    invitation.status = "responded";
    invitation.respondedAt = updatedAt;
    invitation.updatedAt = updatedAt;
    updateMatchResponseStatus(invitation, input.canHelp, updatedAt);
    commitMarketplaceMutation({
      eventType: "response.updated",
      actorType: "supplier",
      actorId: invitation.supplierId,
      entityType: "response",
      entityId: existingResponse.id,
      metadata: { decision: existingResponse.decision }
    });
    return { status: "submitted", supplierResponse: existingResponse };
  }

  const submittedAt = currentTime.toISOString();
  const response: SupplierResponse = {
    id: randomUUID(),
    needId: invitation.needId,
    needProfileId: invitation.needProfileId,
    supplierId: invitation.supplierId,
    supplierName: invitation.supplierName,
    invitationId: invitation.id,
    canHelp: input.canHelp,
    decision: input.canHelp ? "can_help" : "cannot_help",
    earliestAvailability: input.earliestAvailability,
    availability: input.earliestAvailability,
    indicativePriceAud: input.indicativePriceAud,
    indicativePrice: {
      amount: input.indicativePriceAud * 100,
      currency: "AUD"
    },
    relevantExperience: input.relevantExperience,
    proposedApproach: input.proposedApproach,
    assumptions: input.assumptions ?? [],
    conditions,
    status: "submitted",
    submittedAt,
    createdAt: submittedAt,
    updatedAt: submittedAt
  };

  invitation.status = "responded";
  invitation.respondedAt = submittedAt;
  invitation.updatedAt = submittedAt;
  responses.set(response.id, response);
  updateMatchResponseStatus(invitation, input.canHelp, submittedAt);
  commitMarketplaceMutation({
    eventType: "response.submitted",
    actorType: "supplier",
    actorId: invitation.supplierId,
    entityType: "response",
    entityId: response.id,
    metadata: { decision: response.decision }
  });
  return { status: "submitted", supplierResponse: response };
}

function updateMatchResponseStatus(invitation: SupplierInvitation, canHelp: boolean, updatedAt: string) {
  const need = needs.get(invitation.needId);
  const match = need?.matches.find((item) => item.supplier.id === invitation.supplierId);
  if (match) {
    match.status = canHelp ? "responded" : "declined";
    match.updatedAt = updatedAt;
  }
}

function expireInvitationIfNeeded(invitation: SupplierInvitation, currentTime: Date) {
  if (Date.parse(invitation.expiresAt) > currentTime.getTime()) {
    return false;
  }

  if (invitation.status !== "responded" && invitation.status !== "cancelled") {
    const expiredAt = currentTime.toISOString();
    invitation.status = "expired";
    invitation.updatedAt = expiredAt;
    const claim = supplierClaims.get(invitation.token);
    if (claim && claim.status !== "revoked") {
      claim.status = "expired";
      claim.updatedAt = expiredAt;
    }
    const need = needs.get(invitation.needId);
    const match = need?.matches.find((item) => item.supplier.id === invitation.supplierId);
    if (match) {
      match.status = "expired";
      match.updatedAt = expiredAt;
    }
  }

  return true;
}

function createPendingSupplierClaim(
  invitation: SupplierInvitation
): SupplierClaim {
  const claim: SupplierClaim = {
    id: `${invitation.id}-claim`,
    supplierLeadId: invitation.supplierId,
    invitationId: invitation.id,
    token: invitation.token,
    status: "pending",
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt
  };
  supplierClaims.set(invitation.token, claim);
  return claim;
}

function deliveryKey(invitationId: string, channel: SupplierOutreachDelivery["channel"]) {
  return `${invitationId}:${channel}`;
}

function whatsappAddress(phoneNumber: string) {
  return phoneNumber.startsWith("whatsapp:") ? phoneNumber : `whatsapp:${phoneNumber}`;
}

async function sendOutreachDelivery(
  delivery: SupplierOutreachDelivery,
  invitation: SupplierInvitation,
  need: NeedRecord,
  onDeliveryUpdated?: (delivery: SupplierOutreachDelivery) => void
) {
  if (delivery.deliveryStatus === "sent") {
    return [{ ...delivery }];
  }

  const activatedAt = new Date().toISOString();
  activateSecureInvitation(need, invitation, activatedAt);
  const readiness = getOutreachDeliveryReadiness(delivery);
  if (!readiness.available || readiness.provider === "local_demo") {
    const result = await sendSupplierOpportunity(delivery, invitation, need);
    delivery.deliveryStatus = "not_sent";
    delivery.sentAt = undefined;
    delivery.errorMessage = result.ok ? undefined : result.errorMessage;
    updatedNeedTimestamp(need);
    const update = { ...delivery };
    commitMarketplaceMutation({
      eventType:
        result.outcome === "local_demo"
          ? "outreach.local_demo_prepared"
          : "outreach.not_configured",
      actorType: "system",
      entityType: "outreach",
      entityId: deliveryKey(delivery.invitationId, delivery.channel),
      metadata: {
        channel: delivery.channel,
        supplierId: delivery.supplierId,
        status: delivery.deliveryStatus,
        outcome: result.outcome,
        provider: result.provider,
        attempted: result.attempted
      }
    });
    onDeliveryUpdated?.(update);
    return [update];
  }

  delivery.deliveryStatus = "queued";
  delivery.errorMessage = undefined;
  updatedNeedTimestamp(need);
  const updates = [{ ...delivery }];
  commitMarketplaceMutation({
    eventType: "outreach.queued",
    actorType: "system",
    entityType: "outreach",
    entityId: deliveryKey(delivery.invitationId, delivery.channel),
    metadata: {
      channel: delivery.channel,
      supplierId: delivery.supplierId
    }
  });
  onDeliveryUpdated?.(updates[0]);

  const result = await sendSupplierOpportunity(delivery, invitation, need);
  const sentAt = new Date().toISOString();
  delivery.deliveryStatus =
    result.outcome === "sent"
      ? "sent"
      : result.outcome === "failed"
        ? "failed"
        : "not_sent";
  delivery.sentAt = result.outcome === "sent" ? sentAt : undefined;
  delivery.errorMessage =
    result.outcome === "sent" ? undefined : result.errorMessage;
  if (result.outcome === "sent") {
    invitation.sentAt = invitation.sentAt ?? sentAt;
    invitation.updatedAt = sentAt;
    if (invitation.status === "pending") {
      invitation.status = "sent";
    }
  }
  updatedNeedTimestamp(need);
  updates.push({ ...delivery });
  commitMarketplaceMutation({
    eventType:
      result.outcome === "sent"
        ? "outreach.sent"
        : result.outcome === "failed"
          ? "outreach.failed"
          : "outreach.not_configured",
    actorType: "system",
    entityType: "outreach",
    entityId: deliveryKey(delivery.invitationId, delivery.channel),
    metadata: {
      channel: delivery.channel,
      supplierId: delivery.supplierId,
      status: delivery.deliveryStatus,
      outcome: result.outcome,
      provider: result.provider,
      attempted: result.attempted
    }
  });
  onDeliveryUpdated?.(updates[1]);
  return updates;
}

function activateSecureInvitation(
  need: NeedRecord,
  invitation: SupplierInvitation,
  activatedAt: string
) {
  const match = need.matches.find(
    (candidate) => candidate.supplier.id === invitation.supplierId
  );
  if (match?.status === "matched") {
    match.status = "invited";
    match.updatedAt = activatedAt;
  }

  const lead = supplierLeads.get(invitation.supplierId);
  if (lead?.lifecycleStatus === "approved_for_outreach") {
    lead.lifecycleStatus = "invited";
    lead.invitedAt = lead.invitedAt ?? activatedAt;
    lead.updatedAt = activatedAt;
  }
}

function updatedNeedTimestamp(need: NeedRecord) {
  need.updatedAt = new Date().toISOString();
}

export function listResponsesForNeed(needId: string): SupplierResponse[] | undefined {
  if (!needs.has(needId)) {
    return undefined;
  }

  return [...responses.values()]
    .filter((response) => response.needId === needId)
    .sort((left, right) => left.submittedAt.localeCompare(right.submittedAt));
}

export function createEngagement(input: {
  needId: string;
  supplierResponseId: string;
}): EngagementCreationResult {
  const need = needs.get(input.needId);
  const supplierResponse = responses.get(input.supplierResponseId);
  if (!need || !supplierResponse || supplierResponse.needId !== input.needId) {
    return { status: "not_found" };
  }

  const existing = [...engagements.values()].find((engagement) => engagement.needId === input.needId);
  if (existing) {
    return existing.supplierResponseId === input.supplierResponseId
      ? { status: "existing", engagement: existing }
      : { status: "already_selected" };
  }

  if (
    supplierResponse.status !== "submitted" ||
    supplierResponse.decision !== "can_help" ||
    !supplierResponse.canHelp ||
    supplierResponse.indicativePriceAud <= 0 ||
    supplierResponse.indicativePrice.amount <= 0
  ) {
    return { status: "not_selectable" };
  }

  const now = new Date().toISOString();
  const engagement: Engagement = {
    id: randomUUID(),
    needId: input.needId,
    supplierId: supplierResponse.supplierId,
    supplierName: supplierResponse.supplierName,
    supplierResponseId: supplierResponse.id,
    status: "supplier_selected",
    paymentStatus: "not_started",
    createdAt: now,
    updatedAt: now
  };

  need.status = "selected";
  need.updatedAt = now;
  for (const match of need.matches) {
    match.status = match.supplier.id === supplierResponse.supplierId ? "selected" : "not_selected";
    match.updatedAt = now;
  }
  engagements.set(engagement.id, engagement);
  commitMarketplaceMutation({
    eventType: "engagement.created",
    actorType: "buyer",
    entityType: "engagement",
    entityId: engagement.id,
    metadata: {
      needId: input.needId,
      supplierId: engagement.supplierId
    }
  });
  return { status: "created", engagement };
}

export function getEngagement(engagementId: string): Engagement | undefined {
  return engagements.get(engagementId);
}

export function getEngagementForNeed(needId: string): Engagement | undefined {
  return [...engagements.values()].find(
    (engagement) => engagement.needId === needId
  );
}

export function getDeployment(
  engagementId: string
): DeploymentSummary | undefined {
  const deployment = deployments.get(engagementId);
  return deployment ? structuredClone(deployment) : undefined;
}

export function saveDeployment(
  deployment: DeploymentSummary
): DeploymentSummary {
  const saved = structuredClone(deployment);
  deployments.set(saved.engagementId, saved);
  commitMarketplaceMutation({
    eventType: "deployment.updated",
    actorType: "buyer",
    entityType: "engagement",
    entityId: saved.engagementId,
    metadata: {
      status: saved.status,
      progressPercentage: saved.progressPercentage
    }
  });
  return structuredClone(saved);
}

export function attachPaymentLinkToEngagement(input: {
  engagementId: string;
  payerId: string;
  paymentLinkId: string;
  hostedCheckoutUrl: string;
}): Engagement | undefined {
  const engagement = engagements.get(input.engagementId);
  if (!engagement) {
    return undefined;
  }

  const need = needs.get(engagement.needId);
  const now = new Date().toISOString();
  engagement.pinchPayerId = input.payerId;
  engagement.paymentLinkId = input.paymentLinkId;
  engagement.hostedCheckoutUrl = input.hostedCheckoutUrl;
  engagement.status = "payment_pending";
  engagement.paymentStatus = "awaiting_payment";
  engagement.updatedAt = now;

  if (need) {
    need.status = "payment_pending";
    need.updatedAt = now;
  }

  commitMarketplaceMutation({
    eventType: "payment_link.created",
    actorType: "buyer",
    entityType: "payment",
    entityId: engagement.id,
    metadata: {
      paymentStatus: engagement.paymentStatus
    }
  });
  return engagement;
}

export function recordAuthoritativePinchPayment(input: {
  eventId: string;
  eventType: string;
  engagementId: string;
  paymentId?: string;
  payload: unknown;
}): { engagement?: Engagement; duplicate: boolean } {
  if (processedPinchEventIds.has(input.eventId)) {
    return {
      engagement: engagements.get(input.engagementId),
      duplicate: true
    };
  }

  processedPinchEventIds.add(input.eventId);
  const receivedAt = new Date().toISOString();
  pinchWebhookEvidence.set(input.eventId, {
    ...input,
    receivedAt
  });

  const engagement = engagements.get(input.engagementId);
  if (!engagement) {
    commitMarketplaceMutation({
      eventType: "payment.unmatched",
      actorType: "payment_provider",
      entityType: "payment",
      entityId: input.engagementId,
      metadata: { eventType: input.eventType }
    });
    return { duplicate: false };
  }

  const need = needs.get(engagement.needId);
  engagement.status = "supplier_secured";
  engagement.paymentStatus = "paid";
  engagement.pinchPaymentId = input.paymentId ?? engagement.pinchPaymentId;
  engagement.localDemoPaymentId = undefined;
  engagement.paymentEvidenceProvider = "pinch";
  engagement.paymentEvidenceSource =
    input.eventType === "payment-api-reconciliation"
      ? "pinch_reconciliation"
      : "pinch_webhook";
  engagement.paymentEvidenceAuthoritative = true;
  engagement.securedAt = receivedAt;
  engagement.updatedAt = receivedAt;

  const deployment = deployments.get(engagement.id);
  if (deployment) {
    const synced = syncCommitmentPayment(
      deployment,
      engagement.paymentStatus,
      receivedAt
    );
    if (synced.changed) {
      deployments.set(engagement.id, synced.deployment);
    }
  }

  if (need) {
    need.status = "secured";
    need.updatedAt = receivedAt;
  }

  commitMarketplaceMutation({
    eventType: "payment.secured",
    actorType: "payment_provider",
    entityType: "payment",
    entityId: engagement.id,
    metadata: {
      eventType: input.eventType,
      paymentStatus: engagement.paymentStatus
    }
  });
  return { engagement, duplicate: false };
}

export function recordLocalDemoPayment(input: {
  eventId: string;
  eventType: string;
  engagementId: string;
  paymentId: string;
  payload: unknown;
}): { engagement?: Engagement; duplicate: boolean } {
  if (localDemoPaymentEvidence.has(input.eventId)) {
    return {
      engagement: engagements.get(input.engagementId),
      duplicate: true
    };
  }

  const receivedAt = new Date().toISOString();
  localDemoPaymentEvidence.set(input.eventId, {
    provider: "local_demo",
    source: "local_demo",
    authoritative: false,
    ...input,
    receivedAt
  });

  const engagement = engagements.get(input.engagementId);
  if (!engagement) {
    commitMarketplaceMutation({
      eventType: "payment.local_demo_unmatched",
      actorType: "system",
      actorId: "local_demo",
      entityType: "payment",
      entityId: input.engagementId,
      metadata: {
        provider: "local_demo",
        source: "local_demo",
        authoritative: false,
        eventType: input.eventType
      }
    });
    return { duplicate: false };
  }

  const need = needs.get(engagement.needId);
  engagement.status = "supplier_secured";
  engagement.paymentStatus = "paid";
  engagement.pinchPaymentId = undefined;
  engagement.localDemoPaymentId = input.paymentId;
  engagement.paymentEvidenceProvider = "local_demo";
  engagement.paymentEvidenceSource = "local_demo";
  engagement.paymentEvidenceAuthoritative = false;
  engagement.securedAt = receivedAt;
  engagement.updatedAt = receivedAt;

  const deployment = deployments.get(engagement.id);
  if (deployment) {
    const synced = syncCommitmentPayment(
      deployment,
      engagement.paymentStatus,
      receivedAt
    );
    if (synced.changed) {
      deployments.set(engagement.id, synced.deployment);
    }
  }

  if (need) {
    need.status = "secured";
    need.updatedAt = receivedAt;
  }

  commitMarketplaceMutation({
    eventType: "payment.local_demo_secured",
    actorType: "system",
    actorId: "local_demo",
    entityType: "payment",
    entityId: engagement.id,
    metadata: {
      provider: "local_demo",
      source: "local_demo",
      authoritative: false,
      eventType: input.eventType,
      paymentStatus: engagement.paymentStatus
    }
  });
  return { engagement, duplicate: false };
}

export function resetMarketplaceStore(options: { preserveAudit?: boolean } = {}) {
  needs.clear();
  researchResults.clear();
  solutionDecisions.clear();
  supplierLeads.clear();
  invitations.clear();
  supplierClaims.clear();
  outreachDeliveries.clear();
  responses.clear();
  engagements.clear();
  deployments.clear();
  processedPinchEventIds.clear();
  pinchWebhookEvidence.clear();
  localDemoPaymentEvidence.clear();
  issuedBuyerAccessTokens.clear();
  if (!options.preserveAudit) {
    auditEvents.splice(0);
  }
  commitMarketplaceMutation({
    eventType: "marketplace.reset",
    actorType: "system",
    entityType: "need",
    entityId: "marketplace",
    metadata: {}
  });
}

export function reloadMarketplaceStore(
  filePath = env.MARKETPLACE_DATA_FILE
): boolean {
  const snapshot = loadMarketplaceSnapshot(filePath);
  if (!snapshot) {
    return false;
  }

  replaceMap(
    needs,
    snapshot.needs.map((need) => [need.id, need])
  );
  replaceMap(
    researchResults,
    snapshot.researchResults.map((result) => [
      result.needProfileId,
      result
    ])
  );
  replaceMap(
    solutionDecisions,
    snapshot.solutionDecisions.map((decision) => [
      decision.needProfileId,
      decision
    ])
  );
  replaceMap(
    supplierLeads,
    snapshot.supplierLeads.map((lead) => [lead.id, lead])
  );
  replaceMap(
    invitations,
    snapshot.invitations.map((invitation) => [
      invitation.token,
      invitation
    ])
  );
  relinkNeedInvitations();
  replaceMap(
    supplierClaims,
    snapshot.supplierClaims.map((claim) => [claim.token, claim])
  );
  replaceMap(
    outreachDeliveries,
    snapshot.outreachDeliveries.map((delivery) => [
      deliveryKey(delivery.invitationId, delivery.channel),
      delivery
    ])
  );
  replaceMap(
    responses,
    snapshot.responses.map((response) => [response.id, response])
  );
  replaceMap(
    engagements,
    snapshot.engagements.map((engagement) => [
      engagement.id,
      engagement
    ])
  );
  replaceMap(
    deployments,
    snapshot.deployments.map((deployment) => [
      deployment.engagementId,
      deployment
    ])
  );
  processedPinchEventIds.clear();
  for (const eventId of snapshot.processedPinchEventIds) {
    processedPinchEventIds.add(eventId);
  }
  replaceMap(
    pinchWebhookEvidence,
    snapshot.pinchWebhookEvidence.map((evidence) => [
      evidence.eventId,
      evidence
    ])
  );
  replaceMap(
    localDemoPaymentEvidence,
    snapshot.localDemoPaymentEvidence.map((evidence) => [
      evidence.eventId,
      evidence
    ])
  );
  auditEvents.splice(0, auditEvents.length, ...snapshot.auditEvents);
  issuedBuyerAccessTokens.clear();
  return true;
}

function secureAccessToken() {
  return randomBytes(32).toString("base64url");
}

function accessTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function commitMarketplaceMutation(
  event: Omit<MarketplaceAuditEvent, "id" | "occurredAt">
) {
  auditEvents.push({
    ...event,
    id: randomUUID(),
    occurredAt: new Date().toISOString()
  });
  if (auditEvents.length > 1000) {
    auditEvents.splice(0, auditEvents.length - 1000);
  }
  persistMarketplaceState();
}

function persistMarketplaceState() {
  saveMarketplaceSnapshot(env.MARKETPLACE_DATA_FILE, {
    version: 2,
    needs: [...needs.values()],
    researchResults: [...researchResults.values()],
    solutionDecisions: [...solutionDecisions.values()],
    supplierLeads: [...supplierLeads.values()],
    invitations: [...invitations.values()],
    supplierClaims: [...supplierClaims.values()],
    outreachDeliveries: [...outreachDeliveries.values()],
    responses: [...responses.values()],
    engagements: [...engagements.values()],
    deployments: [...deployments.values()],
    processedPinchEventIds: [...processedPinchEventIds],
    pinchWebhookEvidence: [...pinchWebhookEvidence.values()],
    localDemoPaymentEvidence: [...localDemoPaymentEvidence.values()],
    auditEvents
  });
}

function replaceMap<K, V>(target: Map<K, V>, entries: Array<[K, V]>) {
  target.clear();
  for (const [key, value] of entries) {
    target.set(key, value);
  }
}

function relinkNeedInvitations() {
  const invitationsByNeed = new Map<string, SupplierInvitation[]>();
  for (const invitation of invitations.values()) {
    const existing = invitationsByNeed.get(invitation.needId) ?? [];
    existing.push(invitation);
    invitationsByNeed.set(invitation.needId, existing);
  }

  for (const need of needs.values()) {
    const canonical = invitationsByNeed.get(need.id) ?? [];
    const canonicalById = new Map(
      canonical.map((invitation) => [invitation.id, invitation])
    );
    const linked = need.invitations.flatMap((invitation) => {
      const persisted = canonicalById.get(invitation.id);
      if (!persisted) return [];
      canonicalById.delete(invitation.id);
      return [persisted];
    });
    need.invitations = [...linked, ...canonicalById.values()];
  }
}
