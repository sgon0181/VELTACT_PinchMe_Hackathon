import type { AiIntakeResult } from "@veltact/contracts";
import { BackendAiIntakeService, type IntakeEvidence } from "./aiIntakeService.js";
import { RapidMatchService } from "./rapidMatchService.js";
import type { BuyerRequirementInput, BuyerWorkspace, PrioritySignal } from "./types.js";

type Stage = "submit" | "profile" | "matches" | "selected" | "payment" | "secured";
type LoadState = "idle" | "loading" | "error" | "success";
type OutreachStatus = "ready" | "not_sent" | "queued" | "sent" | "failed" | "viewed" | "responded";

const service = new RapidMatchService();
const aiIntakeService = new BackendAiIntakeService();
const app = document.querySelector<HTMLDivElement>("#app");
const runtimeWindow = window as Window & { API_BASE_URL?: string };
const localDemoMode = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const realtimeOrigin = new URL(
  runtimeWindow.API_BASE_URL ??
    (["localhost", "127.0.0.1"].includes(window.location.hostname) && window.location.port !== "4000"
      ? "http://localhost:4000/api"
      : `${window.location.origin}/api`)
).origin;
const rapidMatchSocketEvent = {
  joinNeedProfile: "rapidmatch:need.join",
  leaveNeedProfile: "rapidmatch:need.leave",
  invitationSent: "rapidmatch:invitation.sent",
  outreachDeliveryUpdated: "rapidmatch:outreach.delivery_updated",
  supplierResponseSubmitted: "rapidmatch:response.submitted",
  paymentStatusUpdated: "rapidmatch:payment.status_updated",
  engagementSecured: "rapidmatch:engagement.secured"
} as const;

type RealtimeSocket = {
  emit(eventName: string, payload: { needProfileId: string }): void;
  on(eventName: string, handler: (payload: RealtimePayload) => void): void;
};

type SocketIoFactory = (origin: string, options: { transports: string[]; reconnection: boolean }) => RealtimeSocket;
type RealtimePayload = {
  needProfileId?: string;
  supplierInvitation?: {
    status?: string;
  };
  supplierResponse?: {
    decision?: string;
  };
  outreachDelivery?: {
    channel?: "email" | "sms";
    deliveryStatus?: "not_sent" | "queued" | "sent" | "failed";
  };
};

const socketWindow = window as Window & { io?: SocketIoFactory };

let stage: Stage = "submit";
let loadState: LoadState = "idle";
let errorMessage = "";
let liveMessage = "";
let priority: PrioritySignal = "speed";
let selectedResponseId = "";
let workspace: BuyerWorkspace | undefined;
let outreachSent = false;
let structuredDraftMessage = "";
let aiIntakeResult: AiIntakeResult | undefined;
let intakeEvidence: IntakeEvidence[] = [];
let pollHandle: number | undefined;
let isPolling = false;
let realtimeSocket: RealtimeSocket | undefined;
let joinedNeedProfileId = "";
let realtimeClientLoading: Promise<void> | undefined;

const defaultInput: BuyerRequirementInput = {
  companyName: "",
  contactName: "",
  contactEmail: "",
  title: "",
  description: "",
  category: "",
  equipmentOrTechnology: [],
  requiredCapabilities: [],
  location: "",
  requiredBy: "",
  budgetRange: "",
  budgetAmount: 0,
  constraints: []
};

let intakeDraft: BuyerRequirementInput = { ...defaultInput };
let intakeUrgencySignal = "";

const demoInput: BuyerRequirementInput = {
  companyName: "HarbourPack Manufacturing",
  contactName: "Elena Morris",
  contactEmail: "elena.morris@harbourpack.example",
  title: "Urgent PLC fault on packaging conveyor",
  description:
    "Main packaging conveyor stopped after intermittent PLC faults. We need an industrial automation supplier to diagnose the fault, restore safe production and advise on any replacement parts.",
  category: "Industrial automation",
  equipmentOrTechnology: ["Siemens PLC", "Packaging conveyor"],
  requiredCapabilities: ["Siemens PLC diagnostics", "PLC fault finding", "Same-day onsite support"],
  location: "Western Sydney, NSW",
  requiredBy: "Today",
  budgetRange: "Up to AUD 1,800 callout tolerance",
  budgetAmount: 1800,
  constraints: ["Production environment", "Minimal downtime"]
};

function render() {
  if (!app) return;
  app.innerHTML = `
    <section class="hero ${workspace ? "" : "hero-intake"}">
      <div>
        <p class="eyebrow">Veltact</p>
        <h1>Describe what you need. The right industrial suppliers respond.</h1>
        <p class="hero-copy">Submit one requirement and receive comparable responses from relevant, available providers.</p>
      </div>
      ${workspace ? renderStatusPanel() : ""}
    </section>
    ${renderProgress()}
    ${renderStateBanner()}
    <section class="workspace">
      ${renderCurrentStage()}
    </section>
  `;
  bindEvents();
  configureRealtime();
  configurePolling();
}

function renderStatusPanel() {
  const engagement = workspace?.engagement;
  const payment = engagement?.paymentStatus ?? "not_started";
  const status = engagement?.status ?? workspace?.needProfile.status ?? "draft";
  return `
    <aside class="status-panel">
      <span class="status-label">Engagement</span>
      <strong>${formatStatus(status)}</strong>
      <span class="status-label">Payment</span>
      <strong>${formatStatus(payment)}</strong>
    </aside>
  `;
}

function renderProgress() {
  const steps: Array<[Stage, string]> = [
    ["submit", "Submit"],
    ["profile", "Need Profile"],
    ["matches", "Compare"],
    ["selected", "Select"],
    ["payment", "Payment"],
    ["secured", "Secured"]
  ];
  const activeIndex = steps.findIndex(([key]) => key === stage);
  return `
    <nav class="progress" aria-label="Buyer workflow progress">
      ${steps
        .map(
          ([key, label], index) => `
            <span class="progress-step ${index <= activeIndex ? "is-active" : ""}">
              <span>${index + 1}</span>${label}
            </span>
          `
        )
        .join("")}
    </nav>
  `;
}

