import type {
  MarketplaceNeedProfile,
  SupplierClaim,
  SupplierCommercialResponse,
  SupplierInvitation,
  SupplierLead,
  SupplierProfile
} from "@veltact/contracts";

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

const runtimeWindow = window as Window & { API_BASE_URL?: string };
const apiRoot =
  runtimeWindow.API_BASE_URL ??
  (["localhost", "127.0.0.1"].includes(window.location.hostname) &&
  window.location.port !== "4000"
    ? "http://localhost:4000/api"
    : `${window.location.origin}/api`);
const v2Api = `${apiRoot.replace(/\/$/, "")}/v2`;
const app = document.querySelector<HTMLElement>("#claim-app");
const token = new URLSearchParams(window.location.search).get("token") ?? "";

let claimState: ClaimState | undefined;
let busyAction = "";
let errorText = "";
let successText = "";

void loadClaim();
window.setInterval(() => {
  if (
    claimState &&
    !busyAction &&
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
      ${!supplierProfile ? renderProfileForm() : renderApprovedProfile(supplierProfile)}
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
          <h2>${escapeHtml(lead.companyName)}</h2>
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
      detail: "You correct the generated business profile and explicitly claim it.",
      complete: [
        "supplier_profile_approved",
        "buyer_approved",
        "active_supplier"
      ].includes(status)
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
        <div><span class="micro-label">Supplier-controlled profile</span><h2>Review, correct and claim</h2><p>Every field below becomes supplier-approved evidence, not a Veltact verification claim.</p></div>
      </div>
      <div class="field-grid">
        ${inputField("Company name", "companyName", lead.companyName, true)}
        ${inputField("Website", "website", lead.website, true, "url")}
        ${inputField("Your name", "contactName", lead.contactName ?? "", true)}
        ${inputField("Your email", "contactEmail", lead.contactEmail ?? "", true, "email")}
        ${inputField("Phone", "contactPhone", lead.contactPhone ?? "", false, "tel")}
        ${inputField("Location", "location", lead.location, true)}
        ${inputField("Service regions", "serviceRegions", lead.serviceRegions.join(", "), true)}
        ${inputField("Industries", "industries", "Manufacturing, Industrial", true)}
        ${inputField("Categories", "categories", "Industrial services", true)}
        ${inputField("Capabilities", "capabilities", lead.capabilities.join(", "), true)}
        ${inputField("Certifications", "certifications", "", false, "text", "Supplier-declared only")}
        <label class="field is-wide">Profile summary<textarea name="profileSummary" rows="4" required>${escapeHtml(`${lead.companyName} provides ${lead.capabilities.join(", ")} for industrial sites across ${lead.serviceRegions.join(", ")}.`)}</textarea></label>
      </div>
      <label class="selection-box">
        <input name="confirmProfile" type="checkbox" required />
        <span>I am authorised to review this business profile and confirm the submitted information is accurate to the best of my knowledge.</span>
      </label>
      <div class="claim-actions">
        <button class="button ${busyAction === "profile" ? "is-loading" : ""}" type="submit" ${busyAction ? "disabled" : ""}>Approve profile and claim opportunity</button>
        <span class="micro-label">No subscription or marketplace fee</span>
      </div>
    </form>
  `;
}

function renderApprovedProfile(profile: SupplierProfile) {
  if (!claimState) return "";
  const active = claimState.lead.lifecycleStatus === "active_supplier";
  return `
    <section class="panel">
      <div class="panel-header">
        <div><span class="micro-label">Supplier-approved profile</span><h2>${escapeHtml(profile.companyName)}</h2><p>${escapeHtml(profile.profileSummary)}</p></div>
        <span class="status-badge ${claimState.lead.lifecycleStatus}">${formatStatus(claimState.lead.lifecycleStatus)}</span>
      </div>
      <div class="chip-row">${profile.capabilities.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join("")}</div>
      ${
        active
          ? `<div class="banner success" style="margin-top: 16px">The buyer selected and activated this supplier for the requirement.</div>`
          : `<div class="banner success" style="margin-top: 16px">Profile confirmed. Submit the commercial response below; buyer selection activates the supplier.</div>`
      }
      <button class="button secondary small" data-action="refresh" type="button" style="margin-top: 12px">Refresh status</button>
    </section>
  `;
}

function renderResponseForm() {
  const robotics = /robot|cobot|palletis/i.test(
    [
      claimState?.need.profile.title,
      claimState?.need.profile.description,
      claimState?.need.profile.category
    ].join(" ")
  );
  const availability = robotics
    ? "Discovery workshop within five business days"
    : "Site review within four hours";
  const indicativePrice = robotics ? "78000" : "6500";
  const experience = robotics
    ? "Comparable robotic cell feasibility, tooling, safety and commissioning delivery."
    : "Comparable industrial controls and packaging-line recovery.";
  const approach = robotics
    ? "Validate the process and safety concept, prove the highest-risk handling assumptions, then deliver design, build, factory acceptance, commissioning and handover as separately accepted milestones."
    : "Review the supplied evidence, verify scope and safety controls, then execute the buyer-approved recovery plan with milestone acceptance evidence.";
  const assumptions = robotics
    ? "Representative products available, site services and access window to be confirmed"
    : "Site representative available, access window confirmed";
  const conditions = robotics
    ? "Final equipment selection subject to feasibility and machinery risk assessment"
    : "Work subject to site isolation and permit procedures";
  return `
    <form id="response-form" class="panel claim-form">
      <div class="panel-header">
        <div><span class="micro-label">Standardised response</span><h2>Return comparable commercial intent</h2><p>This private invitation submits availability, price and delivery assumptions directly into the buyer comparison.</p></div>
      </div>
      <div class="field-grid">
        <label class="field">Decision
          <select name="decision"><option value="can_help">Can help</option><option value="cannot_help">Cannot help</option></select>
        </label>
        ${inputField("Availability", "availability", availability, true)}
        ${inputField("Indicative price (AUD)", "indicativePriceAud", indicativePrice, true, "number")}
        ${inputField("Relevant experience", "relevantExperience", experience, true)}
        <label class="field is-wide">Proposed approach<textarea name="proposedApproach" rows="4" required>${escapeHtml(approach)}</textarea></label>
        ${inputField("Assumptions", "assumptions", assumptions, false)}
        ${inputField("Conditions", "conditions", conditions, false)}
      </div>
      <div class="claim-actions">
        <button class="button ${busyAction === "response" ? "is-loading" : ""}" type="submit" ${busyAction ? "disabled" : ""}>Submit response to buyer</button>
      </div>
    </form>
  `;
}

function renderReceipt(response: SupplierCommercialResponse) {
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
    const action = (event.target as HTMLElement)
      .closest<HTMLElement>("[data-action]")
      ?.dataset.action;
    if (action === "refresh") void loadClaim();
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
  await runAction("profile", async () => {
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
    await loadClaim(false);
    successText =
      "Profile confirmed. Submit the commercial response below.";
  });
}

async function submitResponse(form: HTMLFormElement) {
  const values = new FormData(form);
  await runAction("response", async () => {
    await api(`/supplier-claims/${encodeURIComponent(token)}/response`, {
      method: "POST",
      body: JSON.stringify({
        decision: requiredValue(values, "decision"),
        availability: requiredValue(values, "availability"),
        indicativePriceAud: Number(
          requiredValue(values, "indicativePriceAud")
        ),
        proposedApproach: requiredValue(values, "proposedApproach"),
        relevantExperience: requiredValue(values, "relevantExperience"),
        assumptions: listValue(values, "assumptions"),
        conditions: listValue(values, "conditions")
      })
    });
    await loadClaim(false);
    successText = "Commercial response submitted to the buyer.";
  });
}

async function runAction(action: string, operation: () => Promise<void>) {
  if (busyAction) return;
  busyAction = action;
  errorText = "";
  successText = "";
  render();
  try {
    await operation();
  } catch (error) {
    errorText = errorMessage(error);
  } finally {
    busyAction = "";
    render();
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
  };
  if (!response.ok) {
    throw new Error(payload.message ?? `Request failed (${response.status})`);
  }
  return payload as T;
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected Veltact error";
}
