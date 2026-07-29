const changeRequestFields = new Set([
    "title",
    "requestedBy",
    "description",
    "impact"
]);
export function restoredPhaseForWorkspace(workspace) {
    if (workspace.projects.length > 0)
        return "deploy";
    if (workspace.supplierLeads.length > 0 ||
        workspace.supplierInvitations.length > 0 ||
        workspace.outreachDeliveries.length > 0 ||
        workspace.supplierProfiles.length > 0 ||
        workspace.supplierResponses.length > 0) {
        return "connect";
    }
    return "find";
}
export function changeRequestDraftForProject(current, projectId, requestedBy) {
    if (current?.projectId === projectId)
        return current;
    return {
        projectId,
        title: "",
        requestedBy,
        description: "",
        impact: "",
        dirty: false
    };
}
export function isChangeRequestField(value) {
    return changeRequestFields.has(value);
}
export function updateChangeRequestDraft(current, field, value) {
    return {
        ...current,
        [field]: value,
        dirty: true
    };
}
export async function requireSuccessfulWorkspaceRefresh(refresh) {
    if (await refresh())
        return;
    throw new Error("The update may have been saved, but the buyer workspace could not be refreshed. Review the latest workspace state before retrying.");
}
export function safeStorageGet(resolveStorage, key) {
    try {
        return resolveStorage().getItem(key);
    }
    catch {
        return null;
    }
}
export function safeStorageSet(resolveStorage, key, value) {
    try {
        resolveStorage().setItem(key, value);
        return true;
    }
    catch {
        // Storage can be unavailable in privacy-restricted browser contexts.
        return false;
    }
}
export function safeStorageRemove(resolveStorage, key) {
    try {
        resolveStorage().removeItem(key);
    }
    catch {
        // Storage can be unavailable in privacy-restricted browser contexts.
    }
}
