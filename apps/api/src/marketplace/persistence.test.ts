import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  loadMarketplaceSnapshot,
  saveMarketplaceSnapshot,
  type MarketplaceSnapshot
} from "./persistence.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("marketplace persistence", () => {
  test("atomically saves and reloads marketplace state with audit history", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "veltact-marketplace-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "marketplace.json");
    const snapshot: MarketplaceSnapshot = {
      version: 3,
      needs: [],
      researchResults: [],
      solutionDecisions: [],
      needReports: [],
      supplierLeads: [],
      invitations: [],
      supplierClaims: [],
      outreachDeliveries: [],
      responses: [],
      engagements: [],
      commitmentNotifications: [
        {
          id: "commitment-notification-eng_123",
          engagementId: "eng_123",
          supplierId: "supplier_123",
          notificationType: "commitment_confirmed",
          channel: "email",
          destination: "supplier@example.com",
          deliveryStatus: "sent",
          sentAt: "2026-07-26T00:00:00.000Z",
          createdAt: "2026-07-26T00:00:00.000Z",
          updatedAt: "2026-07-26T00:00:00.000Z"
        }
      ],
      deployments: [
        {
          engagementId: "eng_123",
          title: "PLC recovery deployment",
          status: "active",
          progressPercentage: 0,
          currentMilestoneId: "eng_123-m1-diagnosis",
          milestones: [
            {
              id: "eng_123-m1-diagnosis",
              engagementId: "eng_123",
              sequence: 1,
              title: "Diagnosis",
              amount: {
                amount: 1850000,
                currency: "AUD"
              },
              status: "funded",
              paymentStatus: "paid",
              progressPercentage: 0,
              latestUpdate:
                "Diagnosis commitment is funded. Engineering work is not yet complete.",
              updatedAt: "2026-07-26T00:00:00.000Z"
            }
          ],
          latestUpdate:
            "Diagnosis commitment is funded. Engineering work is not yet complete.",
          updatedAt: "2026-07-26T00:00:00.000Z"
        }
      ],
      supplierRegistryEntries: [],
      processedPinchEventIds: ["evt_123"],
      pinchWebhookEvidence: [],
      localDemoPaymentEvidence: [
        {
          provider: "local_demo",
          source: "local_demo",
          authoritative: false,
          eventId: "demo-payment:eng_123",
          eventType: "local-demo-payment",
          engagementId: "eng_123",
          paymentId: "demo_local_demo_link_eng_123",
          receivedAt: "2026-07-26T00:00:00.000Z",
          payload: {
            source: "local_demo"
          }
        }
      ],
      auditEvents: [
        {
          id: "audit_123",
          eventType: "need.created",
          actorType: "buyer",
          actorId: "buyer@example.com",
          entityType: "need",
          entityId: "need_123",
          occurredAt: "2026-07-26T00:00:00.000Z",
          metadata: { matchCount: 3 }
        }
      ]
    };

    saveMarketplaceSnapshot(filePath, snapshot);

    assert.deepEqual(loadMarketplaceSnapshot(filePath), snapshot);
    assert.equal(JSON.parse(readFileSync(filePath, "utf8")).version, 3);
  });

  test("loads version 1 snapshots with empty canonical Find collections", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "veltact-marketplace-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "marketplace-v1.json");
    writeFileSync(
      filePath,
      JSON.stringify({
        version: 1,
        needs: [],
        invitations: [],
        outreachDeliveries: [],
        responses: [],
        engagements: [],
        processedPinchEventIds: [],
        pinchWebhookEvidence: [],
        auditEvents: []
      }),
      "utf8"
    );

    const loaded = loadMarketplaceSnapshot(filePath);

    assert.equal(loaded?.version, 3);
    assert.deepEqual(loaded?.researchResults, []);
    assert.deepEqual(loaded?.solutionDecisions, []);
    assert.deepEqual(loaded?.needReports, []);
    assert.deepEqual(loaded?.supplierLeads, []);
    assert.deepEqual(loaded?.supplierClaims, []);
    assert.deepEqual(loaded?.commitmentNotifications, []);
    assert.deepEqual(loaded?.deployments, []);
    assert.deepEqual(loaded?.supplierRegistryEntries, []);
    assert.deepEqual(loaded?.localDemoPaymentEvidence, []);
  });
});