function renderStateBanner() {
  if (liveMessage) {
    return `<div class="banner is-live">${escapeHtml(liveMessage)}</div>`;
  }
  if (loadState === "loading") {
    return `<div class="banner is-loading"><span class="spinner"></span>Updating RapidMatch workspace...</div>`;
  }
  if (loadState === "error") {
    return `<div class="banner is-error">${escapeHtml(errorMessage || "Something went wrong. Try again.")}</div>`;
  }
  if (loadState === "success") {
    return `<div class="banner is-success">Workspace updated successfully.</div>`;
  }
  return "";
}

function renderCurrentStage() {
  if (stage === "submit") return renderSubmit();
  if (stage === "profile" && workspace) return renderProfile(workspace);
  if (stage === "matches" && workspace) return renderMatches(workspace);
  if (stage === "selected" && workspace) return renderSelection(workspace);
  if (stage === "payment" && workspace) return renderPayment(workspace);
  if (stage === "secured" && workspace) return renderSecured(workspace);
  return renderEmpty("No workspace loaded", "Submit a requirement to generate the buyer workspace.");
}

function renderSubmit() {
  return `
    <form id="requirement-form" class="panel intake-form">
      <div class="panel-heading">
        <p class="eyebrow">Step 1</p>
        <h2>AI-assisted intake</h2>
        <p class="muted">Paste messy factory context, structure it into a supplier-ready requirement, then review or edit every field manually before matching.</p>
      </div>
      <section class="ai-intake-panel">
        <div>
          <strong>Messy problem text</strong>
          <p>Add written notes, a PDF, or a photo. The wrapper structures supplier requirements; it does not diagnose the machine.</p>
        </div>
        <button id="structure-button" class="primary" type="button">Structure requirement</button>
      </section>
      <section class="evidence-panel">
        <label class="field evidence-written">
          <span>Written notes</span>
          <textarea name="writtenEvidence" rows="4" placeholder="Paste alarm text, maintenance notes, shift handover details, or supplier context."></textarea>
        </label>
        <label class="field">
          <span>PDF evidence</span>
          <input name="pdfEvidence" type="file" accept="application/pdf,.pdf,text/plain,.txt" />
        </label>
        <label class="field">
          <span>Photograph evidence</span>
          <input name="photoEvidence" type="file" accept="image/*" />
        </label>
      </section>
      ${intakeEvidence.length ? renderEvidenceSummary(intakeEvidence) : ""}
      ${structuredDraftMessage ? `<div class="draft-banner">${escapeHtml(structuredDraftMessage)}</div>` : ""}
      ${aiIntakeResult ? renderAiIntakeResult(aiIntakeResult) : ""}
      <label class="field requirement-field">
        <span>Requirement</span>
        <textarea name="description" rows="8" placeholder="Describe the equipment, failure or service need, operating environment, access constraints and what outcome you need.">${escapeHtml(intakeDraft.description)}</textarea>
      </label>
      <div class="primary-fields">
        ${field("location", "Location", intakeDraft.location, "text", "Site, region or service area")}
        ${basicField("urgencySignal", "Urgency", intakeUrgencySignal, "text", "Immediate, this week, planned")}
        ${field("budgetRange", "Budget or callout tolerance", intakeDraft.budgetRange, "text", "Unknown, callout tolerance, or indicative AUD")}
      </div>
      <section class="structured-fields">
        ${arrayField("equipmentOrTechnology", "Equipment / technology", intakeDraft.equipmentOrTechnology, "Siemens PLC, packaging conveyor")}
        ${arrayField("requiredCapabilities", "Required capabilities", intakeDraft.requiredCapabilities, "PLC diagnostics, same-day onsite support")}
        ${arrayField("constraints", "Constraints", intakeDraft.constraints, "Minimal downtime, production environment")}
      </section>
      <section class="priority-section">
        <span>Buyer priority</span>
        <div class="priority-grid priority-grid-compact">
          ${priorityButton("speed", "Speed", "Fastest response and onsite availability")}
          ${priorityButton("technical_fit", "Technical fit", "Closest capability match")}
          ${priorityButton("quality", "Quality", "Depth of relevant evidence")}
          ${priorityButton("trust", "Trust", "Verification and response confidence")}
          ${priorityButton("price", "Price", "Best value submitted")}
        </div>
      </section>
      <section class="secondary-fields">
        <div class="secondary-heading">
          <span>Buyer details</span>
          <button id="demo-fill-button" class="secondary-action" type="button">Use demo data</button>
        </div>
        ${field("companyName", "Company", intakeDraft.companyName, "text", "Company name")}
        ${field("contactName", "Contact", intakeDraft.contactName, "text", "Primary contact")}
        ${field("contactEmail", "Email", intakeDraft.contactEmail, "email", "buyer@example.com")}
        ${field("category", "Category", intakeDraft.category, "text", "Industrial automation, fabrication, maintenance")}
        ${field("requiredBy", "Required date", intakeDraft.requiredBy, "text", "Today, 25 July, next shutdown window")}
      </section>
      <div class="actions field-wide">
        <button class="primary" type="submit">Find matching suppliers</button>
      </div>
    </form>
  `;
}

function renderEvidenceSummary(evidence: IntakeEvidence[]) {
  return `
    <section class="evidence-summary">
      <strong>Evidence used by wrapper</strong>
      ${evidence.map((item) => `
        <span>
          <b>${item.kind.toUpperCase()}</b>
          ${escapeHtml(item.name)}
          <small>${evidenceStatusLabel(item)}</small>
        </span>
      `).join("")}
    </section>
  `;
}

function evidenceStatusLabel(item: IntakeEvidence) {
  if (item.dataUrl) return "File content sent to API intake wrapper";
  if (item.extractedText) return "Text sent to API intake wrapper";
  return "Metadata only; file was too large or unavailable";
}

