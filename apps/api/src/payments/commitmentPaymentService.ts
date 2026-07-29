import type { Money, PaymentStatus } from "@veltact/contracts";
import type {
  AuthoritativePaymentResult,
  HostedPaymentLink,
  PaymentProvider
} from "./paymentProvider.js";
import { isLocalDemoHostedPaymentLink } from "./localDemoPaymentProvider.js";

export type StoredHostedPaymentLink = HostedPaymentLink & {
  paymentStatus: PaymentStatus;
};

export type CommitmentPaymentContext = {
  engagementId: string;
  needProfileId: string;
  supplierId: string;
  buyerEmail: string;
  buyerName?: string;
  commitment: {
    milestoneId: string;
    title: string;
    amount: Money;
  };
  paymentStatus: PaymentStatus;
  existingPaymentLink?: StoredHostedPaymentLink;
};

export type AuthoritativePinchEvidence = {
  source: "pinch_webhook" | "pinch_reconciliation";
  eventId: string;
  eventType: string;
  engagementId: string;
  paymentId: string;
  providerStatus: "approved";
  payload: unknown;
};

export type AuthoritativePaymentRecordResult = {
  duplicate: boolean;
  supplierSecured: boolean;
};

export interface CommitmentPaymentPersistenceAdapter {
  findCommitment(
    engagementId: string
  ): Promise<CommitmentPaymentContext | undefined>;
  isBuyerAuthorized(
    needProfileId: string,
    buyerAccessToken: string | undefined
  ): Promise<boolean>;
  saveHostedPaymentLink(
    engagementId: string,
    paymentLink: HostedPaymentLink
  ): Promise<void>;
  recordAuthoritativePayment(
    evidence: AuthoritativePinchEvidence
  ): Promise<AuthoritativePaymentRecordResult>;
}

export class CommitmentPaymentError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "CommitmentPaymentError";
  }
}

export class CommitmentPaymentService {
  private readonly inFlightLinks = new Map<
    string,
    Promise<{ paymentLink: HostedPaymentLink; reused: boolean }>
  >();

  constructor(
    private readonly persistence: CommitmentPaymentPersistenceAdapter,
    private readonly provider: PaymentProvider
  ) {}

  async createOrReuseHostedPaymentLink(input: {
    engagementId: string;
    buyerAccessToken: string | undefined;
    returnUrl: string;
  }) {
    const context = await this.requireAuthorizedCommitment(
      input.engagementId,
      input.buyerAccessToken
    );
    if (context.existingPaymentLink) {
      const currentLink = {
        ...context.existingPaymentLink,
        paymentStatus: context.paymentStatus
      };
      if (
        currentLink.provider === paymentProviderName(this.provider) &&
        isUsableHostedPaymentLink(currentLink)
      ) {
        return {
          paymentLink: toHostedPaymentLink(currentLink),
          reused: true
        };
      }
      if (context.paymentStatus === "paid") {
        throw new CommitmentPaymentError(
          "The commitment has already been paid",
          409
        );
      }
    }

    const existingRequest = this.inFlightLinks.get(context.engagementId);
    if (existingRequest) {
      return existingRequest;
    }

    const request = this.createAndSaveLink(context, input.returnUrl).finally(
      () => {
        this.inFlightLinks.delete(context.engagementId);
      }
    );
    this.inFlightLinks.set(context.engagementId, request);
    return request;
  }

  async reconcileApprovedPayment(input: {
    engagementId: string;
    buyerAccessToken: string | undefined;
  }) {
    const context = await this.requireAuthorizedCommitment(
      input.engagementId,
      input.buyerAccessToken
    );
    const paymentLinkId = context.existingPaymentLink?.paymentLinkId;
    if (!paymentLinkId) {
      throw new CommitmentPaymentError(
        "Create a Payment Link before reconciling payment",
        409
      );
    }
    if (
      context.existingPaymentLink?.provider !== "pinch" ||
      paymentProviderName(this.provider) !== "pinch"
    ) {
      throw new CommitmentPaymentError(
        "Authoritative reconciliation requires a Pinch Payment Link",
        409
      );
    }

    const approved = await this.provider.getApprovedPaymentForLink(
      paymentLinkId
    );
    if (!approved) {
      return {
        reconciled: false,
        duplicate: false,
        supplierSecured: false
      };
    }

    const recorded = await this.persistence.recordAuthoritativePayment(
      reconciliationEvidence(context.engagementId, paymentLinkId, approved)
    );
    return {
      reconciled: true,
      ...recorded
    };
  }

