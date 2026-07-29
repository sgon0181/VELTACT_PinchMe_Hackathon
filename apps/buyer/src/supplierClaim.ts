import type {
  MarketplaceNeedProfile,
  SupplierClaim,
  SupplierCommercialResponse,
  SupplierInvitation,
  SupplierLead,
  SupplierProfile
} from "@veltact/contracts";
import { apiBaseUrl, demoControlsEnabled } from "./apiBase.js";
import { companyLogoFor } from "./companyLogos.js";
import {
  demoCommercialDraftForAction,
  demoCommercialFillAction,
  emptySupplierCommercialDraft,
  type SupplierCommercialDraft
} from "./supplierClaimCommercialDraft.js";

type ClaimState = {
  claim: Omit<SupplierClaim, "token">;
  invitation: Omit<SupplierInvitation, "token">;
  lead: SupplierLead;
  need: {
    id: string;
    companyName: string;
    profile: MarketplaceNeedProfile;
  };
  supplierProfile?: SupplierProfile;
  supplierResponse?: SupplierCommercialResponse;
};

const apiRoot = apiBaseUrl();
const v2Api = `${apiRoot.replace(/\/$/, "")}/v2`;
const app = document.querySelector<HTMLElement>("#claim-app");
const token = new URLSearchParams(window.location.search).get("token") ?? "";

let claimState: ClaimState | undefined;
let busyAction = "";
let errorText = "";
let successText = "";
let formDirty = false;
let demoControlsAvailable = false;

void loadClaim();
void demoControlsEnabled(apiRoot).then((enabled) => {
  demoControlsAvailable = enabled;
  if (!formDirty) render();
});
window.setInterval(() => {
  if (
    claimState &&
    !busyAction &&
    !formDirty &&
    !claimState.supplierResponse &&
    !document.activeElement?.closest("form") &&
    document.visibilityState === "visible"
  ) {
    void loadClaim(false);
  }
}, 3500);

function render() {
  if (!app) return;
  if (!token) {
    app.innerHTML = renderShell(
      `<div class="banner error">This supplier claim link is missing its secure token.</div>`
    );
    return;
  }
  if (!claimState) {
    app.innerHTML = renderShell(
      errorText
        ? `<div class="banner error">${escapeHtml(errorText)}</div>`
        : `<div class="banner">Loading buyer-approved opportunity...</div>`
    );
    return;
  }
  const { need, lead, supplierProfile, supplierResponse } = claimState;
  app.innerHTML = `
    <header class="claim-header">
      <a class="wordmark" href="./landing.html">
        <span class="wordmark-mark" aria-hidden="true"></span><span>Veltact</span>
      </a>
      <div class="claim-header-context">
        <span class="micro-label">Private supplier invitation</span>
        <span class="status-badge ${lead.lifecycleStatus}">${formatStatus(lead.lifecycleStatus)}</span>
      </div>
    </header>
    <section class="claim-hero">
      <span class="eyebrow">Buyer-approved opportunity / ${escapeHtml(need.companyName)}</span>
      <h1>${escapeHtml(need.profile.title)}</h1>
      <p>${escapeHtml(need.profile.description)}</p>
      <div class="chip-row">
        <span class="chip">${escapeHtml(need.profile.location)}</span>
        <span class="chip">${need.profile.urgencyDays ? `${need.profile.urgencyDays} day(s)` : "Timing to confirm"}</span>
        <span class="chip">${need.profile.budgetAud ? money(need.profile.budgetAud * 100) : "Budget to confirm"}</span>
      </div>
    </section>
    ${errorText ? `<div class="banner error">${escapeHtml(errorText)}</div>` : ""}
    ${successText ? `<div class="banner success">${escapeHtml(successText)}</div>` : ""}
    <div class="claim-stack">
      ${renderOpportunity()}
      ${renderLifecycle()}
      ${
        supplierProfile
          ? renderApprovedProfile(supplierProfile)
          : !supplierResponse
            ? renderProfileForm()
            : ""
      }
      ${
        supplierProfile &&
        [
          "supplier_profile_approved",
          "buyer_approved",
          "active_supplier"
        ].includes(lead.lifecycleStatus) &&
        !supplierResponse
          ? renderResponseForm()
          : ""
      }
      ${supplierResponse ? renderReceipt(supplierResponse) : ""}
    </div>
    <p class="footer-note">Secure capability link / No general Veltact account created / Independent verification not implied</p>
  `;
  syncConditionalForms();
}

