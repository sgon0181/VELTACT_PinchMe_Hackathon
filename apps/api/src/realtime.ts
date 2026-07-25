import type { Server as HttpServer } from "node:http";
import { rapidMatchSocketEvent } from "@veltact/contracts";
import { Server } from "socket.io";
import { env } from "./env.js";
import type { Engagement, SupplierInvitation, SupplierResponse } from "./marketplace/types.js";

let io: Server | undefined;

export function attachRealtime(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: env.WEB_ORIGIN
    }
  });

  io.on("connection", (socket) => {
    socket.on(rapidMatchSocketEvent.joinNeedProfile, (payload: { needProfileId?: string }) => {
      if (!payload.needProfileId) {
        return;
      }
      socket.join(needProfileRoom(payload.needProfileId));
    });

    socket.on(rapidMatchSocketEvent.leaveNeedProfile, (payload: { needProfileId?: string }) => {
      if (!payload.needProfileId) {
        return;
      }
      socket.leave(needProfileRoom(payload.needProfileId));
    });
  });

  return io;
}

export function emitSupplierResponseSubmitted(supplierResponse: SupplierResponse) {
  io?.to(needProfileRoom(supplierResponse.needId)).emit(rapidMatchSocketEvent.supplierResponseSubmitted, {
    needProfileId: supplierResponse.needId,
    supplierResponse
  });
}

export function emitSupplierInvitationUpdated(supplierInvitation: SupplierInvitation) {
  io?.to(needProfileRoom(supplierInvitation.needProfileId)).emit(rapidMatchSocketEvent.invitationSent, {
    needProfileId: supplierInvitation.needProfileId,
    supplierInvitation
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

function needProfileRoom(needProfileId: string) {
  return `need-profile:${needProfileId}`;
}
