import type {
  MarketplaceNeedProfile,
  SolutionApproach,
  SupplierLead
} from "@veltact/contracts";

type LocationFit = "direct" | "regional" | "none";

const supplierShortlistSize = 3;
const capabilityStopwords = new Set([
  "and",
  "for",
  "of",
  "or",
  "service",
  "services",
  "the"
]);

const fixtureLogoPaths: Array<{
  companyPattern: RegExp;
  path: string;
}> = [
  {
    companyPattern: /\baxisforge\b/i,
    path: "/logos/axisforge_robotics_logo.svg"
  },
  {
    companyPattern: /\bsouthern cell\b/i,
    path: "/logos/southern_cell_automation_logo.svg"
  },
  {
    companyPattern: /\bharbour motion\b/i,
    path: "/logos/harbour_motion_systems_logo.svg"
  }
];

export function rankDiscoveredSupplierLeads(input: {
  profile: MarketplaceNeedProfile;
  selectedApproach: SolutionApproach;
  candidates: SupplierLead[];
  publicBaseUrl: string;
}): SupplierLead[] {
  const rankedCandidates = input.candidates
    .map((candidate) =>
      explainCandidate({
        profile: input.profile,
        selectedApproach: input.selectedApproach,
        candidate: addSupplierLogo(candidate, input.publicBaseUrl)
      })
    )
    .sort((left, right) => {
      if (right.matchScore !== left.matchScore) {
        return right.matchScore - left.matchScore;
      }
      return left.companyName.localeCompare(right.companyName);
    });

  return distinctCandidates(rankedCandidates).slice(
    0,
    supplierShortlistSize
  );
}

