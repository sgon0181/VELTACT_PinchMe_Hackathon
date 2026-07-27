import { demoControlsEnabled } from "./assets/apiBase.js";
import { companyLogoFor } from "./assets/companyLogos.js";

const isFrontendDevServer =
  ["localhost", "127.0.0.1"].includes(window.location.hostname) &&
  ["4173", "5173"].includes(window.location.port);
const API_BASE =
  window.API_BASE_URL ||
  (isFrontendDevServer
    ? "http://localhost:4000/api"
    : `${window.location.origin}/api`);

const token = new URLSearchParams(window.location.search).get("token");
const form = document.querySelector("#response-form");
const statusEl = document.querySelector("#form-status");
const summary = document.querySelector("#opportunity-summary");
const receipt = document.querySelector("#submitted-receipt");
const submitButton = document.querySelector("#submit-button");
const demoTools = document.querySelector("#demo-tools");
const demoSelect = document.querySelector("#demo-response-select");
const demoFillButton = document.querySelector("#demo-fill-button");
const helpFields = document.querySelector("#help-response-fields");
const declineReasonField = document.querySelector("#decline-reason-field");
let claimComplete = false;
let demoResponses = [];
let demoResponsesForRequirement;
let demoRequirementText = "";

form.addEventListener("submit", (event) => submitResponse(event, token));
form.addEventListener("change", (event) => {
  if (event.target instanceof HTMLInputElement && event.target.name === "canHelp") {
    updateDecisionFields();
  }
});
void configureDemoControls();

if (!token) {
  showTerminalState(
    "error",
    "Invalid invitation link",
    "This private supplier link is missing its invitation token. Open the complete link from the Veltact email, SMS or buyer-provided secure link."
  );
} else {
  loadOpportunity(token);
}

async function loadOpportunity(invitationToken) {
  setFormStatus("Loading private opportunity...", "working");
  try {
    const { response, payload } = await requestJson(
      `${API_BASE}/supplier-invitations/${encodeURIComponent(invitationToken)}`
    );
    if (!response.ok) {
      handleLoadFailure(response.status, payload);
      return;
    }

    const invitation = payload.invitation || payload.supplierInvitation;
    const need = payload.need || payload.needProfile;
    if (!invitation || !need) {
      showTerminalState(
        "error",
        "Opportunity unavailable",
        "The invitation response did not include the requirement details. No response has been submitted."
      );
      return;
    }

    renderOpportunity(payload, need, invitation);
    const existingResponse = payload.response || payload.supplierResponse;
    if (existingResponse) {
      showSubmittedReceipt(existingResponse, true);
      return;
    }

    if (isExpired(invitation)) {
      showTerminalState(
        "expired",
        "Invitation expired",
        `This opportunity expired ${formatDateTime(invitation.expiresAt)}. Contact the buyer directly if they want to issue a new private invitation.`,
        true
      );
      return;
    }

    if (invitation.status === "cancelled") {
      showTerminalState(
        "closed",
        "Invitation closed",
        "The buyer has cancelled this invitation. Your company details and response have not been submitted.",
        true
      );
      return;
    }

    if (need.status && need.status !== "responses_open" && need.status !== "selection_ready") {
      showTerminalState(
        "closed",
        "Responses are closed",
        "The buyer has progressed this requirement and is no longer accepting supplier responses.",
        true
      );
      return;
    }

    const claim = payload.claim || payload.supplierClaim;
    const profile = payload.supplierProfile || payload.supplierLead;
    claimComplete = Boolean(
      claim?.status === "claimed" ||
        claim?.status === "supplier_profile_approved"
    );
    renderIdentity(profile, claim, invitation);
    form.hidden = false;
    setFormStatus(
      claimComplete
        ? "Company and contact already confirmed. Review the details and submit the opportunity response."
        : "",
      claimComplete ? "success" : undefined
    );
  } catch {
    showTerminalState(
      "error",
      "Unable to load opportunity",
      "Veltact could not reach the supplier invitation service. Check your connection and reopen the private link."
    );
  }
}

