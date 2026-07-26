import type { Server as HttpServer } from "node:http";
import {
  rapidMatchSocketEvent,
  veltactV2SocketEvent,
  type VeltactV2SocketEvent
} from "@veltact/contracts";
import { Server } from "socket.io";
import { env } from "./env.js";
import { isBuyerAuthorised } from "./marketplace/store.js";
import type {
  Engagement,
  SupplierInvitation,
  SupplierOutreachDelivery,
  SupplierResponse
} from "./marketplace/types.js";
import { v2Service } from "./v2/service.js";

let io: Server | undefined;

export function attachRealtime(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: env.WEB_ORIGIN
    }
  });

  io.on("connection", (socket) => {
    socket.on(
      rapidMatchSocketEvent.joinNeedProfile,
      (payload: unknown) => {
        if (!isNeedRoomPayload(payload)) return;
        if (!isBuyerAuthorised(payload.needProfileId, payload.buyerAccessToken)) {
          return;
        }
        socket.join(needProfileRoom(payload.needProfileId));
      }
    );

    socket.on(
      rapidMatchSocketEvent.leaveNeedProfile,
      (payload: unknown) => {
        if (!isNeedRoomPayload(payload)) return;
        socket.leave(needProfileRoom(payload.needProfileId));
      }
    );

    socket.on(
      veltactV2SocketEvent.joinNeed,
      (payload: unknown) => {
        if (!isNeedRoomPayload(payload)) return;
        try {
          v2Service.getWorkspace(
            payload.needProfileId,
            payload.buyerAccessToken
          );
          socket.join(v2NeedRoom(payload.needProfileId));
        } catch {
          // Capability-token failures do not disclose whether a need exists.
        }
      }
    );

    socket.on(
      veltactV2SocketEvent.leaveNeed,
      (payload: unknown) => {
        if (!isNeedRoomPayload(payload)) return;
        socket.leave(v2NeedRoom(payload.needProfileId));
      }
    );
  });

  return io;
}

export function emitSupplierResponseSubmitted(supplierResponse: SupplierResponse) {
  io
    ?.to(needProfileRoom(supplierResponse.needId))
    .emit(rapidMatchSocketEvent.supplierResponseSubmitted, {
      needProfileId: supplierResponse.needId,
      supplierResponse
    });
}

export function emitSupplierInvitationUpdated(supplierInvitation: SupplierInvitation) {
  io
    ?.to(needProfileRoom(supplierInvitation.needProfileId))
    .emit(rapidMatchSocketEvent.invitationSent, {
      needProfileId: supplierInvitation.needProfileId,
      supplierInvitation
    });
}

export function emitOutreachDeliveryUpdated(
  needProfileId: string,
  outreachDelivery: SupplierOutreachDelivery
) {
  io
    ?.to(needProfileRoom(needProfileId))
    .emit(rapidMatchSocketEvent.outreachDeliveryUpdated, {
      needProfileId,
      outreachDelivery
    });
}

export function emitPaymentStatusUpdated(engagement: Engagement) {
  io?.to(needProfileRoom(engagement.needId)).emit(rapidMatchSocketEvent.paymentStatusUpdated, {
    needProfileId: engagement.needId,
    engagementId: engagement.id,
    paymentStatus: engagement.paymentStatus,
    engagement
  });
}

export function emitEngagementSecured(engagement: Engagement) {
  io?.to(needProfileRoom(engagement.needId)).emit(rapidMatchSocketEvent.engagementSecured, {
    needProfileId: engagement.needId,
    engagementId: engagement.id,
    paymentStatus: engagement.paymentStatus,
    engagement
  });
}

export function emitV2Update(
  needProfileId: string,
  eventName: VeltactV2SocketEvent,
  payload: unknown
) {
  io?.to(v2NeedRoom(needProfileId)).emit(eventName, {
    needProfileId,
    payload
  });
}

function needProfileRoom(needProfileId: string) {
  return `need-profile:${needProfileId}`;
}

function v2NeedRoom(needProfileId: string) {
  return `veltact-v2-need:${needProfileId}`;
}

function isNeedRoomPayload(
  payload: unknown
): payload is { needProfileId: string; buyerAccessToken?: string } {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as {
    needProfileId?: unknown;
    buyerAccessToken?: unknown;
  };
  return (
    typeof candidate.needProfileId === "string" &&
    candidate.needProfileId.length > 0 &&
    (candidate.buyerAccessToken === undefined ||
      typeof candidate.buyerAccessToken === "string")
  );
}