function renderAiIntakeResult(result: AiIntakeResult) {
  const profile = result.generatedProfile;
  return `
    <section class="ai-result-panel">
      <div class="ai-result-header">
        <div>
          <p class="eyebrow">Structured draft</p>
          <h3>${escapeHtml(profile.title)}</h3>
        </div>
        <span class="confidence-meter">${Math.round((result.confidence ?? 0) * 100)}% confidence</span>
      </div>
      <div class="ai-result-grid">
        ${aiResultItem("Problem summary", profile.problemSummary)}
        ${aiResultItem("Category", profile.category)}
        ${aiResultItem("Equipment / technology", profile.equipmentOrTechnology.join(", ") || "Missing")}
        ${aiResultItem("Capabilities", profile.requiredCapabilities.join(", ") || "Missing")}
        ${aiResultItem("Location", profile.location ?? "Missing")}
        ${aiResultItem("Urgency", profile.urgency ?? "Missing")}
        ${aiResultItem("Budget tolerance", profile.budgetRange ?? "Missing")}
        ${aiResultItem("Buyer priority", profile.buyerPriority ? priorityLabel(profile.buyerPriority) : "Missing")}
      </div>
      ${
        result.missingFields.length
          ? `<div class="missing-fields"><strong>Missing fields to review</strong>${result.missingFields.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`
          : `<div class="missing-fields is-complete"><strong>Ready for buyer review</strong><span>No obvious missing fields detected.</span></div>`
      }
      <div class="actions">
        <button id="apply-structured-button" class="secondary-action" type="button">Apply structured draft</button>
      </div>
    </section>
  `;
}

function aiResultItem(label: string, valueText: string) {
  const missing = valueText === "Missing";
  return `
    <span class="ai-result-item ${missing ? "is-missing" : ""}">
      <b>${label}</b>
      ${escapeHtml(valueText)}
    </span>
  `;
}

function renderProfile(data: BuyerWorkspace) {
  const profile = data.needProfile;
  return `
    <section class="panel split">
      <div>
        <p class="eyebrow">Step 2</p>
        <h2>Review structured Need Profile</h2>
        <p class="muted">${escapeHtml(profile.description)}</p>
        <dl class="profile-list">
          ${detail("Category", profile.category)}
          ${detail("Location", profile.location)}
          ${detail("Priority", profile.priority)}
          ${detail("Required by", profile.requiredBy ?? "Not specified")}
          ${detail("Budget", profile.budget ? money(profile.budget.amount, profile.budget.currency) : "Not supplied")}
        </dl>
      </div>
      <div class="stack">
        ${tagGroup("Must haves", profile.mustHaves)}
        ${tagGroup("Nice to haves", profile.niceToHaves)}
        ${tagGroup("Constraints", profile.constraints)}
      </div>
    </section>
    <section class="panel">
      <div class="panel-heading">
        <p class="eyebrow">Step 3</p>
        <h2>Select matching priority</h2>
      </div>
      <div class="priority-grid">
        ${priorityButton("speed", "Speed", "Fastest response and onsite availability")}
        ${priorityButton("technical_fit", "Technical fit", "Closest capability match")}
        ${priorityButton("quality", "Quality", "Depth of relevant evidence")}
        ${priorityButton("trust", "Trust", "Verification and response confidence")}
        ${priorityButton("price", "Price", "Best value submitted")}
      </div>
      <div class="actions">
        <button id="match-button" class="primary" type="button">View Supplier Matches</button>
      </div>
    </section>
  `;
}

function renderMatches(data: BuyerWorkspace) {
  const hasResponses = data.responses.length > 0;
  return `
    ${renderOutreachPanel(data)}
    <section class="grid-two">
      <div class="panel">
        <div class="panel-heading">
          <p class="eyebrow">Step 4</p>
          <h2>Explainable supplier matches</h2>
        </div>
        <div class="card-list">${data.matches.map(renderMatchCard).join("")}</div>
      </div>
      <div class="panel">
        <div class="panel-heading">
          <p class="eyebrow">Step 5</p>
          <h2>Invitation and response activity</h2>
          <p class="muted">Each supplier responds from their own secure opportunity link. Open one in another tab or copy it to a second device for the recorded demo.</p>
        </div>
        ${renderActivity(data)}
      </div>
    </section>
    <section class="panel">
      <div class="panel-heading">
        <p class="eyebrow">Step 6</p>
        <h2>Compare standardised supplier responses</h2>
        <p class="muted">Pick the response that best matches the buyer priority. Unavailable suppliers stay visible so coverage is honest.</p>
      </div>
      ${hasResponses ? renderResponseTable(data) : renderEmpty("No responses yet", "Open a secure supplier link and submit a response. It will appear here live.")}
      <div class="actions">
        <button id="refresh-responses-button" class="secondary-action" type="button">Refresh supplier responses</button>
        <button id="select-button" class="primary" type="button" ${selectedResponseId ? "" : "disabled"}>Select Supplier</button>
      </div>
    </section>
  `;
}

function renderOutreachPanel(data: BuyerWorkspace) {
  const respondedCount = data.responses.length;
  const emailStatus = aggregateDeliveryStatus(data, "email");
  const smsStatus = aggregateDeliveryStatus(data, "sms");
  return `
    <section class="panel outreach-panel ${outreachSent ? "is-sent" : ""}">
      <div>
        <p class="eyebrow">Parallel outreach</p>
        <h2>${outreachSent ? "Supplier outreach updated" : "Send to matched suppliers"}</h2>
        <p class="muted">${outreachSent ? `${respondedCount} supplier response${respondedCount === 1 ? "" : "s"} received. Email and SMS only show sent when backend delivery confirms it.` : "Email is attempted through the configured delivery adapter. SMS stays unavailable unless a reliable sender is configured. Secure links remain available for every match."}</p>
      </div>
      <div class="outreach-stats">
        <span><strong>${data.matches.length}</strong> matched</span>
        <span><strong>${data.invitations.length}</strong> secure links</span>
        <span><strong>${respondedCount}</strong> responded</span>
      </div>
      <button id="send-outreach-button" class="primary outreach-button" type="button" ${outreachSent ? "disabled" : ""}>Send to matched suppliers</button>
      <div class="channel-grid">
        ${renderChannel("Email", emailStatus.status, emailStatus.detail)}
        ${renderChannel("SMS", smsStatus.status, smsStatus.detail)}
        ${renderChannel("Secure link fallback", "ready", outreachSent ? "Available for every supplier" : "Available now")}
      </div>
    </section>
  `;
}

function renderChannel(label: string, status: OutreachStatus, detailText: string) {
  return `
    <span class="channel-card">
      <b>${label}</b>
      <em class="status-pill status-${status}">${status}</em>
      <small>${detailText}</small>
    </span>
  `;
}

function renderMatchCard(match: BuyerWorkspace["matches"][number]) {
  return `
    <article class="match-card">
      <div>
        <h3>${escapeHtml(match.supplier.companyName)}</h3>
        <p>${escapeHtml(match.priorityReason)}</p>
      </div>
      <strong class="score">${match.weightedScore}</strong>
      <ul>${match.reasons.map((reason: string) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>
      ${match.risks.length ? `<p class="risk">Risk: ${escapeHtml(match.risks.join(" "))}</p>` : ""}
    </article>
  `;
}

function renderActivity(data: BuyerWorkspace) {
  return `
    <ol class="activity">
      ${data.invitations
        .map((invitation) => {
          const supplier = data.suppliers.find((item) => item.id === invitation.supplierId);
          const response = data.responses.find((item) => item.invitationId === invitation.id);
          const status = supplierOutreachStatus(invitation.status, Boolean(response));
          const emailDelivery = deliveryForInvitation(data, invitation.id, "email");
          const smsDelivery = deliveryForInvitation(data, invitation.id, "sms");
          return `
            <li>
              <span class="activity-dot ${response ? "is-done" : ""}"></span>
              <div>
                <div class="activity-heading">
                  <strong>${escapeHtml(supplier?.companyName ?? invitation.supplierId)}</strong>
                  <span class="status-pill status-${status}">${status}</span>
                </div>
                <p>${outreachStatusCopy(status)}${response ? ` - response submitted ${formatTime(response.submittedAt)}` : ""}</p>
                <div class="channel-row">
                  ${renderDeliveryChip("Email", emailDelivery)}
                  ${renderDeliveryChip("SMS", smsDelivery)}
                  <span>Secure link <b class="status-${status}">${status}</b></span>
                </div>
                <div class="supplier-link-row">
                  <a class="supplier-link" href="${escapeHtml(invitation.responseUrl)}" target="_blank" rel="noreferrer">Open secure link</a>
                  <button class="copy-link-button" type="button" data-copy-link="${escapeHtml(invitation.responseUrl)}">Copy link</button>
                </div>
                <code class="secure-url">${escapeHtml(shortUrl(invitation.responseUrl))}</code>
              </div>
            </li>
          `;
        })
        .join("")}
    </ol>
  `;
}

function renderDeliveryChip(
  label: string,
  delivery: BuyerWorkspace["outreachDeliveries"][number] | undefined
) {
  const status: OutreachStatus = delivery?.deliveryStatus ?? "ready";
  const detail = delivery?.errorMessage ? ` title="${escapeHtml(delivery.errorMessage)}"` : "";
  return `<span>${label} <b class="status-${status}"${detail}>${formatStatus(status)}</b></span>`;
}

function renderResponseTable(data: BuyerWorkspace) {
  return `
    <div class="response-cards" role="radiogroup" aria-label="Supplier responses">
      ${data.responses
        .map((response, index) => {
          const supplier = data.suppliers.find((item) => item.id === response.supplierId);
          const canHelp = response.decision === "can_help";
          const isSelected = selectedResponseId === response.id;
          return `
            <label class="response-card ${isSelected ? "is-selected" : ""} ${canHelp ? "" : "is-declined"}">
              <input class="response-radio" type="radio" name="supplierResponse" value="${response.id}" ${isSelected ? "checked" : ""} ${canHelp ? "" : "disabled"}>
              <span class="response-topline">
                <strong>${escapeHtml(supplier?.companyName ?? response.supplierId)}</strong>
                <small>${index === 0 && canHelp ? "Recommended for demo priority" : formatStatus(response.decision)}</small>
              </span>
              <span class="response-metrics">
                <span><b>Availability</b>${escapeHtml(response.availability ?? "Not supplied")}</span>
                <span><b>Price</b>${response.indicativePrice ? money(response.indicativePrice.amount, response.indicativePrice.currency) : "Not supplied"}</span>
                <span><b>Trust</b>${supplier?.verified ? "Verified supplier" : "Review conditions"}</span>
              </span>
              <span class="response-evidence"><b>Relevant experience</b>${escapeHtml(response.relevantExperience ?? "Not supplied")}</span>
              ${response.conditions.length ? `<span class="response-conditions"><b>Conditions</b>${response.conditions.map(escapeHtml).join("; ")}</span>` : ""}
              <span class="response-select-copy">${
                canHelp
                  ? isSelected
                    ? "Selected for supplier engagement"
                    : "Click card to select"
                  : "Unavailable"
              }</span>
            </label>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderSelection(data: BuyerWorkspace) {
  const selected = selectedSupplier(data);
  return `
    <section class="panel success-panel">
      <p class="eyebrow">Step 7</p>
      <h2>Supplier selected</h2>
      <p>${escapeHtml(selected?.supplier.companyName ?? "Selected supplier")} is ready for engagement creation. Payment has not started.</p>
      <dl class="profile-list">
        ${detail("Engagement status", data.engagement?.status ?? "supplier_selected")}
        ${detail("Payment status", data.engagement?.paymentStatus ?? "not_started")}
      </dl>
      <div class="actions">
        <button id="payment-button" class="primary" type="button">Initiate Payment</button>
      </div>
    </section>
  `;
}

function renderPayment(data: BuyerWorkspace) {
  const checkoutUrl = data.hostedCheckoutUrl ?? data.engagement?.hostedCheckoutUrl;
  return `
    <section class="panel payment-panel">
      <p class="eyebrow">Step 8</p>
      <h2>Awaiting payment</h2>
      <p>Veltact created a Pinch-hosted payment link through the API. The supplier is secured only after the backend verifies payment with Pinch.</p>
      ${
        checkoutUrl
          ? `<a class="checkout-link" href="${escapeHtml(checkoutUrl)}" target="_blank" rel="noreferrer">Open Pinch hosted checkout</a>`
          : renderEmpty("Payment link unavailable", "Try creating the payment link again.")
      }
      <dl class="profile-list">
        ${detail("Engagement status", data.engagement?.status ?? "payment_pending")}
        ${detail("Payment status", data.engagement?.paymentStatus ?? "awaiting_payment")}
      </dl>
      <div class="actions">
        <button id="payment-status-button" class="primary" type="button">Check Pinch Payment Status</button>
        ${localDemoMode ? '<button id="demo-payment-button" class="secondary-action" type="button">Complete demo payment</button>' : ""}
      </div>
    </section>
  `;
}

function renderSecured(data: BuyerWorkspace) {
  const selected = selectedSupplier(data);
  const isDemoPayment = data.engagement?.pinchPaymentId?.startsWith("demo_");
  return `
    <section class="panel secured-panel">
      <p class="eyebrow">Step 9</p>
      <h2>Supplier secured</h2>
      <p>${escapeHtml(selected?.supplier.companyName ?? "The supplier")} is secured after ${
        isDemoPayment
          ? "the local demo recorded a sandbox payment approval."
          : "Veltact verified approved payment with Pinch."
      }</p>
      <dl class="profile-list">
        ${detail("Need Profile", data.needProfile.status)}
        ${detail("Engagement", data.engagement?.status ?? "supplier_secured")}
        ${detail("Payment", data.engagement?.paymentStatus ?? "paid")}
        ${detail("Verification", isDemoPayment ? "Local sandbox demo" : "Pinch approved payment")}
        ${detail("Secured at", data.engagement?.securedAt ? formatTime(data.engagement.securedAt) : "Pending")}
      </dl>
    </section>
  `;
}

function bindEvents() {
  document.querySelector<HTMLFormElement>("#requirement-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    await run(async () => {
      const description = value(form, "description");
      const needProfile = await service.createNeedProfile({
        companyName: value(form, "companyName"),
        contactName: value(form, "contactName"),
        contactEmail: value(form, "contactEmail"),
        title: titleFromRequirement(description),
        description,
        category: value(form, "category"),
        equipmentOrTechnology: csvValues(form, "equipmentOrTechnology"),
        requiredCapabilities: csvValues(form, "requiredCapabilities"),
        location: value(form, "location"),
        requiredBy: value(form, "requiredBy") || value(form, "urgencySignal"),
        budgetRange: value(form, "budgetRange"),
        budgetAmount: parseBudgetAmount(value(form, "budgetRange")),
        constraints: csvValues(form, "constraints")
      });
      workspace = {
        needProfile,
        suppliers: [],
        matches: [],
        invitations: [],
        outreachDeliveries: [],
        responses: []
      };
      stage = "profile";
    });
  });

  document.querySelector<HTMLButtonElement>("#structure-button")?.addEventListener("click", async () => {
    const form = document.querySelector<HTMLFormElement>("#requirement-form");
    if (!form) return;
    const descriptionElement = form.elements.namedItem("description");
    const description =
      descriptionElement instanceof HTMLTextAreaElement ? descriptionElement.value.trim() : "";
    await run(async () => {
      intakeEvidence = await collectIntakeEvidence(form);
      const result = await aiIntakeService.structureRequirement({
        rawRequirement: description || demoInput.description,
        evidence: intakeEvidence
      });
      const structured = result.generatedProfile;
      aiIntakeResult = result;
      const formData = new FormData(form);
      intakeDraft = {
        companyName: value(formData, "companyName") || demoInput.companyName,
        contactName: value(formData, "contactName") || demoInput.contactName,
        contactEmail: value(formData, "contactEmail") || demoInput.contactEmail,
        title: structured.title,
        description: structured.problemSummary,
        category: structured.category,
        equipmentOrTechnology: structured.equipmentOrTechnology,
        requiredCapabilities: structured.requiredCapabilities,
        location: structured.location ?? "",
        requiredBy: structured.urgency ?? "",
        budgetRange: structured.budgetRange ?? "",
        budgetAmount: parseBudgetAmount(structured.budgetRange ?? ""),
        constraints: structured.certificationsOrConstraints
      };
      intakeUrgencySignal = structured.urgency ?? "";
      priority = structured.buyerPriority ?? "speed";
      structuredDraftMessage = "Requirement structured into a supplier-ready draft. Review missing fields before matching.";
    });
    render();
  });

  document.querySelector<HTMLButtonElement>("#apply-structured-button")?.addEventListener("click", () => {
    if (!aiIntakeResult) return;
    const form = document.querySelector<HTMLFormElement>("#requirement-form");
    if (!form) return;
    const structured = aiIntakeResult.generatedProfile;
    setFormValue(form, "description", structured.problemSummary);
    setFormValue(form, "category", structured.category);
    setFormValue(form, "equipmentOrTechnology", structured.equipmentOrTechnology.join(", "));
    setFormValue(form, "requiredCapabilities", structured.requiredCapabilities.join(", "));
    setFormValue(form, "location", structured.location ?? "");
    setFormValue(form, "urgencySignal", structured.urgency ?? "");
    setFormValue(form, "requiredBy", structured.urgency ?? "");
    setFormValue(form, "budgetRange", structured.budgetRange ?? "");
    setFormValue(form, "constraints", structured.certificationsOrConstraints.join(", "));
    priority = structured.buyerPriority ?? priority;
    syncIntakeDraftFromForm();
    structuredDraftMessage = "Structured draft applied. Manual editing remains available.";
    document.querySelectorAll<HTMLButtonElement>("[data-priority]").forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.priority === priority);
    });
    render();
  });

  document.querySelector<HTMLButtonElement>("#demo-fill-button")?.addEventListener("click", () => {
    const form = document.querySelector<HTMLFormElement>("#requirement-form");
    if (!form) return;
    setFormValue(form, "companyName", demoInput.companyName);
    setFormValue(form, "contactName", demoInput.contactName);
    setFormValue(form, "contactEmail", demoInput.contactEmail);
    setFormValue(form, "description", demoInput.description);
    setFormValue(form, "category", demoInput.category);
    setFormValue(form, "equipmentOrTechnology", demoInput.equipmentOrTechnology.join(", "));
    setFormValue(form, "requiredCapabilities", demoInput.requiredCapabilities.join(", "));
    setFormValue(form, "location", demoInput.location);
    setFormValue(form, "urgencySignal", "Immediate production impact");
    setFormValue(form, "requiredBy", demoInput.requiredBy);
    setFormValue(form, "budgetRange", demoInput.budgetRange);
    setFormValue(form, "constraints", demoInput.constraints.join(", "));
    intakeDraft = { ...demoInput };
    intakeUrgencySignal = "Immediate production impact";
    intakeEvidence = [];
    aiIntakeResult = undefined;
    priority = "speed";
    structuredDraftMessage = "";
    document.querySelectorAll<HTMLButtonElement>("[data-priority]").forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.priority === priority);
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-priority]").forEach((button) => {
    button.addEventListener("click", () => {
      syncIntakeDraftFromForm();
      priority = button.dataset.priority as PrioritySignal;
      render();
    });
  });

  document.querySelector<HTMLButtonElement>("#match-button")?.addEventListener("click", async () => {
    const currentWorkspace = workspace;
    if (!currentWorkspace) return;
    await run(async () => {
      workspace = await service.submitPriority(currentWorkspace.needProfile, priority);
      selectedResponseId = firstHelpfulResponseId(workspace) ?? "";
      outreachSent = false;
      stage = "matches";
    });
  });

  document.querySelectorAll<HTMLInputElement>("input[name='supplierResponse']").forEach((input) => {
    input.addEventListener("change", () => {
      selectedResponseId = input.value;
      render();
    });
  });

  document.querySelector<HTMLButtonElement>("#refresh-responses-button")?.addEventListener("click", async () => {
    const currentWorkspace = workspace;
    if (!currentWorkspace) return;
    await run(async () => {
      workspace = await service.refreshWorkspace(currentWorkspace, priority);
      selectedResponseId = firstHelpfulResponseId(workspace) ?? selectedResponseId;
      stage = "matches";
    });
  });

  document.querySelector<HTMLButtonElement>("#send-outreach-button")?.addEventListener("click", async () => {
    const currentWorkspace = workspace;
    if (!currentWorkspace) return;
    await run(async () => {
      workspace = await service.sendSupplierOutreach(currentWorkspace, priority);
      outreachSent = true;
      stage = "matches";
    });
    showLiveMessage("Supplier outreach delivery updated. Secure links remain available.");
    render();
  });

  document.querySelectorAll<HTMLButtonElement>("[data-copy-link]").forEach((button) => {
    button.addEventListener("click", async () => {
      const link = button.dataset.copyLink;
      if (!link) return;
      await copyText(link);
      showLiveMessage("Supplier secure link copied.");
      render();
    });
  });

  document.querySelector<HTMLButtonElement>("#select-button")?.addEventListener("click", async () => {
    const currentWorkspace = workspace;
    if (!currentWorkspace || !selectedResponseId) return;
    await run(async () => {
      workspace = await service.selectSupplier(currentWorkspace, selectedResponseId);
      stage = "selected";
    });
  });

  document.querySelector<HTMLButtonElement>("#payment-button")?.addEventListener("click", async () => {
    const currentWorkspace = workspace;
    if (!currentWorkspace) return;
    await run(async () => {
      workspace = await service.createPaymentLink(currentWorkspace);
      stage = "payment";
    });
  });

  document.querySelector<HTMLButtonElement>("#payment-status-button")?.addEventListener("click", async () => {
    const currentWorkspace = workspace;
    if (!currentWorkspace) return;
    await run(async () => {
      workspace = await service.refreshEngagement(currentWorkspace);
      stage = workspace.engagement?.status === "supplier_secured" ? "secured" : "payment";
    });
  });

  document.querySelector<HTMLButtonElement>("#demo-payment-button")?.addEventListener("click", async () => {
    const currentWorkspace = workspace;
    if (!currentWorkspace) return;
    await run(async () => {
      workspace = await service.completeDemoPayment(currentWorkspace);
      stage = "secured";
    });
  });
}

