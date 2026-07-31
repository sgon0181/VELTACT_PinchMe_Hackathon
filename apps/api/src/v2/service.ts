import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual
} from "node:crypto";
import type {
  MarketplaceNeedProfile,
  PaymentEvidence,
  ProjectMilestone,
  ProjectTaskStatus,
  SolutionDecisionType,
  SupplierCommercialResponse,
  SupplierLead,
  SupplierLifecycleStatus,
  SupplierOutreachDelivery,
  SupplierProfile
} from "@veltact/contracts";
import { env } from "../env.js";
import {
  getOutreachDeliveryReadiness,
  sendSupplierOpportunity
} from "../marketplace/outreachDelivery.js";
import { registerActivatedSupplier } from "../marketplace/suppliers.js";
import type {
  NeedRecord,
  SupplierInvitation as LegacySupplierInvitation
} from "../marketplace/types.js";
import { isLocalDemoHostedPaymentLink } from "../payments/localDemoPaymentProvider.js";
import { getPaymentProvider } from "../payments/providerRegistry.js";
import { createFixtureResearch, createFixtureSupplierLeads } from "./fixtures.js";
import { createIndustrialProject } from "./projectTemplates.js";
import {
  AtomicV2Repository,
  type V2NeedRecord,
  type VeltactV2Snapshot
} from "./repository.js";
import { discoverSuppliers, researchSolutions } from "./providers.js";

type SupplierCommercialResponseInput =
  | Omit<
      Extract<SupplierCommercialResponse, { decision: "can_help" }>,
      | "id"
      | "needProfileId"
      | "supplierLeadId"
      | "supplierProfileId"
      | "submittedAt"
    >
  | Omit<
      Extract<SupplierCommercialResponse, { decision: "cannot_help" }>,
      | "id"
      | "needProfileId"
      | "supplierLeadId"
      | "supplierProfileId"
      | "submittedAt"
    >;

type PaymentRecordInput = {
  projectId: string;
  milestoneId: string;
  eventId: string;
  eventType: string;
  paymentId?: string;
};

type PaymentAuthority =
  | {
      provider: "pinch";
      authoritative: true;
    }
  | {
      provider: "local_demo";
      authoritative: false;
    };

export class V2ServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: 400 | 401 | 404 | 409 | 502 = 400
  ) {
    super(message);
    this.name = "V2ServiceError";
  }
}

export class VeltactV2Service {
  constructor(private readonly repository: AtomicV2Repository) {
    const snapshot = repository.snapshot();
    for (const lead of snapshot.supplierLeads) {
      if (lead.lifecycleStatus !== "active_supplier") continue;
      const profile = snapshot.supplierProfiles.find(
        (candidate) => candidate.supplierLeadId === lead.id
      );
      if (profile) registerActivatedSupplier(profile);
    }
  }

  async createNeed(input: {
    buyerEmail: string;
    buyerName: string;
    companyName: string;
    profile: MarketplaceNeedProfile;
  }) {
    const buyerAccessToken = secureToken();
    const now = new Date().toISOString();
    const need: V2NeedRecord = {
      id: randomUUID(),
      buyerEmail: input.buyerEmail,
      buyerName: input.buyerName,
      companyName: input.companyName,
      buyerAccessTokenHash: tokenHash(buyerAccessToken),
      profile: input.profile,
      createdAt: now,
      updatedAt: now
    };
    await this.repository.mutate((draft) => {
      draft.needs.push(need);
    });
    return { need, buyerAccessToken };
  }

  async getWorkspace(needId: string, buyerAccessToken: string | undefined) {
    await this.expireStaleSupplierClaimsForNeed(
      needId,
      buyerAccessToken
    );
    const snapshot = this.repository.snapshot();
    const need = this.requireBuyer(snapshot, needId, buyerAccessToken);
    const leadIds = new Set(
      snapshot.supplierLeads
        .filter((lead) => lead.needProfileId === needId)
        .map((lead) => lead.id)
    );
    const supplierInvitations = snapshot.supplierInvitations
      .filter((invitation) => leadIds.has(invitation.supplierId))
      .reverse()
      .sort(
        (left, right) =>
          Date.parse(right.createdAt) - Date.parse(left.createdAt)
      );
    const currentSupplierIds = new Set<string>();
    const currentSupplierInvitations = supplierInvitations.filter(
      (invitation) => {
        if (currentSupplierIds.has(invitation.supplierId)) return false;
        currentSupplierIds.add(invitation.supplierId);
        return true;
      }
    );
    const currentInvitationIds = new Set(
      currentSupplierInvitations.map((invitation) => invitation.id)
    );
    return {
      need: publicNeed(need),
      researchResult: snapshot.researchResults.find(
        (result) => result.needProfileId === needId
      ),
      solutionDecision: snapshot.solutionDecisions.find(
        (decision) => decision.needProfileId === needId
      ),
      supplierLeads: snapshot.supplierLeads.filter(
        (lead) => lead.needProfileId === needId
      ),
      supplierInvitations: currentSupplierInvitations
        .map(({ token: _token, ...invitation }) => invitation),
      outreachDeliveries: snapshot.outreachDeliveries.filter(
        (delivery) =>
          leadIds.has(delivery.supplierId) &&
          currentInvitationIds.has(delivery.invitationId)
      ),
      supplierProfiles: snapshot.supplierProfiles.filter((profile) =>
        leadIds.has(profile.supplierLeadId)
      ),
      supplierResponses: snapshot.supplierResponses.filter(
        (response) => response.needProfileId === needId
      ),
      projects: snapshot.projects.filter(
        (project) => project.needProfileId === needId
      ),
      paymentEvidence: snapshot.paymentEvidence.filter((evidence) =>
        snapshot.projects.some(
          (project) =>
            project.needProfileId === needId && project.id === evidence.projectId
        )
      ),
      revision: snapshot.revision
    };
  }

  async researchNeed(needId: string, buyerAccessToken: string | undefined) {
    const snapshot = this.repository.snapshot();
    const need = this.requireBuyer(snapshot, needId, buyerAccessToken);
    const existing = snapshot.researchResults.find(
      (result) => result.needProfileId === needId
    );
    if (existing) return { researchResult: existing };

    const execution = await researchSolutions(needId, need.profile);
    await this.repository.mutate((draft) => {
      if (
        !draft.researchResults.some(
          (result) => result.needProfileId === needId
        )
      ) {
        draft.researchResults.push(execution.value);
      }
    });
    return {
      researchResult: execution.value,
      providerWarning: execution.warning
    };
  }

