import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
      version: 1,
      needs: [],
      invitations: [],
      outreachDeliveries: [],
      responses: [],
      engagements: [],
      processedPinchEventIds: ["evt_123"],
      pinchWebhookEvidence: [],
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
    assert.equal(JSON.parse(readFileSync(filePath, "utf8")).version, 1);
  });
});
