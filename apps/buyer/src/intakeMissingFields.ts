export function dedupeIntakeMissingFields(fields: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const field of fields) {
    const key = intakeMissingFieldKey(field);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(field);
  }

  return result;
}

function intakeMissingFieldKey(field: string): string {
  const normalised = field.trim().toLowerCase();
  if (normalised.includes("location")) return "location";
  if (
    normalised.includes("urgency") ||
    normalised.includes("timing") ||
    normalised.includes("required by")
  ) {
    return "urgency";
  }
  if (
    normalised.includes("budget") ||
    normalised.includes("callout") ||
    normalised.includes("tolerance")
  ) {
    return "budget";
  }
  if (
    normalised.includes("equipment") ||
    normalised.includes("technology")
  ) {
    return "equipment";
  }
  if (normalised.includes("capabilit")) return "capabilities";
  if (normalised.includes("email") || normalised.includes("contact")) {
    return "contact";
  }
  if (normalised.includes("photo")) return "photo";
  if (normalised.includes("pdf")) return "pdf";
  return normalised;
}