  async decideSolution(
    needId: string,
    buyerAccessToken: string | undefined,
    input: {
      decision: SolutionDecisionType;
      selectedApproachIds: string[];
      buyerNote?: string;
    }
  ) {
    return this.repository.mutate((draft) => {
      const need = this.requireBuyer(draft, needId, buyerAccessToken);
      const research = draft.researchResults.find(
        (result) => result.needProfileId === needId
      );
      if (!research) {
        throw new V2ServiceError("Research must be completed before a decision", 409);
      }
      const validApproachIds = new Set(
        research.approaches.map((approach) => approach.id)
      );
      if (
        input.selectedApproachIds.length === 0 ||
        input.selectedApproachIds.some((id) => !validApproachIds.has(id))
      ) {
        throw new V2ServiceError(
          "Select at least one approach from the current research result"
        );
      }
      const now = new Date().toISOString();
      const decision = {
        id: randomUUID(),
        needProfileId: needId,
        researchResultId: research.id,
        decision: input.decision,
        selectedApproachIds: input.selectedApproachIds,
        buyerNote: input.buyerNote,
        approvedBy: need.buyerEmail,
        approvedAt: now
      };
      draft.solutionDecisions = draft.solutionDecisions.filter(
        (candidate) => candidate.needProfileId !== needId
      );
      draft.solutionDecisions.push(decision);
      return decision;
    });
  }

  async discoverNeedSuppliers(
    needId: string,
    buyerAccessToken: string | undefined
  ) {
    const snapshot = this.repository.snapshot();
    const need = this.requireBuyer(snapshot, needId, buyerAccessToken);
    const decision = snapshot.solutionDecisions.find(
      (candidate) => candidate.needProfileId === needId
    );
    if (!decision) {
      throw new V2ServiceError(
        "Approve a solution path before discovering suppliers",
        409
      );
    }
    if (decision.decision === "local_trial") {
      throw new V2ServiceError(
        "Supplier discovery requires an outsource or hybrid decision",
        409
      );
    }
    const existing = snapshot.supplierLeads.filter(
      (lead) => lead.needProfileId === needId
    );
    if (existing.length > 0) return { supplierLeads: existing };

    const research = snapshot.researchResults.find(
      (result) => result.needProfileId === needId
    );
    const capabilities = [
      ...new Set(
        research?.approaches
          .filter((approach) =>
            decision.selectedApproachIds.includes(approach.id)
          )
          .flatMap((approach) => approach.requiredCapabilities) ??
          need.profile.requiredCapabilities ??
          []
      )
    ];
    const execution = await discoverSuppliers(
      needId,
      need.profile,
      capabilities
    );
    await this.repository.mutate((draft) => {
      if (
        !draft.supplierLeads.some((lead) => lead.needProfileId === needId)
      ) {
        draft.supplierLeads.push(...execution.value);
      }
    });
    return {
      supplierLeads: execution.value,
      providerWarning: execution.warning
    };
  }

  async approveSupplierLeads(
    needId: string,
    buyerAccessToken: string | undefined,
    supplierLeadIds: string[]
  ) {
    return this.repository.mutate((draft) => {
      this.requireBuyer(draft, needId, buyerAccessToken);
      const selected = draft.supplierLeads.filter(
        (lead) =>
          lead.needProfileId === needId && supplierLeadIds.includes(lead.id)
      );
      if (selected.length !== new Set(supplierLeadIds).size) {
        throw new V2ServiceError("One or more supplier leads were not found", 404);
      }
      const now = new Date().toISOString();
      for (const lead of selected) {
        if (lead.lifecycleStatus === "discovered") {
          transitionLead(lead, "approved_for_outreach");
          lead.approvedForOutreachAt = now;
          lead.updatedAt = now;
        } else if (
          ![
            "approved_for_outreach",
            "invited",
            "claimed",
            "supplier_profile_approved",
            "buyer_approved",
            "active_supplier"
          ].includes(lead.lifecycleStatus)
        ) {
          throw new V2ServiceError(
            `${lead.companyName} cannot be approved from ${lead.lifecycleStatus}`,
            409
          );
        }
      }
      return selected;
    });
  }

  async inviteApprovedSuppliers(
    needId: string,
    buyerAccessToken: string | undefined,
    supplierLeadIds: string[]
  ) {
    await this.expireStaleSupplierClaimsForNeed(
      needId,
      buyerAccessToken
    );
    const prepared = await this.repository.mutate((draft) => {
      const need = this.requireBuyer(draft, needId, buyerAccessToken);
      const leads = draft.supplierLeads.filter(
        (lead) =>
          lead.needProfileId === needId && supplierLeadIds.includes(lead.id)
      );
      if (leads.length !== new Set(supplierLeadIds).size) {
        throw new V2ServiceError("One or more supplier leads were not found", 404);
      }
      const now = new Date();
      return leads.map((lead) => {
        if (
          !["approved_for_outreach", "invited"].includes(lead.lifecycleStatus)
        ) {
          throw new V2ServiceError(
            `${lead.companyName} requires buyer outreach approval`,
            409
          );
        }
        let invitation = draft.supplierInvitations
          .filter(
            (candidate) =>
              candidate.supplierId === lead.id &&
              ["pending", "sent", "opened"].includes(candidate.status) &&
              Date.parse(candidate.expiresAt) > now.getTime()
          )
          .reverse()
          .sort(
            (left, right) =>
              Date.parse(right.createdAt) - Date.parse(left.createdAt)
          )[0];
        if (!invitation) {
          const token = secureToken();
          const createdAt = now.toISOString();
          const previousClaim = draft.supplierClaims
            .filter(
              (candidate) =>
                candidate.supplierLeadId === lead.id &&
                candidate.status === "expired"
            )
            .reverse()
            .sort(
              (left, right) =>
                Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
            )[0];
          const resumeClaim = Boolean(
            previousClaim?.claimedAt &&
              previousClaim.claimantName &&
              previousClaim.claimantEmail
          );
          invitation = {
            id: randomUUID(),
            needProfileId: needId,
            supplierId: lead.id,
            matchId: lead.id,
            token,
            responseUrl: new URL(
              `/supplier-claim.html?token=${encodeURIComponent(token)}`,
              env.PUBLIC_BASE_URL
            ).toString(),
            status: "pending",
            expiresAt: new Date(
              now.getTime() + 7 * 24 * 60 * 60 * 1000
            ).toISOString(),
            createdAt,
            updatedAt: createdAt
          };
          draft.supplierInvitations.push(invitation);
          draft.supplierClaims.push({
            id: randomUUID(),
            supplierLeadId: lead.id,
            invitationId: invitation.id,
            token,
            status: resumeClaim ? "claimed" : "pending",
            claimantName: resumeClaim
              ? previousClaim?.claimantName
              : undefined,
            claimantEmail: resumeClaim
              ? previousClaim?.claimantEmail
              : undefined,
            claimedAt: resumeClaim ? previousClaim?.claimedAt : undefined,
            expiresAt: invitation.expiresAt,
            createdAt,
            updatedAt: createdAt
          });
          for (const delivery of createDeliveries(invitation.id, lead)) {
            draft.outreachDeliveries.push(delivery);
          }
        }
        return {
          need: structuredClone(need),
          lead: structuredClone(lead),
          invitation: structuredClone(invitation)
        };
      });
    });

    for (const item of prepared) {
      await this.deliverInvitation(item.need, item.lead, item.invitation.id);
    }
    const workspace = await this.getWorkspace(needId, buyerAccessToken);
    return {
      supplierInvitations: workspace.supplierInvitations,
      outreachDeliveries: workspace.outreachDeliveries,
      supplierLeads: workspace.supplierLeads
    };
  }