function renderOpportunity(payload, need, invitation) {
  const profile = need.profile || need.needProfile || need;
  const requirementText = [
    profile.title,
    profile.description,
    profile.problemSummary,
    ...(profile.requiredCapabilities || profile.requiredCapability || [])
  ]
    .filter(Boolean)
    .join(" ");

  document.title = `${invitation.supplierName || "Supplier"} | Veltact opportunity`;
  text("#need-title", profile.title || "Supplier opportunity");
  renderSupplierIdentity(
    invitation.supplierName || payload.supplierProfile?.companyName || "Supplier"
  );
  text("#invitation-expiry", `Respond by ${formatDateTime(invitation.expiresAt)}`);
  text("#need-location", profile.location || "Not specified");
  text(
    "#need-urgency",
    profile.urgencyDays
      ? `${profile.urgencyDays} day${profile.urgencyDays === 1 ? "" : "s"}`
      : profile.requiredBy || profile.urgency || "Not specified"
  );
  text(
    "#need-budget",
    profile.budgetAud !== undefined
      ? formatMoney(profile.budgetAud)
      : profile.budget?.amount !== undefined
        ? formatMoney(profile.budget.amount / 100)
        : profile.budgetRange || "Not specified"
  );
  text(
    "#need-description",
    profile.description || profile.problemSummary || "Requirement details not supplied."
  );

  const capabilities =
    profile.requiredCapabilities ||
    profile.requiredCapability ||
    profile.mustHaves ||
    [];
  document.querySelector("#capabilities").replaceChildren(
    ...capabilities.map((capability) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = capability;
      return chip;
    })
  );

  const reasons = supplierMatchReasons(payload, capabilities);
  document.querySelector("#match-reasons").replaceChildren(
    ...reasons.map((reason) => {
      const item = document.createElement("li");
      item.textContent = reason;
      return item;
    })
  );
  text("#source-disclosure", sourceDisclosure(payload));
  summary.setAttribute("aria-busy", "false");

  demoRequirementText = requirementText;
  populateDemoResponses();
}

async function configureDemoControls() {
  if (!(await demoControlsEnabled(API_BASE))) return;
  try {
    const demoModule = await import("./supplierDemoResponses.js");
    demoResponsesForRequirement = demoModule.demoResponsesForRequirement;
  } catch {
    return;
  }
  demoTools.hidden = false;
  demoFillButton.addEventListener("click", fillDemoResponse);
  populateDemoResponses();
}

function populateDemoResponses() {
  if (!demoResponsesForRequirement || !demoRequirementText) return;
  demoResponses = demoResponsesForRequirement(demoRequirementText);
  demoSelect.replaceChildren(
    ...demoResponses.map((preset) => {
      const option = document.createElement("option");
      option.value = preset.id;
      option.textContent = preset.label;
      return option;
    })
  );
}

function renderIdentity(profile, claim, invitation) {
  setFormValue(
    "companyName",
    profile?.companyName || invitation.supplierName || ""
  );
  setFormValue(
    "contactName",
    profile?.contactName || claim?.claimantName || ""
  );
  setFormValue(
    "contactEmail",
    profile?.contactEmail || claim?.claimantEmail || ""
  );
  setFormValue("contactPhone", profile?.contactPhone || "");
  const confirmation = form.elements.namedItem("sourceDisclosureAccepted");
  if (confirmation instanceof HTMLInputElement) {
    confirmation.checked = claimComplete;
  }
  if (claimComplete) {
    text(
      "#claim-status",
      "This private token has already confirmed the supplier identity. You can review and submit the response."
    );
  }
}