function configurePolling() {
  const shouldPoll = workspace && (stage === "matches" || stage === "payment");
  if (!shouldPoll && pollHandle !== undefined) {
    window.clearInterval(pollHandle);
    pollHandle = undefined;
    return;
  }
  if (shouldPoll && pollHandle === undefined) {
    pollHandle = window.setInterval(() => {
      void refreshLiveState();
    }, stage === "payment" ? 3000 : 5000);
  }
}

function configureRealtime() {
  const needProfileId = workspace?.needProfile.id;
  if (!needProfileId) {
    leaveRealtimeNeed();
    return;
  }

  if (!realtimeSocket) {
    void initialiseRealtimeSocket(needProfileId);
    return;
  }

  if (joinedNeedProfileId === needProfileId) {
    return;
  }

  if (joinedNeedProfileId) {
    realtimeSocket.emit(rapidMatchSocketEvent.leaveNeedProfile, { needProfileId: joinedNeedProfileId });
  }
  realtimeSocket.emit(rapidMatchSocketEvent.joinNeedProfile, { needProfileId });
  joinedNeedProfileId = needProfileId;
}

async function initialiseRealtimeSocket(needProfileId: string) {
  if (realtimeClientLoading) {
    await realtimeClientLoading;
  } else if (!socketWindow.io) {
    realtimeClientLoading = loadRealtimeClient();
    await realtimeClientLoading;
  }

  if (!socketWindow.io) {
    return;
  }

  if (realtimeSocket) {
    configureRealtime();
    return;
  }

  realtimeSocket = socketWindow.io(realtimeOrigin, {
    transports: ["websocket"],
    reconnection: true
  });

  realtimeSocket.on(rapidMatchSocketEvent.invitationSent, (payload) => {
    if (payload.needProfileId === workspace?.needProfile.id) {
      const status = payload.supplierInvitation?.status;
      const message =
        status === "opened"
          ? "Live update: supplier opened the opportunity link."
          : "Live supplier invitation status updated.";
      void refreshLiveState({ forceRender: true, liveMessage: message });
    }
  });

  realtimeSocket.on(rapidMatchSocketEvent.outreachDeliveryUpdated, (payload) => {
    if (payload.needProfileId === workspace?.needProfile.id) {
      const channel = payload.outreachDelivery?.channel?.toUpperCase() ?? "Outreach";
      const status = payload.outreachDelivery?.deliveryStatus ?? "updated";
      void refreshLiveState({
        forceRender: true,
        liveMessage: `Live update: ${channel} delivery ${formatStatus(status)}.`
      });
    }
  });

  realtimeSocket.on(rapidMatchSocketEvent.supplierResponseSubmitted, (payload) => {
    if (payload.needProfileId === workspace?.needProfile.id) {
      const message =
        payload.supplierResponse?.decision === "cannot_help"
          ? "Live update: supplier declined this opportunity."
          : "Live update: supplier submitted a response.";
      void refreshLiveState({ forceRender: true, liveMessage: message });
    }
  });

  realtimeSocket.on(rapidMatchSocketEvent.paymentStatusUpdated, (payload) => {
    if (payload.needProfileId === workspace?.needProfile.id) {
      void refreshLiveState({ forceRender: true, liveMessage: "Live payment status update received." });
    }
  });

  realtimeSocket.on(rapidMatchSocketEvent.engagementSecured, (payload) => {
    if (payload.needProfileId === workspace?.needProfile.id) {
      void refreshLiveState({ forceRender: true, liveMessage: "Live secured engagement update received." });
    }
  });

  if (workspace?.needProfile.id === needProfileId) {
    configureRealtime();
  }
}