  async openSupplierClaim(token: string) {
    const snapshot = this.repository.snapshot();
    const claim = snapshot.supplierClaims.find(
      (candidate) => candidate.token === token
    );
    if (!claim) throw new V2ServiceError("Supplier claim not found", 404);
    if (
      claim.status === "expired" ||
      Date.parse(claim.expiresAt) <= Date.now()
    ) {
      await this.repository.mutate((draft) => {
        const expiredClaim = draft.supplierClaims.find(
          (candidate) => candidate.token === token
        );
        if (expiredClaim) expireSupplierClaimAccess(
          draft,
          expiredClaim,
          new Date().toISOString()
        );
      });
      throw new V2ServiceError("Supplier claim has expired", 409);
    }
    const invitation = snapshot.supplierInvitations.find(
      (candidate) => candidate.id === claim.invitationId
    );
    if (invitation && ["pending", "sent"].includes(invitation.status)) {
      await this.repository.mutate((draft) => {
        const current = draft.supplierInvitations.find(
          (candidate) => candidate.id === claim.invitationId
        );
        if (current && ["pending", "sent"].includes(current.status)) {
          current.status = "opened";
          current.updatedAt = new Date().toISOString();
        }
      });
    }
    return this.getSupplierClaim(token);
  }

  getSupplierClaim(token: string) {
    const snapshot = this.repository.snapshot();
    const claim = snapshot.supplierClaims.find(
      (candidate) => candidate.token === token
    );
    if (!claim) throw new V2ServiceError("Supplier claim not found", 404);
    const lead = snapshot.supplierLeads.find(
      (candidate) => candidate.id === claim.supplierLeadId
    );
    const invitation = snapshot.supplierInvitations.find(
      (candidate) => candidate.id === claim.invitationId
    );
    const need = lead
      ? snapshot.needs.find((candidate) => candidate.id === lead.needProfileId)
      : undefined;
    if (!lead || !invitation || !need) {
      throw new V2ServiceError("Supplier claim data is incomplete", 404);
    }
    const profile = snapshot.supplierProfiles.find(
      (candidate) => candidate.supplierLeadId === lead.id
    );
    const response = snapshot.supplierResponses.find(
      (candidate) => candidate.supplierLeadId === lead.id
    );
    return {
      claim: withoutClaimToken(claim),
      invitation: { ...invitation, token: undefined },
      lead,
      need: {
        id: need.id,
        companyName: need.companyName,
        profile: need.profile
      },
      supplierProfile: profile,
      supplierResponse: response
    };
  }

  async claimSupplierInvitation(
    token: string,
    input: {
      claimantName: string;
      claimantEmail: string;
    }
  ) {
    return this.repository.mutate((draft) => {
      const claim = requireLiveClaim(draft, token);
      const lead = requireLead(draft, claim.supplierLeadId);
      if (!["invited", "claimed"].includes(lead.lifecycleStatus)) {
        throw new V2ServiceError(
          `Supplier invitation cannot be claimed from ${lead.lifecycleStatus}`,
          409
        );
      }
      const now = new Date().toISOString();
      if (lead.lifecycleStatus === "invited") transitionLead(lead, "claimed");
      lead.claimedAt = lead.claimedAt ?? now;
      lead.updatedAt = now;
      claim.status = "claimed";
      claim.claimantName = input.claimantName;
      claim.claimantEmail = input.claimantEmail;
      claim.claimedAt = claim.claimedAt ?? now;
      claim.updatedAt = now;
      return withoutClaimToken(claim);
    });
  }

  async submitSupplierProfile(
    token: string,
    input: Omit<
      SupplierProfile,
      | "id"
      | "supplierLeadId"
      | "sourceDisclosure"
      | "supplierApprovedAt"
      | "buyerApprovedAt"
      | "activeAt"
      | "createdAt"
      | "updatedAt"
    >
  ) {
    return this.repository.mutate((draft) => {
      const claim = requireLiveClaim(draft, token);
      const lead = requireLead(draft, claim.supplierLeadId);
      if (!["invited", "claimed", "supplier_profile_approved"].includes(
        lead.lifecycleStatus
      )) {
        throw new V2ServiceError(
          `Supplier profile cannot be submitted from ${lead.lifecycleStatus}`,
          409
        );
      }
      const now = new Date().toISOString();
      if (lead.lifecycleStatus === "invited") transitionLead(lead, "claimed");
      if (lead.lifecycleStatus === "claimed") {
        transitionLead(lead, "supplier_profile_approved");
      }
      lead.claimedAt = lead.claimedAt ?? now;
      lead.updatedAt = now;
      claim.status = "claimed";
      claim.claimantName = input.contactName;
      claim.claimantEmail = input.contactEmail;
      claim.claimedAt = claim.claimedAt ?? now;
      claim.updatedAt = now;

      const existing = draft.supplierProfiles.find(
        (candidate) => candidate.supplierLeadId === lead.id
      );
      const profile: SupplierProfile = {
        id: existing?.id ?? randomUUID(),
        supplierLeadId: lead.id,
        ...input,
        sourceDisclosure:
          "Profile drafted from public discovery evidence, then reviewed and approved by the supplier. Independent verification is not implied.",
        supplierApprovedAt: now,
        buyerApprovedAt: existing?.buyerApprovedAt,
        activeAt: existing?.activeAt,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      };
      draft.supplierProfiles = draft.supplierProfiles.filter(
        (candidate) => candidate.supplierLeadId !== lead.id
      );
      draft.supplierProfiles.push(profile);
      return profile;
    });
  }