function renderSupplierIdentity(companyName) {
  text("#supplier-name", companyName);
  const logo = companyLogoFor(companyName);
  const logoShell = document.querySelector("#supplier-logo-shell");
  const logoImage = document.querySelector("#supplier-logo");
  if (!(logoShell instanceof HTMLElement) || !(logoImage instanceof HTMLImageElement)) {
    return;
  }
  logoShell.hidden = !logo;
  if (logo) {
    logoImage.src = logo;
  } else {
    logoImage.removeAttribute("src");
  }
}

function supplierMatchReasons(payload, capabilities) {
  const candidates = [
    payload.matchReasons,
    payload.match?.reasons,
    payload.match?.explanation,
    payload.supplierMatch?.reasons,
    payload.supplierLead?.matchReasons,
    payload.invitation?.matchReasons
  ];
  const reasons = candidates.find(
    (candidate) => Array.isArray(candidate) && candidate.length > 0
  );
  if (reasons) return reasons;
  if (capabilities.length > 0) {
    return [
      `Your reviewed capability record aligns with ${capabilities.slice(0, 3).join(", ")}.`
    ];
  }
  return [
    "Your reviewed capability record aligns with the category and service location in this requirement."
  ];
}

function sourceDisclosure(payload) {
  if (payload.sourceDisclosure) return payload.sourceDisclosure;
  if (payload.supplierProfile?.sourceDisclosure) {
    return payload.supplierProfile.sourceDisclosure;
  }
  if (payload.supplierLead?.sourceMode === "live") {
    return "Matched from buyer-reviewed public supplier evidence. Public evidence indicates relevance only and is not identity, licence, insurance, KYC or availability verification.";
  }
  if (payload.supplierLead?.sourceMode === "fixture") {
    return "Matched from labelled deterministic fixture evidence for this demo. The supplier record is fictional and is not a verified business.";
  }
  return "Matched from Veltact's reviewed supplier catalogue. Catalogue evidence indicates relevance only and is not identity, licence, insurance, KYC or availability verification.";
}

function fillDemoResponse() {
  const selected =
    demoResponses.find((preset) => preset.id === demoSelect.value) ||
    demoResponses[0];
  if (!selected) return;

  const canHelp = form.querySelector('input[name="canHelp"][value="true"]');
  if (canHelp instanceof HTMLInputElement) canHelp.checked = true;
  setFormValue("earliestAvailability", selected.earliestAvailability);
  setFormValue("indicativePriceAud", String(selected.indicativePriceAud));
  setFormValue("relevantExperience", selected.relevantExperience);
  setFormValue("proposedApproach", selected.proposedApproach);
  setFormValue("assumptions", selected.assumptions.join("\n"));
  setFormValue("conditions", selected.conditions.join("\n"));
  updateDecisionFields();
  setFormStatus(`${selected.label} loaded. Review before submitting.`, "success");
}

async function submitResponse(event, invitationToken) {
  event.preventDefault();
  if (!invitationToken || !form.reportValidity()) return;

  submitButton.disabled = true;
  setFormStatus(
    claimComplete
      ? "Submitting opportunity response..."
      : "Confirming supplier identity...",
    "working"
  );

  const formData = new FormData(form);
  try {
    if (!claimComplete) {
      await claimInvitation(invitationToken, formData);
      claimComplete = true;
      setFormStatus("Identity confirmed. Submitting opportunity response...", "working");
    }

    const supplierResponse = await postSupplierResponse(
      invitationToken,
      responseValues(formData)
    );
    showSubmittedReceipt(supplierResponse, false);
  } catch (error) {
    submitButton.disabled = false;
    if (error instanceof SupplierFlowError) {
      if (error.kind === "expired" || error.kind === "closed") {
        showTerminalState(
          error.kind,
          error.kind === "expired" ? "Invitation expired" : "Responses are closed",
          error.message,
          true
        );
        return;
      }
      if (error.kind === "responded") {
        await loadOpportunity(invitationToken);
        return;
      }
    }
    setFormStatus(
      error instanceof Error ? error.message : "Unable to submit response.",
      "error"
    );
  }
}

