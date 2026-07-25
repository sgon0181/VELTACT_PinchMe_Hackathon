import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  Engagement,
  MarketplaceAuditEvent,
  NeedRecord,
  PinchWebhookEvidence,
  SupplierInvitation,
  SupplierOutreachDelivery,
  SupplierResponse
} from "./types.js";

export type MarketplaceSnapshot = {
  version: 1;
  needs: NeedRecord[];
  invitations: SupplierInvitation[];
  outreachDeliveries: SupplierOutreachDelivery[];
  responses: SupplierResponse[];
  engagements: Engagement[];
  processedPinchEventIds: string[];
  pinchWebhookEvidence: PinchWebhookEvidence[];
  auditEvents: MarketplaceAuditEvent[];
};

export function loadMarketplaceSnapshot(
  filePath: string | undefined
): MarketplaceSnapshot | undefined {
  if (!filePath || !existsSync(filePath)) {
    return undefined;
  }

  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Partial<MarketplaceSnapshot>;
  if (
    parsed.version !== 1 ||
    !Array.isArray(parsed.needs) ||
    !Array.isArray(parsed.invitations) ||
    !Array.isArray(parsed.outreachDeliveries) ||
    !Array.isArray(parsed.responses) ||
    !Array.isArray(parsed.engagements) ||
    !Array.isArray(parsed.processedPinchEventIds) ||
    !Array.isArray(parsed.pinchWebhookEvidence) ||
    !Array.isArray(parsed.auditEvents)
  ) {
    throw new Error(`Marketplace data file is not a valid version 1 snapshot: ${filePath}`);
  }

  return parsed as MarketplaceSnapshot;
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