  async buyerApproveSupplierProfile(
    needId: string,
    buyerAccessToken: string | undefined,
    supplierLeadId: string
  ) {
    return this.repository.mutate((draft) => {
      this.requireBuyer(draft, needId, buyerAccessToken);
      const lead = requireLead(draft, supplierLeadId);
      if (lead.needProfileId !== needId) {
        throw new V2ServiceError("Supplier lead was not found for this need", 404);
      }
      if (lead.lifecycleStatus === "supplier_profile_approved") {
        transitionLead(lead, "buyer_approved");
      } else if (lead.lifecycleStatus !== "buyer_approved") {
        throw new V2ServiceError(
          "The supplier must claim and approve its profile first",
          409
        );
      }
      const profile = requireProfile(draft, supplierLeadId);
      const now = new Date().toISOString();
      profile.buyerApprovedAt = profile.buyerApprovedAt ?? now;
      profile.updatedAt = now;
      lead.updatedAt = now;
      return { lead, profile };
    });
  }

  async activateSupplier(
    needId: string,
    buyerAccessToken: string | undefined,
    supplierLeadId: string
  ) {
    const result = await this.repository.mutate((draft) => {
      this.requireBuyer(draft, needId, buyerAccessToken);
      const lead = requireLead(draft, supplierLeadId);
      if (lead.needProfileId !== needId) {
        throw new V2ServiceError("Supplier lead was not found for this need", 404);
      }
      if (lead.lifecycleStatus === "buyer_approved") {
        transitionLead(lead, "active_supplier");
      } else if (lead.lifecycleStatus !== "active_supplier") {
        throw new V2ServiceError(
          "Buyer approval is required before supplier activation",
          409
        );
      }
      const profile = requireProfile(draft, supplierLeadId);
      const now = new Date().toISOString();
      profile.activeAt = profile.activeAt ?? now;
      profile.updatedAt = now;
      lead.updatedAt = now;
      lead.activatedSupplierId = `v2-${profile.id}`;
      return { lead, profile };
    });
    registerActivatedSupplier(result.profile);
    return result;
  }

  async submitSupplierResponse(
    token: string,
    input: SupplierCommercialResponseInput
  ) {
    return this.repository.mutate((draft) => {
      const claim = requireLiveClaim(draft, token);
      const lead = requireLead(draft, claim.supplierLeadId);
      if (claim.status !== "claimed") {
        throw new V2ServiceError(
          "Claim the supplier invitation before submitting a response",
          409
        );
      }
      const now = new Date().toISOString();
      const existing = draft.supplierResponses.find(
        (candidate) => candidate.supplierLeadId === lead.id
      );
      let supplierResponse: SupplierCommercialResponse;
      if (input.decision === "can_help") {
        if (
          ![
            "supplier_profile_approved",
            "buyer_approved",
            "active_supplier"
          ].includes(lead.lifecycleStatus)
        ) {
          throw new V2ServiceError(
            "The supplier must confirm its profile before a commercial response",
            409
          );
        }
        if (input.indicativePrice.amount <= 0) {
          throw new V2ServiceError(
            "Enter an indicative price greater than AUD 0."
          );
        }
        const profile = requireProfile(draft, lead.id);
        supplierResponse = {
          id: existing?.id ?? randomUUID(),
          needProfileId: lead.needProfileId,
          supplierLeadId: lead.id,
          supplierProfileId: profile.id,
          ...input,
          submittedAt: now
        };
      } else {
        if (
          ![
            "claimed",
            "supplier_profile_approved",
            "buyer_approved"
          ].includes(lead.lifecycleStatus)
        ) {
          throw new V2ServiceError(
            `Supplier response cannot be declined from ${lead.lifecycleStatus}`,
            409
          );
        }
        const profile = draft.supplierProfiles.find(
          (candidate) => candidate.supplierLeadId === lead.id
        );
        supplierResponse = {
          id: existing?.id ?? randomUUID(),
          needProfileId: lead.needProfileId,
          supplierLeadId: lead.id,
          supplierProfileId: profile?.id,
          ...input,
          submittedAt: now
        };
        transitionLead(lead, "declined");
        lead.updatedAt = now;
      }
      draft.supplierResponses = draft.supplierResponses.filter(
        (candidate) => candidate.supplierLeadId !== lead.id
      );
      draft.supplierResponses.push(supplierResponse);
      const invitation = draft.supplierInvitations.find(
        (candidate) => candidate.id === claim.invitationId
      );
      if (invitation) {
        invitation.status = "responded";
        invitation.updatedAt = now;
      }
      return supplierResponse;
    });
  }

  async selectSupplierResponse(
    needId: string,
    buyerAccessToken: string | undefined,
    supplierResponseId: string
  ) {
    const result = await this.repository.mutate((draft) => {
      const need = this.requireBuyer(draft, needId, buyerAccessToken);
      const response = draft.supplierResponses.find(
        (candidate) =>
          candidate.id === supplierResponseId &&
          candidate.needProfileId === needId
      );
      if (!response) {
        throw new V2ServiceError("Supplier response not found", 404);
      }
      if (response.decision !== "can_help") {
        throw new V2ServiceError(
          "Only a supplier who can help may be selected",
          409
        );
      }
      const profile = draft.supplierProfiles.find(
        (candidate) => candidate.id === response.supplierProfileId
      );
      if (!profile) throw new V2ServiceError("Supplier profile not found", 404);
      const existingProject = draft.projects.find(
        (project) => project.needProfileId === needId
      );
      if (existingProject) {
        return { project: existingProject, profile, activated: false };
      }
      const lead = requireLead(draft, response.supplierLeadId);
      if (lead.needProfileId !== needId) {
        throw new V2ServiceError("Supplier lead was not found for this need", 404);
      }
      if (lead.lifecycleStatus === "supplier_profile_approved") {
        transitionLead(lead, "buyer_approved");
      }
      if (lead.lifecycleStatus === "buyer_approved") {
        transitionLead(lead, "active_supplier");
      } else if (lead.lifecycleStatus !== "active_supplier") {
        throw new V2ServiceError(
          "Only a supplier-confirmed response may be selected",
          409
        );
      }

      const now = new Date().toISOString();
      profile.buyerApprovedAt = profile.buyerApprovedAt ?? now;
      profile.activeAt = profile.activeAt ?? now;
      profile.updatedAt = now;
      lead.updatedAt = now;
      lead.activatedSupplierId = lead.activatedSupplierId ?? `v2-${profile.id}`;

      const project = createIndustrialProject({
        needProfileId: needId,
        profile: need.profile,
        supplierLeadId: response.supplierLeadId,
        supplierProfile: profile,
        supplierResponse: response,
        buyerName: need.buyerName,
        buyerEmail: need.buyerEmail
      });
      need.selectedSupplierResponseId = response.id;
      need.updatedAt = now;
      draft.projects.push(project);
      return { project, profile, activated: true };
    });
    if (result.activated) {
      registerActivatedSupplier(result.profile);
    }
    return result.project;
  }

