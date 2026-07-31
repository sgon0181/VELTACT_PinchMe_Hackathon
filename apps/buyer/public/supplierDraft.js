export const supplierResponseDraftFields = [
  "canHelp",
  "earliestAvailability",
  "indicativePriceAud",
  "relevantExperience",
  "proposedApproach",
  "assumptions",
  "conditions",
  "declineReason"
];

export function readSupplierResponseDraft(storage, invitationToken) {
  if (!storage || !invitationToken) return undefined;
  try {
    const raw = storage.getItem(supplierResponseDraftStorageKey(invitationToken));
    if (!raw) return undefined;
    const candidate = JSON.parse(raw);
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return undefined;
    }
    const draft = {};
    for (const field of supplierResponseDraftFields) {
      if (typeof candidate[field] === "string") {
        draft[field] = candidate[field];
      }
    }
    return Object.keys(draft).length ? draft : undefined;
  } catch {
    return undefined;
  }
}

export function writeSupplierResponseDraft(storage, invitationToken, values) {
  if (!storage || !invitationToken) return false;
  const draft = {};
  for (const field of supplierResponseDraftFields) {
    if (typeof values?.[field] === "string") {
      draft[field] = values[field];
    }
  }
  try {
    storage.setItem(
      supplierResponseDraftStorageKey(invitationToken),
      JSON.stringify(draft)
    );
    return true;
  } catch {
    return false;
  }
}

export function clearSupplierResponseDraft(storage, invitationToken) {
  if (!storage || !invitationToken) return false;
  try {
    storage.removeItem(supplierResponseDraftStorageKey(invitationToken));
    return true;
  } catch {
    return false;
  }
}

function supplierResponseDraftStorageKey(invitationToken) {
  return `veltact:supplier-response-draft:${invitationToken}`;
}
