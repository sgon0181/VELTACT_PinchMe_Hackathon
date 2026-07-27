export type V2WorkspacePhase = "find" | "connect" | "deploy";

export type ChangeRequestDraft = {
  projectId: string;
  title: string;
  requestedBy: string;
  description: string;
  impact: string;
  dirty: boolean;
};

export type ChangeRequestField = Exclude<
  keyof ChangeRequestDraft,
  "projectId" | "dirty"
>;

type RestorableWorkspace = {
  solutionDecision?: unknown;
  supplierLeads: readonly unknown[];
  supplierInvitations: readonly unknown[];
  outreachDeliveries: readonly unknown[];
  supplierProfiles: readonly unknown[];
  supplierResponses: readonly unknown[];
  projects: readonly unknown[];
};

type BrowserStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const changeRequestFields = new Set<ChangeRequestField>([
  "title",
  "requestedBy",
  "description",
  "impact"
]);

export function restoredPhaseForWorkspace(
  workspace: RestorableWorkspace
): V2WorkspacePhase {
  if (workspace.projects.length > 0) return "deploy";
  if (
    workspace.supplierLeads.length > 0 ||
    workspace.supplierInvitations.length > 0 ||
    workspace.outreachDeliveries.length > 0 ||
    workspace.supplierProfiles.length > 0 ||
    workspace.supplierResponses.length > 0
  ) {
    return "connect";
  }
  return "find";
}

export function changeRequestDraftForProject(
  current: ChangeRequestDraft | undefined,
  projectId: string,
  requestedBy: string
): ChangeRequestDraft {
  if (current?.projectId === projectId) return current;
  return {
    projectId,
    title: "",
    requestedBy,
    description: "",
    impact: "",
    dirty: false
  };
}

export function isChangeRequestField(
  value: string
): value is ChangeRequestField {
  return changeRequestFields.has(value as ChangeRequestField);
}

export function updateChangeRequestDraft(
  current: ChangeRequestDraft,
  field: ChangeRequestField,
  value: string
): ChangeRequestDraft {
  return {
    ...current,
    [field]: value,
    dirty: true
  };
}

export async function requireSuccessfulWorkspaceRefresh(
  refresh: () => Promise<boolean>
): Promise<void> {
  if (await refresh()) return;
  throw new Error(
    "The update may have been saved, but the buyer workspace could not be refreshed. Review the latest workspace state before retrying."
  );
}

export function safeStorageGet(
  resolveStorage: () => BrowserStorage,
  key: string
): string | null {
  try {
    return resolveStorage().getItem(key);
  } catch {
    return null;
  }
}

export function safeStorageSet(
  resolveStorage: () => BrowserStorage,
  key: string,
  value: string
): boolean {
  try {
    resolveStorage().setItem(key, value);
    return true;
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
    return false;
  }
}

export function safeStorageRemove(
  resolveStorage: () => BrowserStorage,
  key: string
): void {
  try {
    resolveStorage().removeItem(key);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}