  async updateProjectTask(
    projectId: string,
    buyerAccessToken: string | undefined,
    taskId: string,
    status: ProjectTaskStatus
  ) {
    return this.repository.mutate((draft) => {
      const project = requireProject(draft, projectId);
      this.requireBuyer(draft, project.needProfileId, buyerAccessToken);
      const task = project.tasks.find((candidate) => candidate.id === taskId);
      if (!task) throw new V2ServiceError("Project task not found", 404);
      const now = new Date().toISOString();
      task.status = status;
      task.updatedAt = now;
      project.updatedAt = now;
      project.activities.unshift({
        id: randomUUID(),
        projectId,
        eventType: "task.updated",
        summary: `${task.title} changed to ${status.replaceAll("_", " ")}.`,
        actor: "Buyer workspace",
        occurredAt: now
      });
      return project;
    });
  }

  async acceptMilestone(
    projectId: string,
    buyerAccessToken: string | undefined,
    milestoneId: string
  ) {
    return this.repository.mutate((draft) => {
      const project = requireProject(draft, projectId);
      this.requireBuyer(draft, project.needProfileId, buyerAccessToken);
      const milestone = requireMilestone(project.milestones, milestoneId);
      if (!["funded", "in_progress", "awaiting_acceptance"].includes(
        milestone.status
      )) {
        throw new V2ServiceError(
          "Milestone must be funded before acceptance",
          409
        );
      }
      const now = new Date().toISOString();
      for (const criterion of milestone.acceptanceCriteria) {
        criterion.accepted = true;
        criterion.acceptedAt = now;
        criterion.evidenceNote =
          criterion.evidenceNote ?? "Accepted by buyer in the Veltact workspace.";
      }
      milestone.status = "accepted";
      milestone.acceptedAt = now;
      milestone.updatedAt = now;
      const next = project.milestones.find(
        (candidate) => candidate.sequence === milestone.sequence + 1
      );
      if (next && dependenciesAccepted(project, next)) {
        next.status = "awaiting_payment";
        next.updatedAt = now;
      }
      if (project.milestones.every((candidate) => candidate.status === "accepted")) {
        project.status = "completed";
      }
      project.updatedAt = now;
      project.activities.unshift({
        id: randomUUID(),
        projectId,
        eventType: "milestone.accepted",
        summary: `${milestone.title} accepted by the buyer.`,
        actor: "Buyer workspace",
        occurredAt: now
      });
      return project;
    });
  }

  async createMilestonePaymentLink(
    projectId: string,
    buyerAccessToken: string | undefined,
    milestoneId: string
  ) {
    const snapshot = this.repository.snapshot();
    const project = requireProject(snapshot, projectId);
    const need = this.requireBuyer(
      snapshot,
      project.needProfileId,
      buyerAccessToken
    );
    const milestone = requireMilestone(project.milestones, milestoneId);
    if (
      !["awaiting_payment", "payment_failed"].includes(milestone.status)
    ) {
      throw new V2ServiceError(
        "This milestone is not ready for a payment link",
        409
      );
    }
    if (milestone.hostedCheckoutUrl && milestone.paymentLinkId) {
      return milestone;
    }
    const link = await getPaymentProvider().createHostedPaymentLink({
      engagementId: `milestone:${milestone.id}`,
      needId: need.id,
      supplierId: project.supplierLeadId,
      buyerEmail: need.buyerEmail,
      buyerName: need.buyerName,
      amount: milestone.amount.amount,
      currency: milestone.amount.currency,
      description: `${project.title}: ${milestone.title}`,
      returnUrl: new URL(
        `/v2.html?needId=${encodeURIComponent(need.id)}&projectId=${encodeURIComponent(project.id)}&payment_return=1`,
        env.PUBLIC_BASE_URL
      ).toString(),
      metadata: {
        veltactFlow: "v2_milestone",
        projectId: project.id,
        milestoneId: milestone.id,
        templateType: project.templateType,
        commitmentType: "commercial_commitment",
        commitmentAmountMinor: String(milestone.amount.amount),
        commitmentCurrency: milestone.amount.currency
      }
    });
    return this.repository.mutate((draft) => {
      const currentProject = requireProject(draft, projectId);
      const current = requireMilestone(currentProject.milestones, milestoneId);
      const now = new Date().toISOString();
      current.paymentLinkId = link.paymentLinkId;
      current.hostedCheckoutUrl = link.hostedCheckoutUrl;
      current.pinchPayerId = link.payerId;
      current.paymentStatus = "awaiting_payment";
      current.status = "awaiting_payment";
      current.updatedAt = now;
      currentProject.updatedAt = now;
      return current;
    });
  }

  async reconcileMilestonePayment(
    projectId: string,
    buyerAccessToken: string | undefined,
    milestoneId: string
  ) {
    const snapshot = this.repository.snapshot();
    const project = requireProject(snapshot, projectId);
    this.requireBuyer(snapshot, project.needProfileId, buyerAccessToken);
    const milestone = requireMilestone(project.milestones, milestoneId);
    if (!milestone.paymentLinkId) return milestone;
    const approved = await getPaymentProvider().getApprovedPaymentForLink(
      milestone.paymentLinkId
    );
    if (!approved) return milestone;
    await this.recordAuthoritativePayment({
      projectId,
      milestoneId,
      eventId: `pinch-api:${approved.paymentId}`,
      eventType: "payment-api-reconciliation",
      paymentId: approved.paymentId
    });
    return requireMilestone(
      requireProject(this.repository.snapshot(), projectId).milestones,
      milestoneId
    );
  }

  async recordDemoMilestonePayment(
    projectId: string,
    buyerAccessToken: string | undefined,
    milestoneId: string
  ) {
    if (
      env.NODE_ENV === "production" ||
      env.PAYMENT_PROVIDER !== "local_demo"
    ) {
      throw new V2ServiceError(
        "Local demo payment is unavailable for this payment provider",
        404
      );
    }
    const snapshot = this.repository.snapshot();
    const project = requireProject(snapshot, projectId);
    this.requireBuyer(snapshot, project.needProfileId, buyerAccessToken);
    const milestone = requireMilestone(project.milestones, milestoneId);
    if (
      milestone.paymentStatus !== "awaiting_payment" ||
      !milestone.pinchPayerId ||
      !milestone.paymentLinkId ||
      !milestone.hostedCheckoutUrl ||
      !isLocalDemoHostedPaymentLink({
        payerId: milestone.pinchPayerId,
        paymentLinkId: milestone.paymentLinkId,
        hostedCheckoutUrl: milestone.hostedCheckoutUrl
      })
    ) {
      throw new V2ServiceError(
        "Create a local demo payment link before recording demo evidence",
        409
      );
    }
    return this.recordDemoPaymentEvidence({
      projectId,
      milestoneId,
      eventId: `local-demo:${projectId}:${milestoneId}`,
      eventType: "local-demo-payment",
      paymentId: `demo_${milestoneId}`
    });
  }

