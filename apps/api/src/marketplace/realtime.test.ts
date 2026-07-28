import assert from "node:assert/strict";
import { createServer } from "node:http";
import { afterEach, describe, test } from "node:test";
import { rapidMatchSocketEvent } from "@veltact/contracts";
import { io as createSocketClient, type Socket } from "socket.io-client";
import { env } from "../env.js";
import {
  approveSupplierOutreachForNeed,
  claimSupplierInvitation,
  consumeIssuedBuyerAccessToken,
  createNeed,
  resetMarketplaceStore,
  submitSupplierResponse
} from "./store.js";
import {
  attachRealtime,
  emitCommitmentNotificationUpdated,
  emitSupplierResponseSubmitted
} from "../realtime.js";

const originalBuyerAuth = env.BUYER_CAPABILITY_AUTH_REQUIRED;

afterEach(() => {
  env.BUYER_CAPABILITY_AUTH_REQUIRED = originalBuyerAuth;
  resetMarketplaceStore();
});

describe("canonical RapidMatch realtime", { concurrency: false }, () => {
  test("sends supplier responses live only to the authorised buyer room", async () => {
    env.BUYER_CAPABILITY_AUTH_REQUIRED = true;
    const need = createNeed({
      buyerEmail: "buyer@example.com",
      profile: {
        title: "Packaging conveyor PLC fault",
        description: "Intermittent Siemens PLC fault stopped the line.",
        category: "Industrial automation",
        industry: "Food manufacturing",
        location: "Western Sydney, NSW",
        urgencyDays: 1,
        budgetAud: 4200,
        requiredCapabilities: ["PLC diagnostics"]
      }
    });
    const buyerAccessToken = consumeIssuedBuyerAccessToken(need.id);
    assert.ok(buyerAccessToken);

    const httpServer = createServer();
    const socketServer = attachRealtime(httpServer);
    assert.deepEqual(
      (
        socketServer as unknown as {
          opts: { connectionStateRecovery?: unknown };
        }
      ).opts.connectionStateRecovery,
      {
        maxDisconnectionDuration: 120_000,
        skipMiddlewares: true
      }
    );
    await new Promise<void>((resolve) => {
      httpServer.listen(0, "127.0.0.1", resolve);
    });
    const address = httpServer.address();
    assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`;
    const authorised = createSocketClient(origin, {
      transports: ["websocket"],
      forceNew: true
    });
    const unauthorised = createSocketClient(origin, {
      transports: ["websocket"],
      forceNew: true
    });

    try {
      await Promise.all([connected(authorised), connected(unauthorised)]);
      let unauthorisedUpdate = false;
      let unauthorisedCommitmentUpdate = false;
      let nonCanonicalEvent = false;
      unauthorised.on(
        rapidMatchSocketEvent.supplierResponseSubmitted,
        () => {
          unauthorisedUpdate = true;
        }
      );
      unauthorised.on(
        rapidMatchSocketEvent.commitmentNotificationUpdated,
        () => {
          unauthorisedCommitmentUpdate = true;
        }
      );
      authorised.onAny((eventName) => {
        if (!String(eventName).startsWith("rapidmatch:")) {
          nonCanonicalEvent = true;
        }
      });

      authorised.emit(rapidMatchSocketEvent.joinNeedProfile, null);
      await wait(10);
      assert.equal(authorised.connected, true);
      authorised.emit(rapidMatchSocketEvent.joinNeedProfile, {
        needProfileId: need.id,
        buyerAccessToken
      });
      unauthorised.emit(rapidMatchSocketEvent.joinNeedProfile, {
        needProfileId: need.id,
        buyerAccessToken: "wrong-buyer-token"
      });
      await wait(30);

      assert.ok(approveSupplierOutreachForNeed(need.id));
      const claimed = claimSupplierInvitation(
        need.invitations[0].token,
        {
          claimantName: "Realtime test supplier",
          claimantEmail: "supplier@example.com"
        }
      );
      assert.equal(claimed.status, "claimed");

      const submitted = submitSupplierResponse(need.invitations[0].token, {
        canHelp: true,
        earliestAvailability: "Same day",
        indicativePriceAud: 4200,
        relevantExperience: "Siemens PLC conveyor recovery.",
        conditions: "Remote evidence review before dispatch."
      });
      assert.equal(submitted.status, "submitted");
      if (submitted.status !== "submitted") return;

      const updatePromise = onceEvent(
        authorised,
        rapidMatchSocketEvent.supplierResponseSubmitted
      );
      emitSupplierResponseSubmitted(submitted.supplierResponse);
      const update = await updatePromise;
      await wait(30);

      assert.equal(update.needProfileId, need.id);
      assert.equal(update.supplierResponse.id, submitted.supplierResponse.id);
      assert.equal(update.supplierResponse.decision, "can_help");
      assert.equal(unauthorisedUpdate, false);
      assert.equal(nonCanonicalEvent, false);
      assert.doesNotMatch(JSON.stringify(update), new RegExp(need.invitations[0].token));

      const commitmentUpdatePromise = onceEvent(
        authorised,
        rapidMatchSocketEvent.commitmentNotificationUpdated
      );
      emitCommitmentNotificationUpdated(need.id, {
        id: "commitment-notification-123",
        engagementId: "engagement-123",
        supplierId: submitted.supplierResponse.supplierId,
        notificationType: "commitment_confirmed",
        channel: "email",
        destination: "supplier@example.com",
        deliveryStatus: "sent",
        sentAt: "2026-07-28T00:00:00.000Z",
        createdAt: "2026-07-28T00:00:00.000Z",
        updatedAt: "2026-07-28T00:00:00.000Z"
      });
      const commitmentUpdate = await commitmentUpdatePromise;
      await wait(30);
      assert.equal(commitmentUpdate.needProfileId, need.id);
      assert.equal(
        commitmentUpdate.commitmentNotification.deliveryStatus,
        "sent"
      );
      assert.equal(unauthorisedCommitmentUpdate, false);
    } finally {
      authorised.close();
      unauthorised.close();
      await new Promise<void>((resolve) => socketServer.close(() => resolve()));
    }
  });
});

function connected(socket: Socket) {
  if (socket.connected) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Socket connection timed out")),
      1_000
    );
    socket.once("connect", () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function onceEvent(socket: Socket, eventName: string) {
  return new Promise<Record<string, any>>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timed out waiting for ${eventName}`)),
      1_000
    );
    socket.once(eventName, (payload) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