async function loadRealtimeClient() {
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${realtimeOrigin}/socket.io/socket.io.js`;
    script.async = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Unable to load realtime client.")), { once: true });
    document.head.append(script);
  }).catch(() => {
    realtimeClientLoading = undefined;
  });
}

function leaveRealtimeNeed() {
  if (!realtimeSocket || !joinedNeedProfileId) {
    return;
  }
  realtimeSocket.emit(rapidMatchSocketEvent.leaveNeedProfile, { needProfileId: joinedNeedProfileId });
  joinedNeedProfileId = "";
}

async function refreshLiveState(options: { forceRender?: boolean; liveMessage?: string } = {}) {
  if (!workspace || isPolling || loadState === "loading") {
    return;
  }

  isPolling = true;
  try {
    const previousResponseIds = workspace.responses.map((response) => response.id).join(",");
    const previousEngagementStatus = workspace.engagement?.status;
    if (stage === "matches") {
      workspace = await service.refreshWorkspace(workspace, priority);
      if (!selectedResponseId && workspace.responses[0]) {
        selectedResponseId = firstHelpfulResponseId(workspace) ?? "";
      }
      if (selectedResponseId && !workspace.responses.some((response) => response.id === selectedResponseId && response.decision === "can_help")) {
        selectedResponseId = firstHelpfulResponseId(workspace) ?? "";
      }
      const nextResponseIds = workspace.responses.map((response) => response.id).join(",");
      if (options.forceRender || nextResponseIds !== previousResponseIds) {
        showLiveMessage(options.liveMessage);
        render();
      }
    }
    if (stage === "payment") {
      workspace = await service.refreshEngagement(workspace);
      if (workspace.engagement?.status === "supplier_secured") {
        stage = "secured";
      }
      if (options.forceRender || workspace.engagement?.status !== previousEngagementStatus || stage === "secured") {
        showLiveMessage(options.liveMessage);
        render();
      }
    }
  } catch {
    // Manual refresh keeps user-facing errors explicit; polling should not interrupt the demo flow.
  } finally {
    isPolling = false;
  }
}

function showLiveMessage(message?: string) {
  if (!message) {
    return;
  }
  liveMessage = message;
  window.setTimeout(() => {
    if (liveMessage === message) {
      liveMessage = "";
      render();
    }
  }, 2200);
}

async function run(action: () => Promise<void>) {
  loadState = "loading";
  errorMessage = "";
  render();
  try {
    await action();
    loadState = "success";
  } catch (error) {
    loadState = "error";
    errorMessage = error instanceof Error ? error.message : "Unexpected RapidMatch error.";
  }
  render();
  if (loadState === "success") {
    window.setTimeout(() => {
      loadState = "idle";
      render();
    }, 1400);
  }
}

function field(
  name: keyof BuyerRequirementInput,
  label: string,
  valueText: string,
  type = "text",
  placeholder = ""
) {
  return basicField(name, label, valueText, type, placeholder);
}

function basicField(name: string, label: string, valueText: string, type = "text", placeholder = "") {
  return `
    <label class="field">
      <span>${label}</span>
      <input name="${name}" type="${type}" value="${escapeHtml(valueText)}" placeholder="${escapeHtml(placeholder)}" />
    </label>
  `;
}

function arrayField(
  name: keyof Pick<BuyerRequirementInput, "equipmentOrTechnology" | "requiredCapabilities" | "constraints">,
  label: string,
  values: string[],
  placeholder = ""
) {
  return `
    <label class="field">
      <span>${label}</span>
      <input name="${name}" type="text" value="${escapeHtml(values.join(", "))}" placeholder="${escapeHtml(placeholder)}" />
    </label>
  `;
}

function setFormValue(form: HTMLFormElement, name: string, valueText: string) {
  const fieldElement = form.elements.namedItem(name);
  if (fieldElement instanceof HTMLInputElement || fieldElement instanceof HTMLTextAreaElement) {
    fieldElement.value = valueText;
  }
}

function syncIntakeDraftFromForm() {
  const form = document.querySelector<HTMLFormElement>("#requirement-form");
  if (!form) return;
  const formData = new FormData(form);
  intakeDraft = {
    companyName: value(formData, "companyName"),
    contactName: value(formData, "contactName"),
    contactEmail: value(formData, "contactEmail"),
    title: titleFromRequirement(value(formData, "description")),
    description: value(formData, "description"),
    category: value(formData, "category"),
    equipmentOrTechnology: csvValues(formData, "equipmentOrTechnology"),
    requiredCapabilities: csvValues(formData, "requiredCapabilities"),
    location: value(formData, "location"),
    requiredBy: value(formData, "requiredBy"),
    budgetRange: value(formData, "budgetRange"),
    budgetAmount: parseBudgetAmount(value(formData, "budgetRange")),
    constraints: csvValues(formData, "constraints")
  };
  intakeUrgencySignal = value(formData, "urgencySignal");
}

async function collectIntakeEvidence(form: HTMLFormElement): Promise<IntakeEvidence[]> {
  const formData = new FormData(form);
  const evidence: IntakeEvidence[] = [];
  const writtenEvidence = value(formData, "writtenEvidence");
  if (writtenEvidence) {
    evidence.push({
      kind: "written",
      name: "Written notes",
      extractedText: writtenEvidence
    });
  }

  const pdfFile = fileFromForm(form, "pdfEvidence");
  if (pdfFile) {
    evidence.push(await evidenceFromFile(pdfFile, "pdf"));
  }

  const photoFile = fileFromForm(form, "photoEvidence");
  if (photoFile) {
    evidence.push(await evidenceFromFile(photoFile, "photo"));
  }

  return evidence;
}

function fileFromForm(form: HTMLFormElement, name: string) {
  const fieldElement = form.elements.namedItem(name);
  if (!(fieldElement instanceof HTMLInputElement) || fieldElement.type !== "file") {
    return undefined;
  }
  return fieldElement.files?.[0];
}

async function evidenceFromFile(file: File, fallbackKind: IntakeEvidence["kind"]): Promise<IntakeEvidence> {
  const maxUploadBytes = 4 * 1024 * 1024;
  const kind: IntakeEvidence["kind"] =
    file.type.startsWith("image/") ? "photo" : file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf") ? "pdf" : fallbackKind;
  const canReadAsText = file.type.startsWith("text/") || file.name.toLowerCase().endsWith(".txt");
  if (canReadAsText) {
    return {
      kind: "written",
      name: file.name,
      mimeType: file.type || "text/plain",
      extractedText: await file.text()
    };
  }

  if (file.size > maxUploadBytes) {
    return {
      kind,
      name: file.name,
      mimeType: file.type || undefined
    };
  }

  return {
    kind,
    name: file.name,
    mimeType: file.type || undefined,
    dataUrl: await fileToDataUrl(file)
  };
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Unable to read evidence file."));
    });
    reader.addEventListener("error", () => reject(new Error("Unable to read evidence file.")));
    reader.readAsDataURL(file);
  });
}

function titleFromRequirement(description: string) {
  const firstSentence = description.split(/[.!?]/)[0]?.trim();
  if (firstSentence) {
    return firstSentence.slice(0, 90);
  }
  return "Industrial supplier requirement";
}

function priorityButton(valueText: PrioritySignal, label: string, description: string) {
  return `
    <button class="priority-card ${priority === valueText ? "is-selected" : ""}" type="button" data-priority="${valueText}">
      <strong>${label}</strong>
      <span>${description}</span>
    </button>
  `;
}

function detail(label: string, valueText: string) {
  return `<div><dt>${label}</dt><dd>${escapeHtml(formatStatus(valueText))}</dd></div>`;
}

function tagGroup(label: string, items: string[]) {
  if (!items.length) return renderEmpty(label, "No items supplied.");
  return `
    <div>
      <h3>${label}</h3>
      <div class="tags">${items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
    </div>
  `;
}

function renderEmpty(title: string, body: string) {
  return `<div class="empty"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(body)}</p></div>`;
}

function selectedSupplier(data: BuyerWorkspace) {
  const response = data.responses.find((item) => item.id === selectedResponseId);
  const supplier = data.suppliers.find((item) => item.id === response?.supplierId);
  return response && supplier ? { response, supplier } : undefined;
}

function firstHelpfulResponseId(data: BuyerWorkspace) {
  return data.responses.find((response) => response.decision === "can_help")?.id;
}

function supplierOutreachStatus(invitationStatus: string, hasResponse: boolean): OutreachStatus {
  if (hasResponse || invitationStatus === "responded") return "responded";
  if (invitationStatus === "opened") return "viewed";
  if (invitationStatus === "failed") return "failed";
  if (outreachSent) return "sent";
  return "ready";
}

function outreachStatusCopy(status: OutreachStatus) {
  const labels: Record<OutreachStatus, string> = {
    ready: "Ready for Email, SMS if available, or secure-link fallback.",
    not_sent: "Delivery has not been attempted yet. Secure link fallback is available.",
    queued: "Delivery is queued by the backend. Secure link fallback remains available.",
    sent: "Secure opportunity link is active. Email/SMS are not marked sent without backend confirmation.",
    failed: "Delivery failed. Use the secure supplier link fallback.",
    viewed: "Supplier opened the secure opportunity link.",
    responded: "Supplier submitted a standardised response."
  };
  return labels[status];
}

function aggregateDeliveryStatus(
  data: BuyerWorkspace,
  channel: "email" | "sms"
): { status: OutreachStatus; detail: string } {
  const deliveries = data.outreachDeliveries.filter((delivery) => delivery.channel === channel);
  if (!deliveries.length) {
    return channel === "sms"
      ? { status: "ready", detail: "No reliable SMS sender is configured" }
      : { status: "ready", detail: "Ready to attempt when outreach is sent" };
  }

  const failedCount = deliveries.filter((delivery) => delivery.deliveryStatus === "failed").length;
  const sentCount = deliveries.filter((delivery) => delivery.deliveryStatus === "sent").length;
  const queuedCount = deliveries.filter((delivery) => delivery.deliveryStatus === "queued").length;
  const notSentCount = deliveries.filter((delivery) => delivery.deliveryStatus === "not_sent").length;

  if (failedCount) {
    const error = deliveries.find((delivery) => delivery.deliveryStatus === "failed")?.errorMessage;
    return {
      status: "failed",
      detail: `${failedCount} failed${error ? `: ${error}` : ""}`
    };
  }
  if (queuedCount) {
    return { status: "queued", detail: `${queuedCount} queued by backend` };
  }
  if (sentCount) {
    return { status: "sent", detail: `${sentCount} confirmed sent by delivery adapter` };
  }
  if (notSentCount) {
    return { status: "not_sent", detail: `${notSentCount} destination${notSentCount === 1 ? "" : "s"} ready` };
  }
  return { status: "ready", detail: "Ready" };
}

function deliveryForInvitation(
  data: BuyerWorkspace,
  invitationId: string,
  channel: "email" | "sms"
) {
  return data.outreachDeliveries.find(
    (delivery) => delivery.invitationId === invitationId && delivery.channel === channel
  );
}

async function copyText(text: string) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function shortUrl(url: string) {
  const parsed = new URL(url);
  const token = parsed.searchParams.get("token") ?? parsed.pathname.split("/").pop() ?? "";
  return `${parsed.origin}${parsed.pathname}${token ? `?token=${token.slice(0, 8)}...` : ""}`;
}

function value(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}

function csvValues(form: FormData, name: string) {
  return value(form, name)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBudgetAmount(valueText: string) {
  const match = valueText.match(/(\d[\d,]*)/);
  return match ? Number(match[1].replaceAll(",", "")) : 0;
}

function priorityLabel(valueText: PrioritySignal) {
  const labels: Record<PrioritySignal, string> = {
    speed: "Speed",
    technical_fit: "Technical fit",
    quality: "Quality",
    trust: "Trust",
    price: "Price"
  };
  return labels[valueText];
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(amount / 100);
}

function formatStatus(valueText: string) {
  return valueText.replaceAll("_", " ");
}

function formatTime(valueText?: string) {
  if (!valueText) return "not yet";
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(valueText));
}

function escapeHtml(valueText: string) {
  return valueText
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

render();
