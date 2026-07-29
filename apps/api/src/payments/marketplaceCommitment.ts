import { createDeploymentSummary } from "../deployment/templates.js";
import { marketplaceDeploymentContext } from "../deployment/marketplaceIntegration.js";
import {
  attachPaymentLinkToEngagement,
  getDeployment,
  getEngagement,
  getNeed,
  isBuyerAuthorised,
  recordAuthoritativePinchPayment,
  saveDeployment
} from "../marketplace/store.js";
import {
  CommitmentPaymentService,
  type CommitmentPaymentPersistenceAdapter
} from "./commitmentPaymentService.js";
import { isLocalDemoPaymentLinkId } from "./localDemoPaymentProvider.js";
import type { PaymentProvider } from "./paymentProvider.js";
import { getPaymentProvider } from "./providerRegistry.js";

const marketplaceCommitmentPersistence: CommitmentPaymentPersistenceAdapter = {
  async findCommitment(engagementId) {
    const engagement = getEngagement(engagementId);
    const need = engagement ? getNeed(engagement.needId) : undefined;
    const deploymentContext = marketplaceDeploymentContext(engagementId);
    if (!engagement || !need || !deploymentContext) {
      return undefined;
    }

    const deployment =
      getDeployment(engagementId) ??
      saveDeployment(
        createDeploymentSummary(
          deploymentContext,
          new Date().toISOString()
        )
      );
    const commitment = deployment.milestones[0];
    if (!commitment?.amount) {
      return undefined;
    }

    return {
      engagementId: engagement.id,
      needProfileId: engagement.needId,
      supplierId: engagement.supplierId,
      buyerEmail: need.buyerEmail,
      commitment: {
        milestoneId: commitment.id,
        title: commitment.title,
        amount: commitment.amount
      },
      paymentStatus: engagement.paymentStatus,
      ...(engagement.pinchPayerId &&
      engagement.paymentLinkId &&
      engagement.hostedCheckoutUrl
        ? {
            existingPaymentLink: {
              provider: isLocalDemoPaymentLinkId(engagement.paymentLinkId)
                ? "local_demo" as const
                : "pinch" as const,
              payerId: engagement.pinchPayerId,
              paymentLinkId: engagement.paymentLinkId,
              hostedCheckoutUrl: engagement.hostedCheckoutUrl,
              paymentStatus: engagement.paymentStatus
            }
          }
        : {})
    };
  },
  async isBuyerAuthorized(needProfileId, buyerAccessToken) {
    return isBuyerAuthorised(needProfileId, buyerAccessToken);
  },
  async saveHostedPaymentLink(engagementId, paymentLink) {
    attachPaymentLinkToEngagement({
      engagementId,
      payerId: paymentLink.payerId,
      paymentLinkId: paymentLink.paymentLinkId,
      hostedCheckoutUrl: paymentLink.hostedCheckoutUrl
    });
  },
  async recordAuthoritativePayment(evidence) {
    const result = recordAuthoritativePinchPayment({
      eventId: evidence.eventId,
      eventType: evidence.eventType,
      engagementId: evidence.engagementId,
      paymentId: evidence.paymentId,
      payload: evidence.payload
    });
    return {
      duplicate: result.duplicate,
      supplierSecured:
        result.engagement?.status === "supplier_secured"
    };
  }
};

const currentPaymentProvider: PaymentProvider = {
  get provider() {
    return getPaymentProvider().provider ?? "pinch";
  },
  createHostedPaymentLink(input) {
    return getPaymentProvider().createHostedPaymentLink(input);
  },
  getApprovedPaymentForLink(paymentLinkId) {
    return getPaymentProvider().getApprovedPaymentForLink(paymentLinkId);
  }
};

export const marketplaceCommitmentPaymentService =
  new CommitmentPaymentService(
    marketplaceCommitmentPersistence,
    currentPaymentProvider
  );
