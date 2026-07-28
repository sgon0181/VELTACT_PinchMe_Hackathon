import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { DeploymentSummary } from "@veltact/contracts";
import type {
  Engagement,
  LocalDemoPaymentEvidence,
  MarketplaceAuditEvent,
  NeedReportRecord,
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

export type MarketplaceSnapshot = {
  version: 2;
  needs: NeedRecord[];
  researchResults: SolutionResearchResult[];
  solutionDecisions: SolutionDecision[];
  needReports: NeedReportRecord[];
  supplierLeads: SupplierLead[];
  invitations: SupplierInvitation[];
  supplierClaims: SupplierClaim[];
  outreachDeliveries: SupplierOutreachDelivery[];
  responses: SupplierResponse[];
  engagements: Engagement[];
  deployments: DeploymentSummary[];
  processedPinchEventIds: string[];
  pinchWebhookEvidence: PinchWebhookEvidence[];
  localDemoPaymentEvidence: LocalDemoPaymentEvidence[];
  auditEvents: MarketplaceAuditEvent[];
};

type PersistedMarketplaceSnapshot = Partial<
  Omit<MarketplaceSnapshot, "version">
> & {
  version?: 1 | 2;
};

export function loadMarketplaceSnapshot(
  filePath: string | undefined
): MarketplaceSnapshot | undefined {
  if (!filePath || !existsSync(filePath)) {
    return undefined;
  }

  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as PersistedMarketplaceSnapshot;
  if (
    (parsed.version !== 1 && parsed.version !== 2) ||
    !Array.isArray(parsed.needs) ||
    !Array.isArray(parsed.invitations) ||
    !Array.isArray(parsed.outreachDeliveries) ||
    !Array.isArray(parsed.responses) ||
    !Array.isArray(parsed.engagements) ||
    !Array.isArray(parsed.processedPinchEventIds) ||
    !Array.isArray(parsed.pinchWebhookEvidence) ||
    !Array.isArray(parsed.auditEvents)
  ) {
    throw new Error(`Marketplace data file is not a valid version 1 or 2 snapshot: ${filePath}`);
  }

  return {
    version: 2,
    needs: parsed.needs,
    researchResults: arrayOrEmpty(parsed.researchResults),
    solutionDecisions: arrayOrEmpty(parsed.solutionDecisions),
    needReports: arrayOrEmpty(parsed.needReports),
    supplierLeads: arrayOrEmpty(parsed.supplierLeads),
    invitations: parsed.invitations,
    supplierClaims: arrayOrEmpty(parsed.supplierClaims),
    outreachDeliveries: parsed.outreachDeliveries,
    responses: parsed.responses,
    engagements: parsed.engagements,
    deployments: arrayOrEmpty(parsed.deployments),
    processedPinchEventIds: parsed.processedPinchEventIds,
    pinchWebhookEvidence: parsed.pinchWebhookEvidence,
    localDemoPaymentEvidence: arrayOrEmpty(parsed.localDemoPaymentEvidence),
    auditEvents: parsed.auditEvents
  } as MarketplaceSnapshot;
}

export function saveMarketplaceSnapshot(
  filePath: string | undefined,
  snapshot: MarketplaceSnapshot
) {
  if (!filePath) {
    return;
  }

  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  renameSync(temporaryPath, filePath);
}

function arrayOrEmpty<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}