  async recordPinchWebhookPayment(input: {
    projectId: string;
    milestoneId: string;
    eventId: string;
    eventType: string;
    paymentId?: string;
  }) {
    return this.recordAuthoritativePayment(input);
  }

  async createChangeRequest(
    projectId: string,
    buyerAccessToken: string | undefined,
    input: {
      title: string;
      description: string;
      impact: string;
      requestedBy: string;
    }
  ) {
    return this.repository.mutate((draft) => {
      const project = requireProject(draft, projectId);
      this.requireBuyer(draft, project.needProfileId, buyerAccessToken);
      const now = new Date().toISOString();
      const changeRequest = {
        id: randomUUID(),
        projectId,
        ...input,
        status: "submitted" as const,
        updatedAt: now
      };
      project.changeRequests.push(changeRequest);
      project.updatedAt = now;
      return changeRequest;
    });
  }

  async reset() {
    return this.repository.reset();
  }

  async seedDemo(scenario: "plc" | "robotics" = "plc") {
    await this.reset();
    const profile = demoProfile(scenario);
    const created = await this.createNeed({
      buyerEmail: "engineer@demo-factory.example",
      buyerName: "Alex Morgan",
      companyName: "Veltact Demonstration Factory",
      profile
    });
    const research = createFixtureResearch(created.need.id, profile);
    const leads = createFixtureSupplierLeads(created.need.id, profile);
    await this.repository.mutate((draft) => {
      draft.researchResults.push(research);
      draft.solutionDecisions.push({
        id: randomUUID(),
        needProfileId: created.need.id,
        researchResultId: research.id,
        decision: "hybrid",
        selectedApproachIds: research.approaches.map((approach) => approach.id),
        buyerNote:
          "Safe local evidence capture first, with specialist delivery for controlled implementation.",
        approvedBy: created.need.buyerEmail,
        approvedAt: new Date().toISOString()
      });
      draft.supplierLeads.push(...leads);
    });
    await this.approveSupplierLeads(
      created.need.id,
      created.buyerAccessToken,
      leads.map((lead) => lead.id)
    );
    await this.inviteApprovedSuppliers(
      created.need.id,
      created.buyerAccessToken,
      [leads[0].id]
    );
    const claim = this.repository
      .snapshot()
      .supplierInvitations.find((invitation) => invitation.supplierId === leads[0].id);
    return {
      needId: created.need.id,
      buyerAccessToken: created.buyerAccessToken,
      buyerUrl: new URL(
        `/v2.html?needId=${encodeURIComponent(created.need.id)}&accessToken=${encodeURIComponent(created.buyerAccessToken)}`,
        env.PUBLIC_BASE_URL
      ).toString(),
      supplierClaimUrl: claim?.responseUrl,
      scenario
    };
  }

  private requireBuyer(
    snapshot: VeltactV2Snapshot,
    needId: string,
    buyerAccessToken: string | undefined
  ) {
    const need = snapshot.needs.find((candidate) => candidate.id === needId);
    if (!need) throw new V2ServiceError("Need not found", 404);
    if (
      env.BUYER_CAPABILITY_AUTH_REQUIRED &&
      !tokensMatch(need.buyerAccessTokenHash, buyerAccessToken)
    ) {
      throw new V2ServiceError(
        "Buyer access token is required for this requirement",
        401
      );
    }
    return need;
  }

  private async deliverInvitation(
    need: V2NeedRecord,
    lead: SupplierLead,
    invitationId: string
  ) {
    const snapshot = this.repository.snapshot();
    const invitation = snapshot.supplierInvitations.find(
      (candidate) => candidate.id === invitationId
    );
    if (!invitation) return;
    const deliveries = snapshot.outreachDeliveries.filter(
      (delivery) =>
        delivery.invitationId === invitationId &&
        delivery.deliveryStatus !== "sent"
    );
    const legacyNeed: NeedRecord = {
      ...need,
      profile: need.profile,
      matches: [],
      invitations: [],
      status: "responses_open"
    };
    const legacyInvitation: LegacySupplierInvitation = {
      ...invitation,
      needId: need.id,
      supplierName: lead.companyName
    };

    let localDemoPrepared = false;
    for (const delivery of deliveries) {
      const readiness = getOutreachDeliveryReadiness(delivery);
      if (readiness.available && readiness.provider !== "local_demo") {
        await this.repository.mutate((draft) => {
          const current = draft.outreachDeliveries.find(
            (candidate) =>
              candidate.invitationId === delivery.invitationId &&
              candidate.channel === delivery.channel
          );
          if (current) {
            current.deliveryStatus = "queued";
            current.errorMessage = undefined;
          }
        });
      }
      const result = await sendSupplierOpportunity(
        delivery,
        legacyInvitation,
        legacyNeed
      );
      if (result.outcome === "local_demo") {
        localDemoPrepared = true;
      }
      await this.repository.mutate((draft) => {
        const current = draft.outreachDeliveries.find(
          (candidate) =>
            candidate.invitationId === delivery.invitationId &&
            candidate.channel === delivery.channel
        );
        if (!current) return;
        if (result.outcome === "sent") {
          current.deliveryStatus = "sent";
          current.sentAt = new Date().toISOString();
          current.errorMessage = undefined;
        } else if (result.outcome === "failed") {
          current.deliveryStatus = "failed";
          current.sentAt = undefined;
          current.errorMessage = result.errorMessage;
        } else {
          current.deliveryStatus = "not_sent";
          current.sentAt = undefined;
          current.errorMessage = result.errorMessage;
        }
      });
    }

    await this.repository.mutate((draft) => {
      const currentInvitation = draft.supplierInvitations.find(
        (candidate) => candidate.id === invitationId
      );
      const currentLead = draft.supplierLeads.find(
        (candidate) => candidate.id === lead.id
      );
      if (!currentInvitation || !currentLead) return;
      const now = new Date().toISOString();
      const delivered = draft.outreachDeliveries.some(
        (delivery) =>
          delivery.invitationId === invitationId &&
          delivery.deliveryStatus === "sent"
      );
      if (delivered) {
        currentInvitation.status = "sent";
        currentInvitation.sentAt = currentInvitation.sentAt ?? now;
        currentInvitation.updatedAt = now;
      }
      if (
        (delivered || localDemoPrepared) &&
        currentLead.lifecycleStatus === "approved_for_outreach"
      ) {
        transitionLead(currentLead, "invited");
      }
      if (
        delivered ||
        localDemoPrepared ||
        currentLead.lifecycleStatus !== "approved_for_outreach"
      ) {
        restoreRenewedLeadLifecycle(draft, currentLead, invitationId, now);
      }
      if (delivered || localDemoPrepared) {
        currentLead.invitedAt = currentLead.invitedAt ?? now;
      }
      currentLead.updatedAt = now;
    });
  }

