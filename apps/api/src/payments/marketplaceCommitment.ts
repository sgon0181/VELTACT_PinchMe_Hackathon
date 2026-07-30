import {
  createDeploymentSummary,
  ensureMilestoneFundingSchedule
} from "../deployment/templates.js";
import { marketplaceDeploymentContext } from "../deployment/marketplaceIntegration.js";
import { env } from "../env.js";
import {
  attachPaymentLinkToMilestone,
  cancelPaymentLinkForMilestone,
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
  async findCommitment(engagementId, milestoneId) {
    const engagement = getEngagement(engagementId);
    const need = engagement ? getNeed(engagement.needId) : undefined;
    const deploymentContext = marketplaceDeploymentContext(engagementId);
    if (!engagement || !need || !deploymentContext) {
      return undefined;
    }

    let deployment =
      getDeployment(engagementId) ??
      saveDeployment(
        createDeploymentSummary(
          deploymentContext,
          new Date().toISOString()
        )
      );
    const scheduled = ensureMilestoneFundingSchedule(
      deployment,
      deploymentContext.commitmentAmount
    );
    if (scheduled.changed) {
      deployment = saveDeployment(scheduled.deployment);
    }
    const commitment = milestoneId
      ? deployment.milestones.find((milestone) => milestone.id === milestoneId)
      : deployment.milestones[0];
    if (!commitment?.amount) {
      return undefined;
    }
    const nextIncomplete = [...deployment.milestones]
      .sort((left, right) => left.sequence - right.sequence)
      .find((milestone) => milestone.status !== "completed");
    const paymentLinkId =
      commitment.paymentLinkId ??
      (commitment.sequence === 1 ? engagement.paymentLinkId : undefined);
    const payerId =
      commitment.pinchPayerId ??
      (commitment.sequence === 1 ? engagement.pinchPayerId : undefined);
    const hostedCheckoutUrl =
      commitment.hostedCheckoutUrl ??
      (commitment.sequence === 1
        ? engagement.hostedCheckoutUrl
        : undefined);

    return {
      engagementId: engagement.id,
      needProfileId: engagement.needId,
      supplierId: engagement.supplierId,
      buyerEmail: need.buyerEmail,
      isNextIncomplete: nextIncomplete?.id === commitment.id,
      commitment: {
        milestoneId: commitment.id,
        title: commitment.title,
        amount: commitment.amount
      },
      paymentStatus: commitment.paymentStatus,
      ...(payerId &&
      paymentLinkId &&
      hostedCheckoutUrl
        ? {
            existingPaymentLink: {
              provider: isLocalDemoPaymentLinkId(paymentLinkId)
                ? "local_demo" as const
                : "pinch" as const,
              payerId,
              paymentLinkId,
              hostedCheckoutUrl,
              paymentStatus: commitment.paymentStatus
            }
          }
        : {})
    };
  },
  async isBuyerAuthorized(needProfileId, buyerAccessToken) {
    return isBuyerAuthorised(needProfileId, buyerAccessToken);
  },
  async saveHostedPaymentLink(engagementId, milestoneId, paymentLink, fee) {
    attachPaymentLinkToMilestone({
      engagementId,
      milestoneId,
      provider: paymentLink.provider,
      payerId: paymentLink.payerId,
      paymentLinkId: paymentLink.paymentLinkId,
      hostedCheckoutUrl: paymentLink.hostedCheckoutUrl,
      ...fee
    });
  },
  async cancelHostedPaymentLink(engagementId, milestoneId) {
    cancelPaymentLinkForMilestone({ engagementId, milestoneId });
  },
  async recordAuthoritativePayment(evidence) {
    const result = recordAuthoritativePinchPayment({
      eventId: evidence.eventId,
      eventType: evidence.eventType,
      engagementId: evidence.engagementId,
      milestoneId: evidence.milestoneId,
      paymentId: evidence.paymentId,
      payload: evidence.payload
    });
    return {
      duplicate: result.duplicate,
      supplierSecured: result.engagement?.status === "supplier_secured",
      milestoneFunded: result.milestoneFunded
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
  },
  async cancelHostedPaymentLink(paymentLinkId) {
    const provider = getPaymentProvider();
    if (!provider.cancelHostedPaymentLink) {
      throw new Error("The configured payment provider cannot cancel Payment Links");
    }
    await provider.cancelHostedPaymentLink(paymentLinkId);
  }
};

export const marketplaceCommitmentPaymentService =
  new CommitmentPaymentService(
    marketplaceCommitmentPersistence,
    currentPaymentProvider,
    env.VELTACT_SERVICE_FEE_BPS
  );
