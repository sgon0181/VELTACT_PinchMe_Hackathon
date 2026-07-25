import type { NeedProfile, SupplierMatch } from "./types.js";
import type { Supplier } from "./suppliers.js";

export function matchSuppliers(need: NeedProfile, suppliers: Supplier[], limit = 3): SupplierMatch[] {
  return suppliers
    .map((supplier) => scoreSupplier(need, supplier))
    .filter((match) => match.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.supplier.id.localeCompare(right.supplier.id);
    })
    .slice(0, limit);
}

function scoreSupplier(need: NeedProfile, supplier: Supplier): SupplierMatch {
  const terms = tokenise(
    [
      need.title,
      need.description,
      need.category,
      need.industry,
      need.location,
      ...(need.requiredCapabilities ?? [])
    ].join(" ")
  );

  const capabilityMatches = supplier.capabilities.filter((capability) => terms.has(normalise(capability)));
  const industryMatch = terms.has(normalise(supplier.industries[0])) || supplier.industries.some((item) => terms.has(normalise(item)));
  const locationMatch = supplier.locations.some((item) => terms.has(normalise(item)));
  const budgetFit =
    need.budgetAud === undefined ||
    (need.budgetAud >= supplier.minimumBudgetAud && need.budgetAud <= supplier.maximumBudgetAud);
  const urgencyFit = need.urgencyDays === undefined || supplier.availabilityDays <= need.urgencyDays;

  let score = capabilityMatches.length * 30;
  if (industryMatch) {
    score += 20;
  }
  if (locationMatch) {
    score += 15;
  }
  if (budgetFit) {
    score += 10;
  }
  if (urgencyFit) {
    score += 15;
  }

  return {
    supplier,
    score,
    explanation: [
      capabilityMatches.length > 0
        ? `Matched capabilities: ${capabilityMatches.join(", ")}`
        : "No direct capability match",
      industryMatch ? "Industry fit" : "Industry fit not confirmed",
      locationMatch ? "Location fit" : "Location fit not confirmed",
      budgetFit ? "Budget fit" : "Budget outside seeded supplier range",
      urgencyFit ? `Available within ${supplier.availabilityDays} days` : "Availability may miss requested timing"
    ]
  };
}

function tokenise(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function normalise(value: string): string {
  return value.toLowerCase().trim();
}