  private async expireStaleSupplierClaimsForNeed(
    needId: string,
    buyerAccessToken: string | undefined
  ) {
    const snapshot = this.repository.snapshot();
    this.requireBuyer(snapshot, needId, buyerAccessToken);
    const leadIds = new Set(
      snapshot.supplierLeads
        .filter((lead) => lead.needProfileId === needId)
        .map((lead) => lead.id)
    );
    const now = new Date();
    const hasExpiredClaims = snapshot.supplierClaims.some(
      (claim) =>
        leadIds.has(claim.supplierLeadId) &&
        !["expired", "revoked"].includes(claim.status) &&
        Date.parse(claim.expiresAt) <= now.getTime()
    );
    if (!hasExpiredClaims) return;

    await this.repository.mutate((draft) => {
      this.requireBuyer(draft, needId, buyerAccessToken);
      const currentLeadIds = new Set(
        draft.supplierLeads
          .filter((lead) => lead.needProfileId === needId)
          .map((lead) => lead.id)
      );
      const expiredAt = now.toISOString();
      for (const claim of draft.supplierClaims) {
        if (
          currentLeadIds.has(claim.supplierLeadId) &&
          !["expired", "revoked"].includes(claim.status) &&
          Date.parse(claim.expiresAt) <= now.getTime()
        ) {
          expireSupplierClaimAccess(draft, claim, expiredAt);
        }
      }
    });
  }

  private async recordAuthoritativePayment(input: PaymentRecordInput) {
    return this.recordPaymentEvidence({
      ...input,
      provider: "pinch",
      authoritative: true
    });
  }

  private async recordDemoPaymentEvidence(input: PaymentRecordInput) {
    return this.recordPaymentEvidence({
      ...input,
      provider: "local_demo",
      authoritative: false
    });
  }

  private async recordPaymentEvidence(
    input: PaymentRecordInput & PaymentAuthority
  ) {
    return this.repository.mutate((draft) => {
      const duplicate = draft.paymentEvidence.find(
        (evidence) => evidence.eventId === input.eventId
      );
      const project = requireProject(draft, input.projectId);
      const milestone = requireMilestone(
        project.milestones,
        input.milestoneId
      );
      if (duplicate) {
        return {
          milestone,
          evidence: duplicate,
          duplicate: true,
          needProfileId: project.needProfileId
        };
      }
      const now = new Date().toISOString();
      const evidenceBase = {
        id: randomUUID(),
        projectId: input.projectId,
        milestoneId: input.milestoneId,
        eventId: input.eventId,
        eventType: input.eventType,
        paymentStatus: "paid" as const,
        receivedAt: now,
        metadata: {
          paymentId: input.paymentId ?? null,
          sourceMode: input.provider === "pinch" ? "live" : "fixture"
        }
      };
      const evidence: PaymentEvidence =
        input.provider === "pinch"
          ? {
              ...evidenceBase,
              provider: "pinch",
              authoritative: true
            }
          : {
              ...evidenceBase,
              provider: "local_demo",
              authoritative: false
            };
      draft.paymentEvidence.push(evidence);
      milestone.paymentStatus = "paid";
      milestone.status = "funded";
      milestone.pinchPaymentId =
        input.provider === "pinch" ? input.paymentId : undefined;
      milestone.fundedAt = now;
      milestone.updatedAt = now;
      project.updatedAt = now;
      project.activities.unshift({
        id: randomUUID(),
        projectId: project.id,
        eventType: "milestone.funded",
        summary:
          input.provider === "pinch"
            ? `${milestone.title} funded after authoritative Pinch payment evidence.`
            : `${milestone.title} advanced in demo mode with explicitly non-authoritative local payment evidence.`,
        actor: input.provider === "pinch" ? "Pinch" : "Veltact demo",
        occurredAt: now
      });
      return {
        milestone,
        evidence,
        duplicate: false,
        needProfileId: project.needProfileId
      };
    });
  }
}

function expireSupplierClaimAccess(
  snapshot: VeltactV2Snapshot,
  claim: VeltactV2Snapshot["supplierClaims"][number],
  expiredAt: string
) {
  claim.status = "expired";
  claim.updatedAt = expiredAt;

  const invitation = snapshot.supplierInvitations.find(
    (candidate) => candidate.id === claim.invitationId
  );
  if (
    invitation &&
    !["responded", "cancelled"].includes(invitation.status)
  ) {
    invitation.status = "expired";
    invitation.updatedAt = expiredAt;
  }

  const lead = snapshot.supplierLeads.find(
    (candidate) => candidate.id === claim.supplierLeadId
  );
  const hasResponse = snapshot.supplierResponses.some(
    (candidate) => candidate.supplierLeadId === claim.supplierLeadId
  );
  if (
    lead &&
    !hasResponse &&
    [
      "invited",
      "claimed",
      "supplier_profile_approved",
      "buyer_approved"
    ].includes(lead.lifecycleStatus)
  ) {
    lead.lifecycleStatus = "approved_for_outreach";
    lead.invitedAt = undefined;
    lead.claimedAt = undefined;
    lead.updatedAt = expiredAt;
  }
}

function restoreRenewedLeadLifecycle(
  snapshot: VeltactV2Snapshot,
  lead: SupplierLead,
  invitationId: string,
  updatedAt: string
) {
  const claim = snapshot.supplierClaims.find(
    (candidate) => candidate.invitationId === invitationId
  );
  if (!claim || claim.status !== "claimed") return;

  if (lead.lifecycleStatus === "invited") {
    transitionLead(lead, "claimed");
  }
  lead.claimedAt = claim.claimedAt ?? lead.claimedAt ?? updatedAt;

  const profile = snapshot.supplierProfiles.find(
    (candidate) => candidate.supplierLeadId === lead.id
  );
  if (
    profile?.supplierApprovedAt &&
    lead.lifecycleStatus === "claimed"
  ) {
    transitionLead(lead, "supplier_profile_approved");
  }
  if (
    profile?.buyerApprovedAt &&
    lead.lifecycleStatus === "supplier_profile_approved"
  ) {
    transitionLead(lead, "buyer_approved");
  }
}

