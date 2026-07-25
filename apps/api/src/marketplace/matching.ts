import type { NeedProfile, SupplierMatch } from "./types.js";
import type { Supplier } from "./suppliers.js";

export function matchSuppliers(need: NeedProfile, suppliers: Supplier[], limit = 3): SupplierMatch[] {
  const now = new Date().toISOString();
  return suppliers
    .map((supplier) => scoreSupplier(need, supplier, now))
    .filter((match) => match.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.supplier.id.localeCompare(right.supplier.id);
    })
    .slice(0, limit);
}

function scoreSupplier(need: NeedProfile, supplier: Supplier, timestamp: string): SupplierMatch {
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

  const capabilityMatches = supplier.capabilities.filter((capability) =>
    tokensForPhrase(capability).some((token) => terms.has(token))
  );
  const brandMatches = supplier.equipmentBrands.filter((brand) =>
    tokensForPhrase(brand).some((token) => terms.has(token))
  );
  const industryMatch = terms.has(normalise(supplier.industries[0])) || supplier.industries.some((item) => terms.has(normalise(item)));
  const locationMatch = supplier.locations.some((item) =>
    tokensForPhrase(item).every((token) => terms.has(token)) || tokensForPhrase(item).some((token) => terms.has(token))
  );
  const budgetFit =
    need.budgetAud === undefined ||
    (need.budgetAud >= supplier.minimumBudgetAud && need.budgetAud <= supplier.maximumBudgetAud);
  const urgencyFit = need.urgencyDays === undefined || supplier.availabilityDays <= need.urgencyDays;
  const certificationFit = supplier.certifications.length > 0;

  let score = capabilityMatches.length * 30;
  score += brandMatches.length * 15;
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
  if (certificationFit) {
    score += 5;
  }

  score = Math.min(score, 100);

  return {
    id: `match-${supplier.id}`,
    supplier,
    score,
    explanation: buildReasons({
      supplier,
      capabilityMatches,
      brandMatches,
      industryMatch,
      locationMatch,
      budgetFit,
      urgencyFit
    }),
    risks: buildRisks({ budgetFit, urgencyFit, locationMatch }),
    status: "matched",
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function buildReasons(input: {
  supplier: Supplier;
  capabilityMatches: string[];
  brandMatches: string[];
  industryMatch: boolean;
  locationMatch: boolean;
  budgetFit: boolean;
  urgencyFit: boolean;
}) {
  const reasons: string[] = [];
  if (input.capabilityMatches.length > 0) {
    reasons.push(`Supports ${input.capabilityMatches.join(", ")} for the required work.`);
  }
  if (input.brandMatches.length > 0) {
    reasons.push(`Has relevant ${input.brandMatches.join(", ")} equipment experience.`);
  }
  if (input.industryMatch) {
    reasons.push("Has relevant industrial or manufacturing experience.");
  }
  if (input.locationMatch) {
    reasons.push("Covers the requested service region.");
  }
  if (input.urgencyFit) {
    reasons.push(`Can respond within ${input.supplier.availabilityDays} day${input.supplier.availabilityDays === 1 ? "" : "s"}.`);
  }
  if (input.budgetFit) {
    reasons.push("Fits the stated budget or callout tolerance.");
  }
  if (input.supplier.certifications.length > 0) {
    reasons.push(`Relevant credentials: ${input.supplier.certifications.join(", ")}.`);
  }
  if (input.supplier.trustSignals.length > 0) {
    reasons.push(input.supplier.trustSignals.join("; "));
  }
  return reasons.length > 0 ? reasons : ["Seeded industrial supplier with partial marketplace fit."];
}

function buildRisks(input: { budgetFit: boolean; urgencyFit: boolean; locationMatch: boolean }) {
  const risks: string[] = [];
  if (!input.budgetFit) {
    risks.push("Budget may be outside this supplier's usual range.");
  }
  if (!input.urgencyFit) {
    risks.push("Availability may miss the requested timing.");
  }
  if (!input.locationMatch) {
    risks.push("Service-region fit should be confirmed.");
  }
  return risks;
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

function tokensForPhrase(value: string): string[] {
  return [...tokenise(value)];
}