function renderShell(content: string) {
  return `
    <header class="claim-header">
      <a class="wordmark" href="./landing.html">
        <span class="wordmark-mark" aria-hidden="true"></span><span>Veltact</span>
      </a>
      <span class="micro-label">Supplier claim</span>
    </header>
    <section class="claim-hero"><span class="eyebrow">Supplier opportunity</span><h1>Review the invitation</h1></section>
    ${content}
  `;
}

function renderOpportunity() {
  if (!claimState) return "";
  const { lead, need } = claimState;
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <span class="micro-label">Why Veltact contacted you</span>
          <h2>${renderCompanyIdentity(lead.companyName)}</h2>
          <p>A buyer reviewed this discovery evidence and approved one direct invitation. No supplier profile is activated unless you claim and approve it.</p>
        </div>
        <span class="mode-badge ${lead.sourceMode}">${lead.sourceMode}</span>
      </div>
      <div class="detail-columns">
        <div>
          <h4>Public match evidence</h4>
          <ul class="compact-list">${lead.matchReasons.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </div>
        <div>
          <h4>Required capabilities</h4>
          <div class="chip-row">${(need.profile.requiredCapabilities ?? []).map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join("")}</div>
        </div>
      </div>
      <div class="provenance-note" style="margin-top: 16px">
        Discovery is not verification, consent, availability, or enrolment. Review and correct the generated profile below before approving it.
      </div>
    </section>
  `;
}

function renderLifecycle() {
  if (!claimState) return "";
  const status = claimState.lead.lifecycleStatus;
  const stages = [
    {
      title: "Buyer approved outreach",
      detail: "The candidate was reviewed for this specific requirement.",
      complete: status !== "discovered" && status !== "approved_for_outreach"
    },
    {
      title: "Supplier approves profile",
      detail: "Can-help suppliers correct and approve the generated business profile.",
      complete: Boolean(claimState.supplierProfile)
    },
    {
      title: "Commercial response",
      detail: "Submit comparable availability, price, approach and experience.",
      complete: Boolean(claimState.supplierResponse)
    },
    {
      title: "Buyer selects supplier",
      detail: "Selection activates the supplier and creates the deployment record.",
      complete: status === "active_supplier"
    }
  ];
  return `
    <section class="panel">
      <div class="panel-header"><div><span class="micro-label">Controlled onboarding</span><h2>Claim path</h2></div></div>
      ${stages
        .map(
          (stage, index) => `<div class="claim-stage">
            <span class="claim-stage-index">${stage.complete ? "OK" : `0${index + 1}`}</span>
            <div><h3>${escapeHtml(stage.title)}</h3><p>${escapeHtml(stage.detail)}</p></div>
          </div>`
        )
        .join("")}
    </section>
  `;
}

function renderProfileForm() {
  if (!claimState) return "";
  const lead = claimState.lead;
  return `
    <form id="profile-form" class="panel claim-form">
      <div class="panel-header">
        <div><span class="micro-label">Supplier-controlled response</span><h2>Review and respond</h2><p>Confirm who is responding, then choose whether this opportunity is a fit.</p></div>
      </div>
      <div class="field-grid">
        <label class="field">Decision
          <select name="decision" data-response-decision><option value="can_help">Can help</option><option value="cannot_help">Cannot help</option></select>
        </label>
        ${inputField("Your name", "contactName", lead.contactName ?? "", true)}
        ${inputField("Your email", "contactEmail", lead.contactEmail ?? "", true, "email")}
        ${inputField("Phone", "contactPhone", lead.contactPhone ?? "", false, "tel")}
      </div>
      <div data-can-help-fields>
        <div class="provenance-note">Review and correct the generated profile before submitting commercial terms. These fields become supplier-approved evidence, not a Veltact verification claim.</div>
        <div class="field-grid" style="margin-top: 16px">
          ${inputField("Company name", "companyName", lead.companyName, true)}
          ${inputField("Website", "website", lead.website, true, "url")}
          ${inputField("Location", "location", lead.location, true)}
          ${inputField("Service regions", "serviceRegions", lead.serviceRegions.join(", "), true)}
          ${inputField("Industries", "industries", "Manufacturing, Industrial", true)}
          ${inputField("Categories", "categories", "Industrial services", true)}
          ${inputField("Capabilities", "capabilities", lead.capabilities.join(", "), true)}
          ${inputField("Certifications", "certifications", "", false, "text", "Supplier-declared only")}
          <label class="field is-wide">Profile summary<textarea name="profileSummary" rows="4" required>${escapeHtml(`${lead.companyName} provides ${lead.capabilities.join(", ")} for industrial sites across ${lead.serviceRegions.join(", ")}.`)}</textarea></label>
        </div>
      </div>
      <div data-decline-fields hidden>
        <label class="field is-wide">Reason (optional)<textarea name="declineReason" rows="3" placeholder="For example: unavailable in the required window or outside our service scope"></textarea></label>
      </div>
      <label class="selection-box">
        <input name="confirmAuthority" type="checkbox" required />
        <span>I am authorised to respond for this business and confirm the information I submit is accurate to the best of my knowledge.</span>
      </label>
      <div class="claim-actions">
        <button class="button ${busyAction === "profile" ? "is-loading" : ""}" type="submit" data-submit-label ${busyAction ? "disabled" : ""}>Approve profile and continue</button>
        <span class="micro-label">No subscription or marketplace fee</span>
      </div>
      <div class="banner" data-form-status role="status" hidden></div>
    </form>
  `;
}

function renderApprovedProfile(profile: SupplierProfile) {
  if (!claimState) return "";
  const active = claimState.lead.lifecycleStatus === "active_supplier";
  const declined = claimState.lead.lifecycleStatus === "declined";
  return `
    <section class="panel">
      <div class="panel-header">
        <div><span class="micro-label">Supplier-approved profile</span><h2>${renderCompanyIdentity(profile.companyName)}</h2><p>${escapeHtml(profile.profileSummary)}</p></div>
        <span class="status-badge ${claimState.lead.lifecycleStatus}">${formatStatus(claimState.lead.lifecycleStatus)}</span>
      </div>
      <div class="chip-row">${profile.capabilities.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join("")}</div>
      ${
        active
          ? `<div class="banner success" style="margin-top: 16px">The buyer selected and activated this supplier for the requirement.</div>`
          : declined
            ? `<div class="banner" style="margin-top: 16px">Profile confirmed. This invitation was subsequently declined.</div>`
          : `<div class="banner success" style="margin-top: 16px">Profile confirmed. Submit the commercial response below; buyer selection activates the supplier.</div>`
      }
      <button class="button secondary small" data-action="refresh" type="button" style="margin-top: 12px">Refresh status</button>
    </section>
  `;
}

function renderResponseForm() {
  const draft = emptySupplierCommercialDraft();
  return `
    <form id="response-form" class="panel claim-form">
      <div class="panel-header">
        <div><span class="micro-label">Standardised response</span><h2>Return your decision</h2><p>Commercial detail is required only when you can help.</p></div>
      </div>
      ${
        demoControlsAvailable
          ? `<div class="banner warning" data-demo-commercial-fill>
              <strong>Demo-only commercial fixture</strong>
              <p>These synthetic values are not supplier evidence. Use them only to exercise the local demo, then review every field before submission.</p>
              <button class="button tertiary small" data-action="${demoCommercialFillAction}" type="button">Demo only: fill sample commercial response</button>
            </div>`
          : ""
      }
      <div class="field-grid">
        <label class="field">Decision
          <select name="decision" data-response-decision><option value="can_help">Can help</option><option value="cannot_help">Cannot help</option></select>
        </label>
      </div>
      <div data-can-help-fields>
        <div class="field-grid">
          ${inputField("Availability", "availability", draft.availability, true, "text", "State confirmed availability")}
          <label class="field">Indicative price (AUD)<input name="indicativePriceAud" type="number" min="1" step="1" value="${escapeHtml(draft.indicativePriceAud)}" placeholder="Enter an indicative amount" required /></label>
          ${inputField("Relevant experience", "relevantExperience", draft.relevantExperience, true, "text", "Describe comparable supplier experience")}
          <label class="field is-wide">Proposed approach<textarea name="proposedApproach" rows="4" placeholder="Describe your proposed delivery approach" required>${escapeHtml(draft.proposedApproach)}</textarea></label>
          ${inputField("Assumptions", "assumptions", draft.assumptions, false, "text", "Comma separated")}
          ${inputField("Conditions", "conditions", draft.conditions, false, "text", "Comma separated")}
        </div>
      </div>
      <div data-decline-fields hidden>
        <label class="field is-wide">Reason (optional)<textarea name="declineReason" rows="3" placeholder="For example: unavailable in the required window or outside our service scope"></textarea></label>
      </div>
      <div class="claim-actions">
        <button class="button ${busyAction === "response" ? "is-loading" : ""}" type="submit" data-submit-label ${busyAction ? "disabled" : ""}>Submit response to buyer</button>
      </div>
      <div class="banner" data-form-status role="status" hidden></div>
    </form>
  `;
}

function renderReceipt(response: SupplierCommercialResponse) {
  if (response.decision === "cannot_help") {
    return `
      <section class="panel">
        <div class="panel-header">
          <div><span class="micro-label">Response received</span><h2>Buyer notified</h2><p>Thanks for closing the loop. No supplier profile or commercial detail was required.</p></div>
          <span class="status-badge failed">${formatStatus(response.decision)}</span>
        </div>
        <dl class="data-grid">
          <div><dt>Reason</dt><dd>${escapeHtml(response.declineReason ?? "No reason provided")}</dd></div>
          <div><dt>Submitted</dt><dd>${formatDateTime(response.submittedAt)}</dd></div>
          <div><dt>Engagement</dt><dd>Invitation declined</dd></div>
        </dl>
      </section>
    `;
  }
  return `
    <section class="panel">
      <div class="panel-header">
        <div><span class="micro-label">Response received</span><h2>Buyer comparison updated</h2><p>Your standardised response is visible in the buyer workspace.</p></div>
        <span class="status-badge active_supplier">${formatStatus(response.decision)}</span>
      </div>
      <dl class="data-grid">
        <div><dt>Availability</dt><dd>${escapeHtml(response.availability)}</dd></div>
        <div><dt>Indicative price</dt><dd>${money(response.indicativePrice.amount)}</dd></div>
        <div><dt>Submitted</dt><dd>${formatDateTime(response.submittedAt)}</dd></div>
        <div><dt>Engagement</dt><dd>Buyer selection required</dd></div>
      </dl>
    </section>
  `;
}

if (app) {
  app.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    if (form.id === "profile-form") void submitProfile(form);
    if (form.id === "response-form") void submitResponse(form);
  });
  app.addEventListener("click", (event) => {
    const actionTarget = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-action]"
    );
    const action = actionTarget?.dataset.action;
    if (action === "refresh") void loadClaim();
    if (action === demoCommercialFillAction) {
      const form = actionTarget?.closest<HTMLFormElement>("#response-form");
      const draft = demoCommercialDraftForAction(
        action,
        demoControlsAvailable,
        responseIsRobotics()
      );
      if (!form || !draft) return;
      applyCommercialDraft(form, draft);
      formDirty = true;
      setFormStatus(
        form,
        "Demo-only synthetic commercial values filled locally. Review and replace them before submitting supplier evidence.",
        "warning"
      );
    }
  });
  app.addEventListener("change", (event) => {
    const decision = (event.target as HTMLElement).closest<
      HTMLSelectElement
    >("[data-response-decision]");
    const form = decision?.closest<HTMLFormElement>("form");
    if (form) {
      formDirty = true;
      updateConditionalFields(form);
    }
  });
  app.addEventListener("input", (event) => {
    if ((event.target as HTMLElement).closest("form")) {
      formDirty = true;
    }
  });
}

async function loadClaim(showLoading = true) {
  if (!token) {
    render();
    return;
  }
  if (showLoading && !claimState) render();
  try {
    claimState = await api<ClaimState>(
      `/supplier-claims/${encodeURIComponent(token)}`
    );
    errorText = "";
    render();
  } catch (error) {
    errorText = errorMessage(error);
    render();
  }
}

async function submitProfile(form: HTMLFormElement) {
  const values = new FormData(form);
  await runFormAction(form, "profile", async () => {
    const decision = requiredValue(values, "decision");
    if (decision === "cannot_help") {
      await api(`/supplier-claims/${encodeURIComponent(token)}/claim`, {
        method: "POST",
        body: JSON.stringify({
          claimantName: requiredValue(values, "contactName"),
          claimantEmail: requiredValue(values, "contactEmail")
        })
      });
      await api(`/supplier-claims/${encodeURIComponent(token)}/response`, {
        method: "POST",
        body: JSON.stringify({
          decision,
          declineReason: optionalValue(values, "declineReason")
        })
      });
      successText = "Your decline response was submitted to the buyer.";
      formDirty = false;
      await loadClaim(false);
      return;
    }
    await api(`/supplier-claims/${encodeURIComponent(token)}/profile`, {
      method: "POST",
      body: JSON.stringify({
        companyName: requiredValue(values, "companyName"),
        website: requiredValue(values, "website"),
        contactName: requiredValue(values, "contactName"),
        contactEmail: requiredValue(values, "contactEmail"),
        contactPhone: optionalValue(values, "contactPhone"),
        location: requiredValue(values, "location"),
        categories: listValue(values, "categories"),
        industries: listValue(values, "industries"),
        serviceRegions: listValue(values, "serviceRegions"),
        capabilities: listValue(values, "capabilities"),
        certifications: listValue(values, "certifications"),
        profileSummary: requiredValue(values, "profileSummary")
      })
    });
    successText =
      "Profile confirmed. Submit the commercial response below.";
    formDirty = false;
    await loadClaim(false);
  });
}

async function submitResponse(form: HTMLFormElement) {
  const values = new FormData(form);
  await runFormAction(form, "response", async () => {
    const decision = requiredValue(values, "decision");
    const payload =
      decision === "cannot_help"
        ? {
            decision,
            declineReason: optionalValue(values, "declineReason")
          }
        : canHelpResponsePayload(values);
    await api(`/supplier-claims/${encodeURIComponent(token)}/response`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    successText =
      decision === "can_help"
        ? "Commercial response submitted to the buyer."
        : "Your decline response was submitted to the buyer.";
    formDirty = false;
    await loadClaim(false);
  });
}

function canHelpResponsePayload(values: FormData) {
  const indicativePriceAud = Number(
    requiredValue(values, "indicativePriceAud")
  );
  if (!Number.isFinite(indicativePriceAud) || indicativePriceAud <= 0) {
    throw new Error("Enter an indicative price greater than AUD 0.");
  }
  return {
    decision: "can_help" as const,
    availability: requiredValue(values, "availability"),
    indicativePriceAud,
    proposedApproach: requiredValue(values, "proposedApproach"),
    relevantExperience: requiredValue(values, "relevantExperience"),
    assumptions: listValue(values, "assumptions"),
    conditions: listValue(values, "conditions")
  };
}

function responseIsRobotics() {
  return /robot|cobot|palletis/i.test(
    [
      claimState?.need.profile.title,
      claimState?.need.profile.description,
      claimState?.need.profile.category
    ].join(" ")
  );
}

function applyCommercialDraft(
  form: HTMLFormElement,
  draft: SupplierCommercialDraft
) {
  const values: Record<
    Exclude<keyof SupplierCommercialDraft, "source">,
    string
  > = {
    availability: draft.availability,
    indicativePriceAud: draft.indicativePriceAud,
    relevantExperience: draft.relevantExperience,
    proposedApproach: draft.proposedApproach,
    assumptions: draft.assumptions,
    conditions: draft.conditions
  };
  for (const [name, value] of Object.entries(values)) {
    const field = form.elements.namedItem(name);
    if (
      field instanceof HTMLInputElement ||
      field instanceof HTMLTextAreaElement
    ) {
      field.value = value;
    }
  }
}

async function runFormAction(
  form: HTMLFormElement,
  action: string,
  operation: () => Promise<void>
) {
  if (busyAction) return;
  busyAction = action;
  errorText = "";
  successText = "";
  setFormStatus(form);
  const submitButtons = Array.from(
    form.querySelectorAll<HTMLButtonElement>('button[type="submit"]')
  );
  for (const button of submitButtons) {
    button.disabled = true;
    button.classList.add("is-loading");
  }
  try {
    await operation();
  } catch (error) {
    setFormStatus(form, errorMessage(error), "error");
  } finally {
    busyAction = "";
    if (form.isConnected) {
      for (const button of submitButtons) {
        button.disabled = false;
        button.classList.remove("is-loading");
      }
    } else {
      render();
    }
  }
}

async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${v2Api}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
    issues?: Record<string, string[] | undefined>;
  };
  if (!response.ok) {
    const issue = Object.values(payload.issues ?? {})
      .flatMap((messages) => messages ?? [])
      .find(Boolean);
    const message =
      payload.message && payload.message !== "Invalid Veltact V2 request"
        ? payload.message
        : issue;
    throw new Error(message ?? `Request failed (${response.status})`);
  }
  return payload as T;
}

function syncConditionalForms() {
  app
    ?.querySelectorAll<HTMLFormElement>("#profile-form, #response-form")
    .forEach(updateConditionalFields);
}

function updateConditionalFields(form: HTMLFormElement) {
  const canHelp =
    form.querySelector<HTMLSelectElement>("[data-response-decision]")?.value !==
    "cannot_help";
  toggleFieldGroup(form, "[data-can-help-fields]", canHelp);
  toggleFieldGroup(form, "[data-decline-fields]", !canHelp);
  const submit = form.querySelector<HTMLButtonElement>("[data-submit-label]");
  if (submit) {
    submit.textContent =
      form.id === "profile-form"
        ? canHelp
          ? "Approve profile and continue"
          : "Submit decline to buyer"
        : canHelp
          ? "Submit response to buyer"
          : "Submit decline to buyer";
  }
}

function toggleFieldGroup(
  form: HTMLFormElement,
  selector: string,
  enabled: boolean
) {
  for (const group of Array.from(
    form.querySelectorAll<HTMLElement>(selector)
  )) {
    group.hidden = !enabled;
    for (const field of Array.from(
      group.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >("input, select, textarea")
    )) {
      field.disabled = !enabled;
    }
  }
}

function setFormStatus(
  form: HTMLFormElement,
  message = "",
  kind: "error" | "success" | "warning" = "success"
) {
  const status = form.querySelector<HTMLElement>("[data-form-status]");
  if (!status) return;
  status.hidden = !message;
  status.className = `banner ${kind}`;
  status.textContent = message;
}

function inputField(
  label: string,
  name: string,
  value: string,
  required: boolean,
  type = "text",
  placeholder = ""
) {
  return `<label class="field">${escapeHtml(label)}<input name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" ${required ? "required" : ""} placeholder="${escapeHtml(placeholder)}" /></label>`;
}

function requiredValue(values: FormData, name: string) {
  const value = String(values.get(name) ?? "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optionalValue(values: FormData, name: string) {
  return String(values.get(name) ?? "").trim() || undefined;
}

function listValue(values: FormData, name: string) {
  return String(values.get(name) ?? "")
    .split(/,|\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function money(amountInCents: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0
  }).format(amountInCents / 100);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderCompanyIdentity(companyName: string) {
  const logo = companyLogoFor(companyName);
  if (!logo) return escapeHtml(companyName);
  return `
    <span class="company-identity">
      <span class="company-logo-shell" aria-hidden="true">
        <img class="company-logo" src="${logo}" alt="" />
      </span>
      <span class="company-name-text">${escapeHtml(companyName)}</span>
    </span>
  `;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected Veltact error";
}