const allowedLeadTransitions: Record<
  SupplierLifecycleStatus,
  SupplierLifecycleStatus[]
> = {
  discovered: ["approved_for_outreach", "archived"],
  approved_for_outreach: ["invited", "archived"],
  invited: ["claimed", "declined", "archived"],
  claimed: ["supplier_profile_approved", "declined", "archived"],
  supplier_profile_approved: ["buyer_approved", "declined", "archived"],
  buyer_approved: ["active_supplier", "declined", "archived"],
  active_supplier: ["archived"],
  declined: ["archived"],
  archived: []
};

export function transitionLead(
  lead: SupplierLead,
  next: SupplierLifecycleStatus
) {
  if (lead.lifecycleStatus === next) return;
  if (!allowedLeadTransitions[lead.lifecycleStatus].includes(next)) {
    throw new V2ServiceError(
      `Invalid supplier transition: ${lead.lifecycleStatus} -> ${next}`,
      409
    );
  }
  lead.lifecycleStatus = next;
}

function createDeliveries(
  invitationId: string,
  lead: SupplierLead
): SupplierOutreachDelivery[] {
  const deliveries: SupplierOutreachDelivery[] = [];
  const email = env.SUPPLIER_OUTREACH_EMAIL_TO ?? lead.contactEmail;
  if (email) {
    deliveries.push({
      invitationId,
      supplierId: lead.id,
      channel: "email",
      destination: email,
      deliveryStatus: "not_sent"
    });
  }
  const mobile = env.SUPPLIER_OUTREACH_WHATSAPP_TO
    ? whatsappAddress(env.SUPPLIER_OUTREACH_WHATSAPP_TO)
    : env.SUPPLIER_OUTREACH_SMS_TO ?? lead.contactPhone;
  if (mobile) {
    deliveries.push({
      invitationId,
      supplierId: lead.id,
      channel: "sms",
      destination: mobile,
      deliveryStatus: "not_sent"
    });
  }
  if (deliveries.length === 0) {
    throw new V2ServiceError(
      `${lead.companyName} has no reviewed outreach destination`,
      409
    );
  }
  return deliveries;
}

function requireLiveClaim(snapshot: VeltactV2Snapshot, token: string) {
  const claim = snapshot.supplierClaims.find(
    (candidate) => candidate.token === token
  );
  if (!claim) throw new V2ServiceError("Supplier claim not found", 404);
  if (
    ["expired", "revoked"].includes(claim.status) ||
    Date.parse(claim.expiresAt) <= Date.now()
  ) {
    throw new V2ServiceError("Supplier claim is no longer active", 409);
  }
  return claim;
}

function requireLead(snapshot: VeltactV2Snapshot, supplierLeadId: string) {
  const lead = snapshot.supplierLeads.find(
    (candidate) => candidate.id === supplierLeadId
  );
  if (!lead) throw new V2ServiceError("Supplier lead not found", 404);
  return lead;
}

function requireProfile(snapshot: VeltactV2Snapshot, supplierLeadId: string) {
  const profile = snapshot.supplierProfiles.find(
    (candidate) => candidate.supplierLeadId === supplierLeadId
  );
  if (!profile) throw new V2ServiceError("Supplier profile not found", 404);
  return profile;
}

function requireProject(snapshot: VeltactV2Snapshot, projectId: string) {
  const project = snapshot.projects.find(
    (candidate) => candidate.id === projectId
  );
  if (!project) throw new V2ServiceError("Project not found", 404);
  return project;
}

function requireMilestone(
  milestones: ProjectMilestone[],
  milestoneId: string
) {
  const milestone = milestones.find(
    (candidate) => candidate.id === milestoneId
  );
  if (!milestone) throw new V2ServiceError("Project milestone not found", 404);
  return milestone;
}

function dependenciesAccepted(
  project: ReturnType<typeof requireProject>,
  milestone: ProjectMilestone
) {
  return milestone.dependencyIds.every(
    (dependencyId) =>
      project.milestones.find((candidate) => candidate.id === dependencyId)
        ?.status === "accepted"
  );
}

function withoutClaimToken(
  claim: VeltactV2Snapshot["supplierClaims"][number]
) {
  const { token: _token, ...publicClaim } = claim;
  return publicClaim;
}

function publicNeed(need: V2NeedRecord) {
  const { buyerAccessTokenHash: _hash, ...result } = need;
  return result;
}

function secureToken() {
  return randomBytes(32).toString("base64url");
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function tokensMatch(expectedHash: string, token: string | undefined) {
  if (!token) return false;
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(tokenHash(token), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function whatsappAddress(phoneNumber: string) {
  return phoneNumber.startsWith("whatsapp:")
    ? phoneNumber
    : `whatsapp:${phoneNumber}`;
}

function demoProfile(scenario: "plc" | "robotics"): MarketplaceNeedProfile {
  if (scenario === "robotics") {
    return {
      title: "Automate pallet loading with a robotic arm",
      description:
        "Plan a robotic arm cell to pick mixed cartons from an infeed conveyor and place stable pallets without disrupting the current packaging line.",
      category: "Robotics integration",
      industry: "Food and beverage manufacturing",
      equipmentOrTechnology: ["industrial robot", "machine vision", "conveyor"],
      location: "Western Sydney, NSW",
      urgencyDays: 60,
      budgetAud: 120000,
      constraints: [
        "Maintain access to the adjacent packaging line",
        "Provide operator and maintenance training"
      ],
      buyerPriority: "technical_fit",
      requiredCapabilities: [
        "robotic systems integration",
        "machinery safety",
        "commissioning"
      ]
    };
  }
  return {
    title: "Recover a stopped packaging line PLC",
    description:
      "The main packaging line stopped after a controller communication fault. The factory needs safe evidence-led triage, controlled recovery and a validated backup with production restored urgently.",
    category: "Industrial automation breakdown",
    industry: "Food and beverage manufacturing",
    equipmentOrTechnology: ["Siemens PLC", "industrial Ethernet", "variable speed drives"],
    location: "Newcastle, NSW",
    urgencyDays: 1,
    budgetAud: 12000,
    constraints: [
      "No safeguard bypass",
      "All changes require site authorisation"
    ],
    buyerPriority: "speed",
    requiredCapabilities: [
      "PLC diagnostics",
      "industrial networking",
      "safe isolation"
    ]
  };
}

export const v2Repository = new AtomicV2Repository(env.VELTACT_V2_DATA_FILE);
export const v2Service = new VeltactV2Service(v2Repository);
