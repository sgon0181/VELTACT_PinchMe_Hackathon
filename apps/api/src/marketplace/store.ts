import { randomUUID } from "node:crypto";
import { matchSuppliers } from "./matching.js";
import { seededSuppliers } from "./suppliers.js";
import type { NeedProfile, NeedRecord, SupplierInvitation, SupplierResponse } from "./types.js";

const needs = new Map<string, NeedRecord>();
const invitations = new Map<string, SupplierInvitation>();
const responses = new Map<string, SupplierResponse>();

export function createNeed(input: { buyerEmail: string; profile: NeedProfile }): NeedRecord {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const matches = matchSuppliers(input.profile, seededSuppliers);
  const needInvitations = matches.map((match) => {
    const invitation: SupplierInvitation = {
      token: randomUUID(),
      needId: id,
      supplierId: match.supplier.id,
      supplierName: match.supplier.name,
      status: "invited",
      createdAt
    };
    invitations.set(invitation.token, invitation);
    return invitation;
  });

  const need: NeedRecord = {
    id,
    buyerEmail: input.buyerEmail,
    profile: input.profile,
    matches,
    invitations: needInvitations,
    createdAt
  };
  needs.set(id, need);
  return need;
}

export function getNeed(id: string): NeedRecord | undefined {
  return needs.get(id);
}

export function getInvitation(token: string): SupplierInvitation | undefined {
  return invitations.get(token);
}

export function submitSupplierResponse(
  token: string,
  input: Omit<SupplierResponse, "id" | "needId" | "supplierId" | "supplierName" | "submittedAt">
): SupplierResponse | undefined {
  const invitation = invitations.get(token);
  if (!invitation) {
    return undefined;
  }

  const submittedAt = new Date().toISOString();
  const response: SupplierResponse = {
    id: randomUUID(),
    needId: invitation.needId,
    supplierId: invitation.supplierId,
    supplierName: invitation.supplierName,
    submittedAt,
    ...input
  };

  invitation.status = "responded";
  invitation.respondedAt = submittedAt;
  responses.set(response.id, response);
  return response;
}

export function listResponsesForNeed(needId: string): SupplierResponse[] | undefined {
  if (!needs.has(needId)) {
    return undefined;
  }

  return [...responses.values()]
    .filter((response) => response.needId === needId)
    .sort((left, right) => left.submittedAt.localeCompare(right.submittedAt));
}

export function resetMarketplaceStore() {
  needs.clear();
  invitations.clear();
  responses.clear();
}