function explainCandidate(input: {
  profile: MarketplaceNeedProfile;
  selectedApproach: SolutionApproach;
  candidate: SupplierLead;
}): SupplierLead {
  const { profile, selectedApproach, candidate } = input;
  const requiredCapabilities = selectedApproach.requiredCapabilities;
  const matchedRequiredCapabilities = requiredCapabilities.filter(
    (required) =>
      candidate.capabilities.some((capability) =>
        phrasesOverlap(required, capability)
      )
  );
  const unmatchedRequiredCapabilities = requiredCapabilities.filter(
    (required) => !matchedRequiredCapabilities.includes(required)
  );
  const equipment = [
    ...(profile.equipmentOrTechnology ?? []),
    ...(profile.equipmentTechnology ?? [])
  ];
  const candidateEvidence = [
    ...candidate.capabilities,
    ...candidate.matchReasons,
    ...candidate.evidence.flatMap((evidence) => [
      evidence.title,
      evidence.evidenceNote
    ])
  ].join(" ");
  const matchedEquipment = equipment.filter((item) =>
    phrasesOverlap(item, candidateEvidence)
  );
  const locationFit = assessLocationFit(profile.location, candidate);
  const industryFit = hasIndustryFit(profile.industry, candidateEvidence);
  const rapidResponseEvidence = candidate.matchReasons.some((reason) =>
    /\b(availability|urgency|same[- ]day|same[- ]shift|breakdown response|rapid response)\b/i.test(
      reason
    )
  );
  const capabilityCoverage =
    matchedRequiredCapabilities.length / requiredCapabilities.length;

  let score = 25;
  score += Math.round(capabilityCoverage * 40);
  score += matchedEquipment.length > 0 ? 10 : 0;
  score += locationFit === "direct" ? 10 : locationFit === "regional" ? 6 : 0;
  score += industryFit ? 5 : 0;
  score += candidate.evidence.length > 0 ? 5 : 0;
  if (
    profile.buyerPriority === "technical_fit" &&
    matchedRequiredCapabilities.length > 0
  ) {
    score += 5;
  }
  if (profile.buyerPriority === "speed" && rapidResponseEvidence) {
    score += 5;
  }
  score = Math.min(98, score);

  const evidenceLabel =
    candidate.sourceMode === "fixture" ? "Fixture evidence" : "Public evidence";
  const reasons: string[] = [];
  if (matchedRequiredCapabilities.length > 0) {
    reasons.push(
      `Selected solution fit: "${selectedApproach.title}" requires ${requiredCapabilities.join(
        ", "
      )}; ${candidate.companyName} shows ${matchedRequiredCapabilities.join(
        ", "
      )} (${matchedRequiredCapabilities.length} of ${
        requiredCapabilities.length
      }).`
    );
  } else {
    reasons.push(
      `Selected solution check: "${selectedApproach.title}" requires ${requiredCapabilities.join(
        ", "
      )}; no direct capability overlap is established for ${candidate.companyName}.`
    );
  }
  if (matchedEquipment.length > 0) {
    reasons.push(
      `Equipment fit: ${evidenceLabel.toLowerCase()} aligns ${candidate.companyName} with ${matchedEquipment.join(
        ", "
      )}.`
    );
  }
  if (locationFit === "direct") {
    reasons.push(
      `Location fit: ${candidate.location} and the stated service regions align with ${profile.location}.`
    );
  } else if (locationFit === "regional") {
    reasons.push(
      `Location fit: the stated service regions include the broader region for ${profile.location}; mobilisation still needs confirmation.`
    );
  }
  if (industryFit) {
    reasons.push(
      `Industry fit: ${evidenceLabel.toLowerCase()} references work relevant to ${profile.industry}.`
    );
  }
  if (
    profile.buyerPriority === "technical_fit" &&
    matchedRequiredCapabilities.length > 0
  ) {
    reasons.push(
      "Buyer priority fit: the technical-fit priority is supported by explicit selected-pathway capability overlap."
    );
  } else if (profile.buyerPriority === "speed" && rapidResponseEvidence) {
    reasons.push(
      "Buyer priority fit: the candidate evidence references a rapid-response service model for the speed-first requirement; current availability remains subject to supplier confirmation."
    );
  } else if (profile.buyerPriority === "speed") {
    reasons.push(
      "Buyer priority check: speed is the buyer priority, but discovery evidence does not confirm current response timing."
    );
  } else if (profile.buyerPriority === "price") {
    reasons.push(
      "Buyer priority check: price is the buyer priority, but discovery evidence does not establish a commercial offer."
    );
  } else if (profile.buyerPriority === "trust") {
    reasons.push(
      "Buyer priority check: trust is the buyer priority, but discovery evidence is not supplier verification."
    );
  } else if (profile.buyerPriority === "technical_fit") {
    reasons.push(
      "Buyer priority check: technical fit is the buyer priority, and the selected-pathway capability gaps require confirmation."
    );
  }

  reasons.push(
    ...candidate.matchReasons.filter(
      (reason) =>
        !reasons.some(
          (generated) =>
            reasonLabel(generated) === reasonLabel(reason)
        )
    )
  );

  const risks = [...candidate.risks];
  if (unmatchedRequiredCapabilities.length > 0) {
    risks.push(
      `Selected solution gap: confirm ${unmatchedRequiredCapabilities.join(
        ", "
      )} before shortlist approval.`
    );
  }
  if (locationFit === "none") {
    risks.push(
      `Location check: service coverage for ${profile.location} is not established by the candidate evidence.`
    );
  }
  if (profile.urgencyDays !== undefined) {
    risks.push(
      `Availability check: delivery within ${profile.urgencyDays} day${
        profile.urgencyDays === 1 ? "" : "s"
      } is not confirmed by discovery evidence.`
    );
  }
  if (profile.budgetAud !== undefined) {
    risks.push(
      `Budget check: fit within AUD ${profile.budgetAud.toLocaleString(
        "en-AU"
      )} must be confirmed in the supplier response.`
    );
  }
  if (profile.buyerPriority === "trust") {
    risks.push(
      "Trust check: public or fixture discovery evidence is not supplier verification."
    );
  }

  return {
    ...candidate,
    matchScore: score,
    matchReasons: deduplicate(reasons).slice(0, 8),
    risks: deduplicate(risks),
    updatedAt: candidate.updatedAt
  };
}

