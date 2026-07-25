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
      need.problemSummary,
      need.category,
      need.industry,
      need.location,
      ...equipmentOrTechnologyValues(need),
      ...(need.constraints ?? []),
      ...requiredCapabilityValues(need)
    ].join(" ")
  );

  const requiredCapabilities = requiredCapabilityValues(need);
  const equipmentTechnology = equipmentOrTechnologyValues(need);
  const capabilityMatches = supplier.capabilities.filter((capability) =>
    isCapabilityMatch(capability, requiredCapabilities, terms)
  );
  const brandMatches = supplier.equipmentBrands.filter((brand) =>
    isStructuredPhraseMatch(brand, equipmentTechnology, terms)
  );
  const industryMatches = supplier.industries.filter((industry) =>
    tokensForPhrase(industry).some((token) => terms.has(token))
  );
  const industryMatch = industryMatches.length > 0;
  const locationMatch = supplier.locations.some((item) =>
    tokensForPhrase(item).length > 1
      ? tokensForPhrase(item).every((token) => terms.has(token))
      : tokensForPhrase(item).some((token) => terms.has(token))
  );
  const budgetFit =
    need.budgetAud === undefined ||
    (need.budgetAud >= supplier.minimumBudgetAud && need.budgetAud <= supplier.maximumBudgetAud);
  const urgencyFit = need.urgencyDays === undefined || supplier.availabilityDays <= need.urgencyDays;
  const certificationFit = supplier.certifications.length > 0;
  const speedPriorityFit =
    need.buyerPriority === "speed" &&
    (need.urgencyDays === undefined || supplier.availabilityDays <= need.urgencyDays);
  const technicalPriorityFit =
    need.buyerPriority === "technical_fit" && (capabilityMatches.length > 0 || brandMatches.length > 0);
  const trustPriorityFit = need.buyerPriority === "trust" && supplier.verified;
  const pricePriorityFit = need.buyerPriority === "price" && budgetFit;

  let score = Math.min(capabilityMatches.length, 4) * 18;
  score += Math.min(brandMatches.length, 2) * 12;
  if (industryMatch) {
    score += 12;
  }
  if (locationMatch) {
    score += 18;
  }
  if (budgetFit) {
    score += 8;
  }
  if (urgencyFit) {
    score += 15;
  }
  if (speedPriorityFit) {
    score += 10;
  }
  if (technicalPriorityFit) {
    score += 10;
  }
  if (trustPriorityFit) {
    score += 8;
  }
  if (pricePriorityFit) {
    score += 6;
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
      industryMatches,
      industryMatch,
      locationMatch,
      budgetFit,
      urgencyFit,
      speedPriorityFit,
      technicalPriorityFit,
      trustPriorityFit,
      pricePriorityFit,
      buyerPriority: need.buyerPriority
    }),
    risks: buildRisks({ budgetFit, urgencyFit, locationMatch, capabilityMatches, brandMatches }),
    status: "matched",
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function buildReasons(input: {
  supplier: Supplier;
  capabilityMatches: string[];
  brandMatches: string[];
  industryMatches: string[];
  industryMatch: boolean;
  locationMatch: boolean;
  budgetFit: boolean;
  urgencyFit: boolean;
  speedPriorityFit: boolean;
  technicalPriorityFit: boolean;
  trustPriorityFit: boolean;
  pricePriorityFit: boolean;
  buyerPriority?: NeedProfile["buyerPriority"];
}) {
  const reasons: string[] = [];
  if (input.capabilityMatches.length > 0) {
    reasons.push(`Technical fit: supports ${input.capabilityMatches.join(", ")} for the required work.`);
  }
  if (input.brandMatches.length > 0) {
    reasons.push(`Equipment fit: has ${input.brandMatches.join(", ")} experience for PLC fault work.`);
  }
  if (input.industryMatch) {
    reasons.push(`Industry fit: services ${input.industryMatches.join(", ")} environments.`);
  }
  if (input.locationMatch) {
    reasons.push("Location fit: covers Western Sydney or the requested service region.");
  }
  if (input.urgencyFit) {
    reasons.push(`Availability fit: can respond within ${input.supplier.availabilityDays} day${input.supplier.availabilityDays === 1 ? "" : "s"}.`);
  }
  if (input.speedPriorityFit) {
    reasons.push("Buyer priority fit: same-day response supports the speed-first requirement.");
  }
  if (input.technicalPriorityFit) {
    reasons.push("Buyer priority fit: technical match is strong for Siemens PLC diagnostics.");
  }
  if (input.trustPriorityFit) {
    reasons.push("Buyer priority fit: verified supplier status supports the trust requirement.");
  }
  if (input.pricePriorityFit) {
    reasons.push("Buyer priority fit: commercial range supports the price requirement.");
  }
  if (input.budgetFit) {
    reasons.push("Commercial fit: within the stated diagnostic or callout tolerance.");
  }
  if (input.supplier.certifications.length > 0) {
    reasons.push(`Trust fit: ${input.supplier.certifications.join(", ")}.`);
  }
  if (input.supplier.trustSignals.length > 0) {
    reasons.push(input.supplier.trustSignals.join("; "));
  }
  return reasons.length > 0 ? reasons : ["Seeded industrial supplier with partial marketplace fit."];
}

function buildRisks(input: {
  budgetFit: boolean;
  urgencyFit: boolean;
  locationMatch: boolean;
  capabilityMatches: string[];
  brandMatches: string[];
}) {
  const risks: string[] = [];
  if (input.capabilityMatches.length === 0) {
    risks.push("No direct technical capability match was found.");
  }
  if (input.brandMatches.length === 0) {
    risks.push("Siemens equipment experience should be confirmed.");
  }
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

function isCapabilityMatch(capability: string, requiredCapabilities: string[], terms: Set<string>) {
  const capabilityTokens = tokensForPhrase(capability);
  const requiredMatch = requiredCapabilities.some((required) => {
    const requiredTokens = tokensForPhrase(required);
    return requiredTokens.every((token) => capabilityTokens.includes(token));
  });
  if (requiredMatch) {
    return true;
  }
  return capabilityTokens.length <= 2
    ? capabilityTokens.every((token) => terms.has(token))
    : capabilityTokens.filter((token) => terms.has(token)).length >= 2;
}

function requiredCapabilityValues(need: NeedProfile) {
  return need.requiredCapability ?? need.requiredCapabilities ?? [];
}

function equipmentOrTechnologyValues(need: NeedProfile) {
  return need.equipmentOrTechnology ?? need.equipmentTechnology ?? [];
}

function isStructuredPhraseMatch(phrase: string, structuredValues: string[], terms: Set<string>) {
  const phraseTokens = tokensForPhrase(phrase);
  const structuredMatch = structuredValues.some((value) => {
    const valueTokens = tokensForPhrase(value);
    return phraseTokens.every((token) => valueTokens.includes(token)) ||
      valueTokens.every((token) => phraseTokens.includes(token));
  });
  if (structuredMatch) {
    return true;
  }
  return phraseTokens.some((token) => terms.has(token));
}
