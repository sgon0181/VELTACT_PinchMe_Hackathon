export function supplierClaimComplete(claim) {
  return claim?.status === "claimed";
}

export function supplierDocumentUrl(apiBase, invitationToken, documentKind) {
  if (!["rfq", "quote"].includes(documentKind)) {
    throw new Error("Unknown supplier document kind.");
  }
  return `${apiBase}/supplier-invitations/${encodeURIComponent(
    invitationToken
  )}/${documentKind}.pdf`;
}