async function claimInvitation(invitationToken, formData) {
  const body = {
    companyName: stringValue(formData, "companyName"),
    contactName: stringValue(formData, "contactName"),
    contactEmail: stringValue(formData, "contactEmail"),
    contactPhone: stringValue(formData, "contactPhone") || undefined,
    confirmsCompanyAuthority: true,
    sourceDisclosureAccepted:
      formData.get("sourceDisclosureAccepted") === "on"
  };
  const { response, payload } = await requestJson(
    `${API_BASE}/supplier-invitations/${encodeURIComponent(invitationToken)}/claim`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  if (response.ok) return payload;
  const message = payload.message || "Supplier identity could not be confirmed.";
  if (
    response.status === 409 &&
    /already claimed|identity already confirmed/i.test(message)
  ) {
    return payload;
  }
  throw flowError(response.status, message);
}

async function postSupplierResponse(invitationToken, values) {
  const endpoint = `${API_BASE}/supplier-invitations/${encodeURIComponent(
    invitationToken
  )}/responses`;
  const canonical = {
    canHelp: values.canHelp,
    decision: values.canHelp ? "can_help" : "cannot_help",
    earliestAvailability: values.earliestAvailability,
    availability: values.earliestAvailability,
    indicativePriceAud: values.indicativePriceAud,
    indicativePrice: {
      amount: values.indicativePriceAud * 100,
      currency: "AUD"
    },
    relevantExperience: values.relevantExperience,
    proposedApproach: values.proposedApproach,
    assumptions: values.assumptions,
    conditions: values.conditions
  };
  let result = await postJson(endpoint, canonical);

  if (
    result.response.status === 400 &&
    (result.payload.issues?.conditions ||
      /invalid supplier response/i.test(result.payload.message || ""))
  ) {
    result = await postJson(endpoint, {
      canHelp: values.canHelp,
      earliestAvailability: values.earliestAvailability,
      indicativePriceAud: values.indicativePriceAud,
      relevantExperience: values.relevantExperience,
      conditions: legacyConditions(values)
    });
  }

  if (!result.response.ok) {
    throw flowError(
      result.response.status,
      result.payload.message || "Response was not accepted."
    );
  }
  return result.payload.supplierResponse || result.payload.response;
}

function responseValues(formData) {
  const canHelp = formData.get("canHelp") === "true";
  const declineReason =
    stringValue(formData, "declineReason") ||
    "No further detail supplied for this declined opportunity.";
  return {
    canHelp,
    earliestAvailability: canHelp
      ? stringValue(formData, "earliestAvailability")
      : "Not available",
    indicativePriceAud: canHelp
      ? Number(formData.get("indicativePriceAud") || 0)
      : 0,
    relevantExperience: canHelp
      ? stringValue(formData, "relevantExperience")
      : "Not supplied for a declined opportunity.",
    proposedApproach: canHelp
      ? stringValue(formData, "proposedApproach")
      : "No approach proposed.",
    assumptions: canHelp
      ? lines(stringValue(formData, "assumptions"))
      : ["No assumptions supplied."],
    conditions: canHelp
      ? lines(stringValue(formData, "conditions"))
      : [declineReason]
  };
}

function legacyConditions(values) {
  return [
    `Proposed approach: ${values.proposedApproach}`,
    `Assumptions: ${values.assumptions.join("; ")}`,
    `Conditions: ${values.conditions.join("; ")}`
  ].join("\n\n");
}

function updateDecisionFields() {
  const canHelp =
    form.querySelector('input[name="canHelp"]:checked')?.value === "true";
  helpFields.hidden = !canHelp;
  declineReasonField.hidden = canHelp;
  helpFields.querySelectorAll("[data-help-required]").forEach((field) => {
    field.disabled = !canHelp;
    field.required = canHelp;
  });
}

function showSubmittedReceipt(supplierResponse, alreadySubmitted) {
  const canHelp =
    supplierResponse.canHelp ?? supplierResponse.decision === "can_help";
  const availability =
    supplierResponse.earliestAvailability ?? supplierResponse.availability;
  const indicativePriceAud =
    supplierResponse.indicativePriceAud ??
    (supplierResponse.indicativePrice
      ? supplierResponse.indicativePrice.amount / 100
      : undefined);
  const submittedAt =
    supplierResponse.submittedAt ||
    supplierResponse.updatedAt ||
    supplierResponse.createdAt;

  form.hidden = true;
  text(
    "#receipt-title",
    alreadySubmitted
      ? "This invitation already has a response"
      : "The buyer comparison is updated"
  );
  text("#receipt-decision", canHelp ? "Can help" : "Cannot help");
  text(
    "#receipt-availability",
    canHelp ? availability || "Not supplied" : "Not applicable"
  );
  text(
    "#receipt-price",
    canHelp && indicativePriceAud !== undefined
      ? formatMoney(indicativePriceAud)
      : "Not supplied"
  );
  text("#receipt-submitted", formatDateTime(submittedAt));
  text(
    "#receipt-reference",
    supplierResponse.id
      ? `Response reference ${String(supplierResponse.id).slice(-8).toUpperCase()}`
      : ""
  );
  receipt.hidden = false;
  setFormStatus("");
}

function handleLoadFailure(status, payload) {
  if (status === 410) {
    showTerminalState(
      "expired",
      "Invitation expired",
      payload.message || "Ask the buyer to issue a new private invitation."
    );
    return;
  }
  if (status === 409) {
    showTerminalState(
      "closed",
      "Invitation unavailable",
      payload.message || "This opportunity is no longer accepting responses."
    );
    return;
  }
  showTerminalState(
    "error",
    status === 404 ? "Invitation not found" : "Opportunity unavailable",
    payload.message ||
      "The private link is invalid or no longer available. No supplier information has been submitted."
  );
}

function showTerminalState(kind, title, copy, keepSummary = false) {
  if (!keepSummary) summary.hidden = true;
  form.hidden = true;
  receipt.hidden = true;
  const panel = document.querySelector("#page-state");
  panel.dataset.kind = kind;
  text("#page-state-label", kind === "error" ? "Private link" : "Invitation status");
  text("#page-state-title", title);
  text("#page-state-copy", copy);
  panel.hidden = false;
  setFormStatus("");
}

function flowError(status, message) {
  if (status === 410) return new SupplierFlowError("expired", message);
  if (status === 409 && /already responded/i.test(message)) {
    return new SupplierFlowError("responded", message);
  }
  if (status === 409) return new SupplierFlowError("closed", message);
  if (status === 404 && /claim|cannot post/i.test(message)) {
    return new SupplierFlowError(
      "unavailable",
      "Supplier confirmation is not available on this server. Your response has not been submitted."
    );
  }
  return new SupplierFlowError("error", message);
}

class SupplierFlowError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = "SupplierFlowError";
    this.kind = kind;
  }
}

async function postJson(url, body) {
  return requestJson(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function requestJson(url, init) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function isExpired(invitation) {
  return (
    invitation.status === "expired" ||
    (invitation.expiresAt && Date.parse(invitation.expiresAt) <= Date.now())
  );
}

function lines(value) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function stringValue(formData, name) {
  return String(formData.get(name) || "").trim();
}

function text(selector, value) {
  document.querySelector(selector).textContent =
    value === undefined || value === null || value === "" ? "-" : String(value);
}

function setFormStatus(message, tone) {
  statusEl.textContent = message;
  if (tone) statusEl.dataset.tone = tone;
  else delete statusEl.dataset.tone;
}

function setFormValue(name, value) {
  const field = form.elements.namedItem(name);
  if (field && "value" in field) field.value = value;
}

function formatMoney(amount) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0
  }).format(amount);
}

function formatDateTime(value) {
  if (!value || Number.isNaN(Date.parse(value))) return "Not supplied";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