  private async createAndSaveLink(
    context: CommitmentPaymentContext,
    returnUrl: string
  ) {
    const paymentLink = await this.provider.createHostedPaymentLink({
      engagementId: context.engagementId,
      needId: context.needProfileId,
      supplierId: context.supplierId,
      buyerEmail: context.buyerEmail,
      buyerName: context.buyerName,
      amount: context.commitment.amount.amount,
      description: `Veltact ${context.commitment.title} commitment`,
      returnUrl,
      metadata: {
        milestoneId: context.commitment.milestoneId,
        milestoneTitle: context.commitment.title,
        commitmentType: "commercial_commitment",
        commitmentAmountMinor: String(context.commitment.amount.amount),
        commitmentCurrency: context.commitment.amount.currency
      }
    });
    if (paymentLink.provider !== paymentProviderName(this.provider)) {
      throw new CommitmentPaymentError(
        "Payment provider returned an unexpected link type",
        502
      );
    }
    await this.persistence.saveHostedPaymentLink(
      context.engagementId,
      paymentLink
    );
    return {
      paymentLink,
      reused: false
    };
  }

  private async requireAuthorizedCommitment(
    engagementId: string,
    buyerAccessToken: string | undefined
  ) {
    const context = await this.persistence.findCommitment(engagementId);
    if (!context) {
      throw new CommitmentPaymentError("Engagement not found", 404);
    }
    if (
      !(await this.persistence.isBuyerAuthorized(
        context.needProfileId,
        buyerAccessToken
      ))
    ) {
      throw new CommitmentPaymentError(
        "Buyer access token is required for this requirement",
        401
      );
    }
    if (context.commitment.amount.amount <= 0) {
      throw new CommitmentPaymentError(
        "Commitment amount must be positive",
        409
      );
    }
    return context;
  }
}

export function isUsableHostedPaymentLink(link: StoredHostedPaymentLink) {
  if (
    !["not_started", "link_created", "awaiting_payment", "pending"].includes(
      link.paymentStatus
    )
  ) {
    return false;
  }
  try {
    const url = new URL(link.hostedCheckoutUrl);
    if (link.payerId.length === 0 || link.paymentLinkId.length === 0) {
      return false;
    }
    if (link.provider === "pinch") {
      return (
        url.protocol === "https:" &&
        ["pay.getpinch.com.au", "sandbox.getpinch.com.au"].includes(
          url.hostname
        ) &&
        url.username === "" &&
        url.password === ""
      );
    }
    return isLocalDemoHostedPaymentLink(link);
  } catch {
    return false;
  }
}

export function createLocalDemoPaymentEvidence(nodeEnv: string) {
  if (nodeEnv === "production") {
    throw new CommitmentPaymentError(
      "Local demo payment evidence is unavailable in production",
      404
    );
  }
  return {
    provider: "local_demo" as const,
    source: "local_demo" as const,
    authoritative: false as const,
    label: "Local demo only - not a Pinch transaction"
  };
}

function reconciliationEvidence(
  engagementId: string,
  paymentLinkId: string,
  approved: AuthoritativePaymentResult
): AuthoritativePinchEvidence {
  return {
    source: "pinch_reconciliation",
    eventId: `pinch-api:${approved.paymentId}`,
    eventType: "payment-api-reconciliation",
    engagementId,
    paymentId: approved.paymentId,
    providerStatus: approved.status,
    payload: {
      paymentLinkId,
      paymentId: approved.paymentId,
      status: approved.status
    }
  };
}

function toHostedPaymentLink(link: StoredHostedPaymentLink): HostedPaymentLink {
  return {
    provider: link.provider,
    payerId: link.payerId,
    paymentLinkId: link.paymentLinkId,
    hostedCheckoutUrl: link.hostedCheckoutUrl
  };
}

function paymentProviderName(provider: PaymentProvider) {
  // Older injected adapters predate the local-demo provider and are Pinch-only.
  return provider.provider ?? "pinch";
}
