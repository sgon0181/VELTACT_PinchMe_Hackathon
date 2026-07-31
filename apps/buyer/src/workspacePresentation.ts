export function buyerWorkspacePresentationSignature(
  workspace: unknown
): string {
  return JSON.stringify(workspace, (key, value) =>
    key === "generatedAt" ? undefined : value
  );
}
