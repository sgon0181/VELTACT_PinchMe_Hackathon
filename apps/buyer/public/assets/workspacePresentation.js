export function buyerWorkspacePresentationSignature(workspace) {
    return JSON.stringify(workspace, (key, value) => key === "generatedAt" ? undefined : value);
}