function addSupplierLogo(
  candidate: SupplierLead,
  publicBaseUrl: string
): SupplierLead {
  if (candidate.logoUrl || candidate.sourceMode !== "fixture") {
    return candidate;
  }
  const fixtureLogo = fixtureLogoPaths.find(({ companyPattern }) =>
    companyPattern.test(candidate.companyName)
  );
  if (!fixtureLogo) {
    return candidate;
  }
  return {
    ...candidate,
    logoUrl: new URL(fixtureLogo.path, publicBaseUrl).toString()
  };
}

function distinctCandidates(candidates: SupplierLead[]): SupplierLead[] {
  const companyNames = new Set<string>();
  const websites = new Set<string>();

  return candidates.filter((candidate) => {
    const companyName = candidate.companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    const website = normaliseWebsite(candidate.website);
    if (companyNames.has(companyName) || websites.has(website)) {
      return false;
    }
    companyNames.add(companyName);
    websites.add(website);
    return true;
  });
}

function normaliseWebsite(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}

function assessLocationFit(
  requestedLocation: string,
  candidate: SupplierLead
): LocationFit {
  const requestedTokens = tokenise(requestedLocation);
  const candidateLocationTokens = tokenise(candidate.location);
  const serviceRegionTokens = tokenise(candidate.serviceRegions.join(" "));
  const directMatches = [...requestedTokens].filter(
    (token) =>
      candidateLocationTokens.has(token) || serviceRegionTokens.has(token)
  );
  const specificDirectMatches = directMatches.filter(
    (token) => !["australia", "nsw", "vic", "wa", "sa", "qld"].includes(token)
  );
  if (
    specificDirectMatches.length > 0 ||
    directMatches.length >= Math.min(2, requestedTokens.size)
  ) {
    return "direct";
  }
  if (directMatches.length > 0) {
    return "regional";
  }
  return "none";
}

function hasIndustryFit(industry: string, evidence: string): boolean {
  const genericTerms = new Set([
    "and",
    "industrial",
    "industry",
    "manufacturing",
    "production",
    "the"
  ]);
  const industryTokens = [...tokenise(industry)].filter(
    (token) => !genericTerms.has(token)
  );
  const evidenceTokens = tokenise(evidence);
  return industryTokens.some((token) => evidenceTokens.has(token));
}

function phrasesOverlap(left: string, right: string): boolean {
  const leftTokens = capabilityTokens(left);
  const rightTokens = capabilityTokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return false;
  }
  const overlap = [...leftTokens].filter((token) =>
    rightTokens.has(token)
  ).length;
  if (overlap === 1 && Math.min(leftTokens.size, rightTokens.size) > 1) {
    return false;
  }
  return (
    overlap === leftTokens.size ||
    overlap === rightTokens.size ||
    overlap / Math.min(leftTokens.size, rightTokens.size) >= 0.5
  );
}

function capabilityTokens(value: string): Set<string> {
  return new Set(
    [...tokenise(value)].filter((token) => !capabilityStopwords.has(token))
  );
}

function tokenise(value: string): Set<string> {
  const tokens = value
    .toLowerCase()
    .replaceAll("palletizer", "palletising")
    .replaceAll("palletiser", "palletising")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((token) => {
      if (["robotic", "robotics", "robots"].includes(token)) return "robot";
      if (["controls", "controller", "controllers"].includes(token)) {
        return "control";
      }
      if (["diagnostic", "diagnostics"].includes(token)) return "diagnosis";
      if (["systems", "system"].includes(token)) return "system";
      return token;
    });
  const result = new Set(tokens);
  if (result.has("simatic") || result.has("s7")) {
    result.add("siemens");
    result.add("plc");
  }
  return result;
}

function reasonLabel(reason: string): string {
  return reason.split(":", 1)[0].trim().toLowerCase();
}

function deduplicate(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
