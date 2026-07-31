import { AI_INTAKE_RAW_REQUIREMENT_MAX_LENGTH, AI_INTAKE_RAW_REQUIREMENT_MIN_LENGTH, aiIntakeResultSchema, detectIntakeLocation, formatSupplierAvailability, intakeEvidenceSummarySchema, parseIntakeBudgetAmount, solutionDecisionSchema, solutionResearchResultSchema, truncateIntakeTitle } from "@veltact/contracts";
import { BackendAiIntakeService, DemoAiIntakeService } from "./aiIntakeService.js";
import { apiBaseUrl, demoControlsEnabled, localDemoPaymentEnabled, outreachOverrideAvailability } from "./apiBase.js";
import { copyText } from "./clipboard.js";
import { companyLogoFor } from "./companyLogos.js";
import { PRE_NEED_INTAKE_DRAFT_KEY, intakeRawRequirementGuidance, parseBuyerRequirementInput, parsePreNeedIntakeDraft, serializePreNeedIntakeDraft, validateIntakeRawRequirement } from "./intakeDraftPersistence.js";
import { dedupeIntakeMissingFields } from "./intakeMissingFields.js";
import { RapidMatchService } from "./rapidMatchService.js";
import { buyerWorkspacePresentationSignature } from "./workspacePresentation.js";
const service = new RapidMatchService();
const aiIntakeService = new BackendAiIntakeService();
const localAiIntakeService = new DemoAiIntakeService();
const app = document.querySelector("#app");
const socketWindow = window;
const realtimeOrigin = new URL(apiBaseUrl(), window.location.origin).origin;
const rapidMatchSocketEvent = {
    joinNeedProfile: "rapidmatch:need.join",
    leaveNeedProfile: "rapidmatch:need.leave",
    invitationSent: "rapidmatch:invitation.sent",
    outreachDeliveryUpdated: "rapidmatch:outreach.delivery_updated",
    supplierResponseSubmitted: "rapidmatch:response.submitted",
    paymentStatusUpdated: "rapidmatch:payment.status_updated",
    engagementSecured: "rapidmatch:engagement.secured",
    agentActivityUpdated: "rapidmatch:agent.activity_updated",
    deploymentUpdated: "rapidmatch:deployment.updated"
};
const LAST_NEED_KEY = "veltact:rapidmatch:last-need-id";
const NEW_REQUIREMENT_KEY = "veltact:rapidmatch:new-requirement";
const CONTEXT_PREFIX = "veltact:rapidmatch:buyer-context:";
const TOKEN_PREFIX = "veltact:rapidmatch:buyer-token:";
const AI_INTAKE_TIMEOUT_MS = 12_000;
const BUYER_VIEW_HISTORY_KEY = "veltactBuyerView";
const buyerViews = new Set([
    "intake",
    "plan",
    "candidates",
    "outreach",
    "compare",
    "selected",
    "payment",
    "deployment",
    "registry"
]);
const priorities = new Set([
    "speed",
    "technical_fit",
    "quality",
    "trust",
    "price"
]);
const outreachChoiceValues = new Set([
    "link",
    "sms",
    "email"
]);
let view = "intake";
let intakeMode = "ai";
let loadState = "idle";
let loadingLabel = "";
let errorMessage = "";
let liveMessage = "";
let priority = "speed";
let selectedApproachId = "";
let selectedCandidateIds = new Set();
let candidateSelectionInitialised = false;
let selectedOutreachChoices = new Set();
let outreachPanelOpen = false;
let selectedResponseId = "";
let workspace;
let supplierRegistry;
let registryReturnView = "intake";
let aiIntakeResult;
let intakeSourceMode = "fixture";
let intakeEvidence = [];
let booting = true;
let demoControlsAvailable = false;
let localDemoPaymentAvailable = false;
let stagingOutreachOverrides = {
    email: false,
    sms: false
};
let milestoneUpdateDraft = "";
let restoreFailed = false;
let workspaceEpoch = 0;
let pollHandle;
let pollKey = "";
let isPolling = false;
let realtimeSocket;
let joinedNeedProfileId = "";
let realtimeClientLoading;
let intakeRevision = 0;
let activeIntakeRequestId = 0;
let historyReady = false;
let historyView;
let handlingPopState = false;
let lastFocusedView;
let renderedView;
let pendingRenderInteractionState;
const emptyInput = {
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
let intakeDraft = cloneInput(emptyInput);
const plcDemoInput = {
    companyName: "HarbourPack Manufacturing",
    contactName: "Elena Morris",
    contactEmail: "elena.morris@harbourpack.example",
    title: "Urgent Siemens PLC fault on packaging line",
    description: "Packaging line stopped after intermittent Siemens PLC faults in Western Sydney. Need an authorised industrial automation specialist today to inspect the fault evidence, restore safe production and document the work. Speed matters.",
    category: "Industrial automation",
    equipmentOrTechnology: ["Siemens PLC", "Packaging line"],
    requiredCapabilities: [
        "Siemens PLC diagnostics",
        "Industrial electrical fault finding",
        "Same-day onsite support"
    ],
    location: "Western Sydney, NSW",
    requiredBy: "Today",
    budgetRange: "Up to AUD 1,800 callout tolerance",
    budgetAmount: 1800,
    constraints: [
        "Production line stopped",
        "Safe isolation and restart required",
        "Minimal downtime"
    ]
};
const roboticsDemoInput = {
    companyName: "HarbourPack Manufacturing",
    contactName: "Elena Morris",
    contactEmail: "elena.morris@harbourpack.example",
    title: "Robotic palletiser integration for dispatch line",
    description: "We need an ABB robotic palletising cell integrated with the existing Siemens controls and packaging conveyor in Western Sydney. The system must handle mixed cartons, meet the morning dispatch cycle and include machinery safety validation. Technical fit matters.",
    category: "Industrial robotics and automation",
    equipmentOrTechnology: [
        "ABB robotic arm",
        "Siemens PLC",
        "Packaging conveyor"
    ],
    requiredCapabilities: [
        "Robotic systems integration",
        "ABB robot programming",
        "Machinery safety",
        "Site commissioning"
    ],
    location: "Western Sydney, NSW",
    requiredBy: "Commission within 8 weeks",
    budgetRange: "AUD 120,000 to AUD 180,000",
    budgetAmount: 180000,
    constraints: [
        "Existing line interfaces must be retained",
        "Formal safety validation required",
        "Morning dispatch cycle must be maintained"
    ]
};
render();
window.addEventListener("popstate", handleBuyerPopState);
void bootstrap();
async function bootstrap() {
    const demoGate = demoControlsEnabled();
    const localDemoPaymentGate = localDemoPaymentEnabled();
    const outreachOverrideGate = outreachOverrideAvailability();
    const identity = readWorkspaceIdentity();
    if (!identity.needProfileId) {
        restorePreNeedIntakeDraft();
        [
            demoControlsAvailable,
            localDemoPaymentAvailable,
            stagingOutreachOverrides
        ] = await Promise.all([
            demoGate,
            localDemoPaymentGate,
            outreachOverrideGate
        ]);
        booting = false;
        initialiseBuyerHistory();
        render();
        return;
    }
    const context = loadContext(identity.needProfileId);
    if (context.priority)
        priority = context.priority;
    if (context.selectedApproachId) {
        selectedApproachId = context.selectedApproachId;
    }
    if (context.selectedCandidateIds) {
        selectedCandidateIds = new Set(context.selectedCandidateIds);
        candidateSelectionInitialised = true;
    }
    if (context.outreachChoices) {
        selectedOutreachChoices = new Set(context.outreachChoices);
    }
    else if (context.outreachMode) {
        selectedOutreachChoices = new Set([context.outreachMode]);
    }
    outreachPanelOpen =
        context.outreachPanelOpen ?? Boolean(context.outreachMode);
    if (context.selectedResponseId)
        selectedResponseId = context.selectedResponseId;
    if (context.intakeResult)
        aiIntakeResult = context.intakeResult;
    if (context.intakeSourceMode)
        intakeSourceMode = context.intakeSourceMode;
    if (context.requirementInput) {
        intakeDraft = cloneInput(context.requirementInput);
    }
    if (identity.buyerAccessToken) {
        service.setBuyerAccessToken(identity.needProfileId, identity.buyerAccessToken);
    }
    loadState = "loading";
    loadingLabel = "Restoring buyer workspace";
    render();
    try {
        workspace = await service.restoreWorkspace(identity.needProfileId, {
            intakeEvidence: context.intakeEvidence,
            researchResult: context.researchResult,
            solutionDecision: context.solutionDecision
        }, context.engagementId);
        selectedResponseId =
            workspace.engagement?.supplierResponseId || selectedResponseId;
        selectedApproachId = resolveSelectedApproachId(workspace.researchResult, selectedApproachId ||
            workspace.solutionDecision?.selectedApproachIds[0]);
        selectedCandidateIds = resolveSelectedCandidateIds(workspace, selectedCandidateIds, candidateSelectionInitialised);
        candidateSelectionInitialised = true;
        view = resolveRestoredView(workspace, context.view);
        restoreFailed = false;
        loadState = "idle";
    }
    catch (error) {
        if (identity.restoredFromStorage &&
            isMissingNeedProfileError(error)) {
            resetRequirementState(identity.needProfileId);
            liveMessage =
                "The previous requirement is no longer available. A fresh workspace is ready.";
        }
        else {
            restoreFailed = true;
            loadState = "error";
            errorMessage = errorText(error);
            view = "intake";
        }
    }
    finally {
        [
            demoControlsAvailable,
            localDemoPaymentAvailable,
            stagingOutreachOverrides
        ] = await Promise.all([
            demoGate,
            localDemoPaymentGate,
            outreachOverrideGate
        ]);
        booting = false;
        initialiseBuyerHistory();
        render();
    }
}
function render() {
    if (!app)
        return;
    if (!booting && workspace) {
        view = resolveLegalBuyerView(workspace, view);
    }
    if (renderedView !== undefined && renderedView !== view) {
        pendingRenderInteractionState = undefined;
    }
    else {
        const interactionState = captureRenderInteractionState(app);
        if (interactionState.focusedPath ||
            interactionState.openDetailsPaths.length) {
            pendingRenderInteractionState = interactionState;
        }
    }
    syncBuyerHistory();
    const phase = currentPhase();
    const workflowPhase = workspace
        ? workflowJourneyPhase(workspace)
        : "find";
    const headerProfile = workspace?.needProfile;
    const headerContextTitle = headerProfile?.title ?? "Industrial sourcing workspace";
    const headerContextMeta = headerProfile
        ? `${headerProfile.location ? `${headerProfile.location} · ` : ""}№ ${shortId(headerProfile.id)}`
        : "Find · Connect · Deploy";
    if (phase === "deploy") {
        document.body.dataset.phase = "deploy";
    }
    else {
        delete document.body.dataset.phase;
    }
    app.innerHTML = `
    <header class="product-header">
      <a class="product-wordmark" href="./index.html" aria-label="Veltact RapidMatch">
        <span>VELTACT</span>
      </a>
      <div class="product-context">
        <strong>${escapeHtml(headerContextTitle)}</strong>
        <span>${escapeHtml(headerContextMeta)}</span>
      </div>
      <div class="product-header-meta">
        ${renderProductPhaseNavigation(phase, workflowPhase)}
        ${workspace
        ? `<button class="button button-quiet button-small" type="button" data-open-registry>Your suppliers</button>`
        : ""}
      </div>
    </header>

    ${renderJourney(phase, workflowPhase)}

    <section class="hero ${workspace ? "hero-compact" : ""}">
      <div class="hero-copy-block">
        <p class="eyebrow">${workspace ? `${phaseLabel(phase)} workspace` : "Evidence intake"}</p>
        <h1>${workspace ? escapeHtml(headerContextTitle) : "Describe the problem once."}</h1>
        <p class="hero-copy">${workspace
        ? "Review the current decision state without losing the approved requirement context."
        : "Veltact structures your evidence into a reviewed Need Profile with cited solution pathways. Decision support — never engineering sign-off."}</p>
      </div>
      ${workspace ? renderWorkspaceStatus() : ""}
    </section>

    ${renderBanner()}

    <section class="workspace" aria-busy="${loadState === "loading"}">
      ${renderAgentActivityTimeline()}
      ${booting ? renderLoadingSkeleton() : renderCurrentView()}
    </section>

    <footer class="workspace-footer">
      <span>Problem evidence → Need Profile → selected solution → RapidMatch response → Pinch commitment → delivery progress</span>
      <span>Decision support — never engineering sign-off.</span>
    </footer>
  `;
    bindEvents();
    configurePolling();
    configureRealtime();
    if (pendingRenderInteractionState?.view === view) {
        restoreRenderInteractionState(app, pendingRenderInteractionState);
    }
    renderedView = view;
    focusPrimaryHeadingAfterViewChange();
}
function renderAgentActivityTimeline() {
    if (!workspace)
        return "";
    const shouldShow = loadState === "loading" ||
        view === "plan" ||
        view === "candidates";
    if (!shouldShow)
        return "";
    const events = [...workspace.agentActivityEvents].sort((left, right) => left.sequence - right.sequence);
    const latest = events.at(-1);
    const sourceMode = latest?.sourceMode ??
        workspace.researchResult?.sourceMode ??
        "fixture";
    return `
    <details class="agent-timeline" ${loadState === "loading" ? "open" : ""}>
      <summary>
        <span>
          <span class="agent-pulse" aria-hidden="true"></span>
          <strong>${loadState === "loading" ? "Veltact agent working" : "How these results were found"}</strong>
        </span>
        ${sourceBadge(sourceMode, "Live sources", "Labelled fixture")}
      </summary>
      <div class="agent-latest" aria-live="polite">
        ${escapeHtml(latest?.message ?? "Preparing the first research query.")}
      </div>
      ${events.length
        ? `<ol class="agent-event-list">
              ${events
            .map((event) => `
                    <li>
                      <span class="agent-event-index">${event.sequence + 1}</span>
                      <details>
                        <summary>
                          <span>${escapeHtml(event.message)}</span>
                          <time datetime="${escapeHtml(event.occurredAt)}">${escapeHtml(formatTime(event.occurredAt))}</time>
                        </summary>
                        ${event.detail
            ? `<p>${escapeHtml(event.detail)}</p>`
            : ""}
                        ${event.sourceUrl
            ? `<a href="${safeHttpUrl(event.sourceUrl)}" target="_blank" rel="noreferrer">Open source</a>`
            : ""}
                      </details>
                    </li>
                  `)
            .join("")}
            </ol>`
        : `<p class="quiet-note">Activity will appear here as sources and candidates are reviewed.</p>`}
    </details>
  `;
}
function scrollBuyerWorkspaceToTop() {
    window.scrollTo({
        top: 0,
        left: 0,
        behavior: "auto"
    });
}
function renderJourney(phase, workflowPhase) {
    const phases = [
        ["find", "Find", "Evidence → plan"],
        ["connect", "Connect", "Matches → responses"],
        ["deploy", "Deploy", "Commitment → delivery"]
    ];
    const activeIndex = phases.findIndex(([key]) => key === phase);
    const workflowIndex = phases.findIndex(([key]) => key === workflowPhase);
    return `
    <nav class="journey" aria-label="RapidMatch journey">
      ${phases
        .map(([key, label, description], index) => {
        const reachable = Boolean(workspace) &&
            index <= workflowIndex &&
            index !== activeIndex;
        const classes = [
            "journey-step",
            index < workflowIndex ? "is-complete" : "",
            index === activeIndex ? "is-current" : "",
            index === workflowIndex ? "is-workflow-current" : "",
            reachable ? "is-reachable" : ""
        ]
            .filter(Boolean)
            .join(" ");
        const workflowTag = index === workflowIndex
            ? `<span class="journey-tag is-now">Now</span>`
            : index < workflowIndex
                ? `<span class="journey-tag is-done">Done ✓</span>`
                : `<span class="journey-tag is-next">Next</span>`;
        const content = `
              <span class="journey-number">${index + 1}</span>
              <span>
                <strong>${label}</strong>
                <small>${description}</small>
              </span>
              ${workflowTag}
          `;
        return reachable
            ? `<button class="${classes}" type="button" data-journey-phase="${key}" aria-label="View ${label} stage">${content}</button>`
            : `<div class="${classes}" ${index === activeIndex ? 'aria-current="step"' : ""}>${content}</div>`;
    })
        .join("")}
    </nav>
  `;
}
function renderProductPhaseNavigation(phase, workflowPhase) {
    const phases = [
        ["find", "Find"],
        ["connect", "Connect"],
        ["deploy", "Deploy"]
    ];
    const activeIndex = journeyPhaseIndex(phase);
    const workflowIndex = journeyPhaseIndex(workflowPhase);
    return `
    <nav class="product-phase-nav" aria-label="Workspace views">
      ${phases
        .map(([key, label], index) => {
        const current = index === activeIndex;
        const reachable = Boolean(workspace) && index <= workflowIndex && !current;
        if (reachable) {
            return `<button type="button" data-journey-phase="${key}" aria-label="View ${label} stage">${label}</button>`;
        }
        return `<span class="${current ? "is-current" : ""}" ${current ? 'aria-current="page"' : ""}>${label}</span>`;
    })
        .join("")}
    </nav>
  `;
}
function phaseLabel(phase) {
    if (phase === "connect")
        return "Connect";
    if (phase === "deploy")
        return "Deploy";
    return "Find";
}
function focusPrimaryHeadingAfterViewChange() {
    if (booting || lastFocusedView === view)
        return;
    const heading = app?.querySelector(".workspace h1, .workspace h2");
    if (!heading)
        return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    lastFocusedView = view;
    scrollBuyerWorkspaceToTop();
}
function renderBanner() {
    if (loadState === "loading") {
        return `
      <div class="banner is-loading" role="status">
        <span class="spinner" aria-hidden="true"></span>
        ${escapeHtml(loadingLabel || "Updating buyer workspace")}
      </div>
    `;
    }
    if (loadState === "error") {
        return `
      <div class="banner is-error" role="alert">
        <strong>Action unavailable.</strong>
        <span>${escapeHtml(errorMessage)}</span>
      </div>
    `;
    }
    if (liveMessage) {
        return `<div class="banner is-success" role="status">${escapeHtml(liveMessage)}</div>`;
    }
    return "";
}
function renderCurrentView() {
    if (restoreFailed && !workspace && view === "intake") {
        return renderRestoreError();
    }
    if (view === "intake")
        return renderIntake();
    if (!workspace?.needProfile) {
        return renderUnavailable("Buyer workspace unavailable", "The backend did not return a canonical Need Profile for this workspace.");
    }
    if (view === "plan")
        return renderPlan(workspace);
    if (view === "candidates")
        return renderCandidates(workspace);
    if (view === "outreach")
        return renderOutreach(workspace);
    if (view === "compare")
        return renderComparison(workspace);
    if (view === "selected")
        return renderSelected(workspace);
    if (view === "payment")
        return renderPayment(workspace);
    if (view === "registry")
        return renderSupplierRegistry();
    return renderDeployment(workspace);
}
function renderSupplierRegistry() {
    const entries = supplierRegistry?.entries ?? [];
    const summary = supplierRegistry?.summary;
    return `
    <section class="panel registry-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Private supplier bench</p>
          <h2>Your suppliers</h2>
          <p>Your supplier bench builds itself as you use Veltact.</p>
        </div>
        <button class="button button-secondary" type="button" data-close-registry>Back to requirement</button>
      </div>
      ${summary
        ? `<dl class="registry-summary" aria-label="Supplier registry summary">
              ${fact("Total suppliers", String(summary.total))}
              ${fact("Responded", String(summary.responded))}
              ${fact("Secured", String(summary.secured))}
              ${fact("Delivered", String(summary.delivered))}
            </dl>`
        : ""}
      ${entries.length
        ? `<div class="registry-table" role="table" aria-label="Your suppliers">
              <div class="registry-row registry-heading" role="row">
                <span role="columnheader">Supplier</span>
                <span role="columnheader">Relationship</span>
                <span role="columnheader">Capabilities</span>
                <span role="columnheader">Activity</span>
              </div>
              ${entries
            .map((entry) => `
                    <div class="registry-row" role="row">
                      <div role="cell">
                        <strong>${escapeHtml(entry.supplierName)}</strong>
                        <small>${escapeHtml(formatLocationLabel(entry.location))}</small>
                        <small>${escapeHtml(entry.source === "live_discovery"
            ? "Live public evidence"
            : entry.source === "catalog"
                ? "Veltact catalog"
                : "Labelled demo fixture")}</small>
                      </div>
                      <div role="cell">
                        <span class="registry-state registry-state-${escapeHtml(entry.provenanceState)}">${escapeHtml(statusLabel(entry.provenanceState))}</span>
                      </div>
                      <div role="cell">
                        ${tagList(entry.capabilities
            .slice(0, 4)
            .map((capability) => formatCapabilityLabel(capability)))}
                      </div>
                      <div role="cell">
                        <strong>${entry.engagementHistory.length} requirement${entry.engagementHistory.length === 1 ? "" : "s"}</strong>
                        <small>Last activity ${escapeHtml(formatTime(entry.updatedAt))}</small>
                      </div>
                    </div>
                  `)
            .join("")}
            </div>`
        : renderInlineEmpty("No suppliers in your bench yet", "Suppliers appear here automatically as Veltact discovers, contacts and secures them for your requirements.")}
    </section>
  `;
}
function renderWorkspaceStatus() {
    if (!workspace?.needProfile)
        return "";
    const status = workspace.engagement?.status ?? workspace.status;
    const payment = workspace.engagement?.paymentStatus;
    return `
    <aside class="workspace-status" aria-label="Current workspace status">
      <div>
        <span>Need Profile</span>
        <strong>${escapeHtml(shortId(workspace.needProfile.id))}</strong>
      </div>
      <div>
        <span>Status</span>
        <strong>${escapeHtml(statusLabel(status))}</strong>
      </div>
      ${payment
        ? `<div><span>Payment</span><strong>${escapeHtml(statusLabel(payment))}</strong></div>`
        : ""}
    </aside>
  `;
}
function renderIntake() {
    const structured = Boolean(aiIntakeResult);
    const missing = intakeMissingFields();
    const rawRequirementError = validateIntakeRawRequirement(intakeDraft.description);
    const primaryActionDisabled = loadState === "loading" || Boolean(rawRequirementError);
    const evidence = intakeEvidence.length
        ? `
      <div class="evidence-list" aria-label="Attached evidence">
        ${intakeEvidence
            .map((item, index) => `
              <div class="evidence-item">
                <span class="file-kind">${escapeHtml(item.kind.toUpperCase())}</span>
                <span>
                  <strong>${escapeHtml(item.name)}</strong>
                  <small>${escapeHtml(fileEvidenceNote(item))}</small>
                </span>
                <button class="text-button" type="button" data-remove-evidence="${index}">Remove</button>
              </div>
            `)
            .join("")}
      </div>
    `
        : `<p class="quiet-note">No files attached. PDF and photo evidence are optional.</p>`;
    return `
    <form id="requirement-form" class="panel intake-form">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Factory evidence</p>
          <h2>Context and supporting files</h2>
        </div>
        ${demoControlsAvailable
        ? `
              <div class="demo-utilities" aria-label="Demo utilities">
                <button class="button button-quiet" type="button" data-demo="plc">Demo: PLC</button>
                <button class="button button-quiet" type="button" data-demo="robotics">Demo: Robotic integration</button>
              </div>
            `
        : ""}
      </div>

      <section class="intake-section intake-problem">
        <div class="section-heading">
          <div>
            <span class="section-number">01</span>
            <h3>Describe the factory problem</h3>
          </div>
          <span class="boundary-label">Structures requirements only</span>
        </div>
        <label class="field field-wide">
          <span>Factory context</span>
          <textarea name="description" rows="6" minlength="${AI_INTAKE_RAW_REQUIREMENT_MIN_LENGTH}" maxlength="${AI_INTAKE_RAW_REQUIREMENT_MAX_LENGTH}" aria-describedby="factory-context-guidance factory-context-boundary" aria-invalid="${intakeDraft.description && rawRequirementError ? "true" : "false"}" placeholder="Packaging line stopped after intermittent Siemens PLC faults in Western Sydney. Need someone today. Speed matters." required>${escapeHtml(intakeDraft.description)}</textarea>
          <small id="factory-context-guidance">${escapeHtml(intakeRawRequirementGuidance(intakeDraft.description))}</small>
          <small id="factory-context-boundary">Use plain language. Veltact does not diagnose equipment or instruct machinery changes.</small>
        </label>
      </section>

      <section class="intake-section">
        <div class="section-heading">
          <div>
            <span class="section-number">02</span>
            <h3>Add evidence</h3>
          </div>
          <span class="optional-label">Optional</span>
        </div>
        <div class="file-grid">
          <label class="file-control">
            <span class="file-control-title">Attach PDF report</span>
            <span>Maintenance log, fault export or scope — max 10 MB</span>
            <input name="pdfEvidence" type="file" accept="application/pdf,.pdf" />
          </label>
          <label class="file-control">
            <span class="file-control-title">Attach photographs</span>
            <span>Status lights, panel wiring, nameplate or visible condition</span>
            <input name="photoEvidence" type="file" accept="image/jpeg,image/png,image/webp" />
          </label>
        </div>
        ${evidence}
      </section>

      ${structured ? renderStructuredIntakeSummary(missing) : ""}

      ${renderManualFields(structured, missing)}

      <div class="primary-action-row">
        <div>
          <strong>${escapeHtml(primaryActionHeading())}</strong>
          <span>${escapeHtml(primaryActionDescription())}</span>
        </div>
        <button class="button button-primary" type="submit" data-analyse-requirement aria-describedby="factory-context-guidance" ${primaryActionDisabled ? "disabled" : ""}>
          Analyse requirement
        </button>
      </div>
    </form>
  `;
}
function renderStructuredIntakeSummary(missing) {
    const confidence = aiIntakeResult?.confidence;
    return `
    <section class="structure-result">
      <div class="structure-result-heading">
        <div>
          <p class="eyebrow">Structured draft ready</p>
          <h3>Review every field before analysis</h3>
        </div>
        <div class="source-stack">
          ${sourceBadge(intakeSourceMode, "OpenAI API", "Local deterministic adapter")}
          <span class="confidence">
            ${confidence === undefined ? "Confidence not supplied" : `${Math.round(confidence * 100)}% intake confidence`}
          </span>
        </div>
      </div>
      ${missing.length
        ? `
            <div class="missing-strip">
              <strong>${missing.length} field${missing.length === 1 ? "" : "s"} need buyer input</strong>
              <span>${missing.map((item) => escapeHtml(humanFieldName(item))).join(" / ")}</span>
            </div>
          `
        : `
            <div class="complete-strip">
              <strong>Core RFQ fields are populated</strong>
              <span>Confirm the draft below before creating the Need Profile.</span>
            </div>
          `}
    </section>
  `;
}
function renderManualFields(open, missing) {
    return `
    <details class="manual-fields" ${open ? "open" : ""}>
      <summary>
        <span>
          <strong>${open ? "Review and edit Need Profile" : "Additional requirement details"}</strong>
          <small>${open ? "Confirm the structured fields before continuing." : "Location, urgency, budget, priority and buyer contact."}</small>
        </span>
        <span class="summary-status">${missing.length ? `${missing.length} missing` : "Ready"}</span>
      </summary>
      <div class="manual-fields-body">
        <div class="form-grid">
          ${formField("title", "Requirement title", intakeDraft.title, open)}
          ${formField("category", "Category", intakeDraft.category, open)}
          ${formField("location", "Site location", intakeDraft.location, open, "Western Sydney, NSW")}
          ${formField("requiredBy", "Urgency / required by", intakeDraft.requiredBy, false, "Today or target date")}
          ${formField("equipmentOrTechnology", "Equipment / technology", intakeDraft.equipmentOrTechnology.join(", "), false, "Siemens S7 PLC, packaging line")}
          ${formField("requiredCapabilities", "Required capabilities", intakeDraft.requiredCapabilities.join(", "), false, "PLC diagnostics, onsite support")}
          ${formField("budgetRange", "Budget / callout tolerance", intakeDraft.budgetRange, false, "Up to AUD 2,000")}
          ${formField("constraints", "Constraints", intakeDraft.constraints.join(", "), false, "Safe isolation, minimal downtime")}
          ${formField("companyName", "Buyer organisation", intakeDraft.companyName, false)}
          ${formField("contactName", "Buyer contact", intakeDraft.contactName, false)}
          ${formField("contactEmail", "Contact email", intakeDraft.contactEmail, open, "buyer@factory.com", "email")}
        </div>

        <fieldset class="priority-fieldset">
          <legend>What matters most?</legend>
          <div class="priority-grid">
            ${priorityButton("speed", "Speed", "Fastest credible response")}
            ${priorityButton("price", "Price", "Lowest credible cost")}
            ${priorityButton("quality", "Quality", "Strongest delivery standard")}
            ${priorityButton("technical_fit", "Technical fit", "Best capability alignment")}
            ${priorityButton("trust", "Trust", "Most proven supplier")}
          </div>
        </fieldset>
      </div>
    </details>
  `;
}
function renderPlan(data) {
    const profile = requireNeedProfile(data);
    const research = data.researchResult;
    const readOnly = isHistoricalJourneyPhase(data, "find");
    if (!research) {
        return renderUnavailable("Solution analysis unavailable", "The API did not return research or a labelled fallback result.", "Retry analysis", "retry-research");
    }
    const approaches = selectableApproaches(research);
    if (approaches.length !== 3) {
        return renderUnavailable("Three solution pathways are required", `The research API returned ${approaches.length} usable pathway${approaches.length === 1 ? "" : "s"}. Veltact will not invent the missing supplier scope.`, "Retry analysis", "retry-research");
    }
    selectedApproachId = resolveSelectedApproachId(research, selectedApproachId ||
        data.solutionDecision?.selectedApproachIds[0]);
    const selectedApproach = approaches.find((approach) => approach.id === selectedApproachId);
    const missing = dedupeSimilarStrings(uniqueStrings([...intakeMissingFields(), ...research.missingInformation]));
    return `
    <div class="view-stack">
      <article class="need-report" aria-label="Veltact Need Profile report">
        <header class="report-heading">
          <div>
            <span class="report-wordmark">Veltact</span>
            <p>Need Profile ${escapeHtml(shortId(profile.id))}</p>
          </div>
          <div class="source-stack">
            ${sourceBadge(research.sourceMode, "Live research", "Fixture research")}
            ${aiIntakeResult?.confidence === undefined
        ? ""
        : `<span class="confidence">${Math.round(aiIntakeResult.confidence * 100)}% intake confidence</span>`}
          </div>
        </header>
        <div class="report-title">
          <p class="eyebrow">Find / Buyer-reviewed requirement</p>
          <h2>${escapeHtml(profile.title)}</h2>
          <p>${escapeHtml(research.overview)}</p>
        </div>
        ${renderNeedProfile(profile)}

        <section class="solution-report">
          <div class="solution-report-heading">
            <div>
              <p class="eyebrow">Decision pathways</p>
              <h2>${readOnly ? "Selected supplier-ready solution" : "Select one supplier-ready solution"}</h2>
            </div>
            <span class="solution-count">3 pathways</span>
          </div>
          <p class="section-intro">${readOnly
        ? "This completed Find record preserves the buyer-selected pathway used for supplier matching."
        : "The highest-confidence path is recommended, but all three remain available for buyer review. Selecting a path does not contact suppliers."}</p>
          <div class="solution-grid" role="radiogroup" aria-label="Solution pathways">
            ${approaches
        .map((approach, index) => renderSolutionOption(approach, research.citations, index === 0, readOnly))
        .join("")}
          </div>
          <div class="selected-scope" aria-live="polite">
            <span>Selected supplier scope</span>
            <strong>${selectedApproach ? escapeHtml(selectedApproach.title) : "Select one pathway"}</strong>
          </div>
          ${readOnly
        ? `
                <div class="complete-strip historical-view-notice">
                  <strong>Find complete</strong>
                  <span>This is a read-only record. Return to the current journey stage to continue.</span>
                </div>
              `
        : ""}
        </section>

        <section class="report-evidence">
          <div class="evidence-columns">
            <div>
              <p class="eyebrow">Missing information</p>
              <h3>Confirm before supplier commitment</h3>
              ${missing.length
        ? `<ul class="check-list missing-list">${missing.map((item) => `<li>${escapeHtml(humanFieldName(item))}</li>`).join("")}</ul>`
        : `<p class="positive-copy">No material intake gaps were identified.</p>`}
            </div>
            <div>
              <p class="eyebrow">Provenance</p>
              <h3>Evidence used for these pathways</h3>
              ${renderCitations(research.citations)}
            </div>
          </div>
          <div class="safety-boundary">
            <strong>Safety boundary</strong>
            <p>${escapeHtml(research.safetyNotice)}</p>
          </div>
        </section>
      </article>

      <section class="outcome-band report-outcomes">
        <div>
          <p class="eyebrow">${readOnly ? "Completed stage" : "Report ready"}</p>
          <h2>${readOnly ? "Find decisions are locked" : "Keep the report or continue to suppliers"}</h2>
          <p>${readOnly ? "The selected pathway and its evidence remain visible without reopening supplier discovery." : "Download is a report utility. Supplier discovery begins only when you choose Find suppliers."}</p>
        </div>
        <div class="outcome-actions">
          <button class="button button-secondary button-large" type="button" data-download-report ${selectedApproach && !readOnly ? "" : "disabled"}>
            Download report
          </button>
          <button class="button button-primary button-large" type="button" data-find-suppliers ${selectedApproach && !readOnly ? "" : "disabled"}>
            Find suppliers
          </button>
          ${readOnly ? `<span class="status-chip is-ready">Read-only history</span>` : ""}
        </div>
      </section>
    </div>
  `;
}
function renderSolutionOption(approach, citations, recommended, readOnly = false) {
    const selected = approach.id === selectedApproachId;
    return `
    <article class="solution-option ${selected ? "is-selected" : ""}">
      <label class="solution-choice">
        <input
          type="radio"
          name="solution-pathway"
          value="${escapeHtml(approach.id)}"
          ${selected ? "checked" : ""}
          ${readOnly ? "disabled" : ""}
        />
        <span class="solution-choice-copy">
          <span class="solution-option-meta">
            ${recommended ? `<strong class="recommended-label">Recommended</strong>` : `<strong>Alternative</strong>`}
            <span>${Math.round(approach.confidence * 100)}% confidence</span>
          </span>
          <strong class="solution-title">${escapeHtml(approach.title)}</strong>
          <span class="solution-summary">${escapeHtml(approach.summary)}</span>
        </span>
      </label>
      <details class="solution-details">
        <summary>Review scope and cited evidence</summary>
        <p class="rationale">${escapeHtml(approach.rationale)}</p>
        ${renderApproachDetails(approach, citations)}
      </details>
    </article>
  `;
}
function renderNeedProfile(profile) {
    const equipment = intakeDraft.equipmentOrTechnology.length
        ? intakeDraft.equipmentOrTechnology
        : aiIntakeResult?.generatedProfile.equipmentOrTechnology ?? [];
    const capabilities = intakeDraft.requiredCapabilities.length
        ? intakeDraft.requiredCapabilities
        : aiIntakeResult?.generatedProfile.requiredCapabilities ?? [];
    return `
    <div class="need-profile">
      <div class="need-profile-main">
        <span class="profile-label">Problem summary</span>
        <h3>${escapeHtml(profile.title)}</h3>
        <p>${escapeHtml(profile.description)}</p>
      </div>
      <dl class="profile-facts">
        ${fact("Category", profile.category)}
        ${fact("Location", profile.location)}
        ${fact("Required by", profile.requiredBy ?? "Not provided", !profile.requiredBy)}
        ${fact("Budget / tolerance", profile.budget
        ? money(profile.budget.amount, profile.budget.currency)
        : intakeDraft.budgetRange || "Not provided", !profile.budget && !intakeDraft.budgetRange)}
        ${fact("Priority", priorityLabel(priority))}
        ${fact("Contact", (profile.contactEmail ?? intakeDraft.contactEmail) || "Not provided", !profile.contactEmail && !intakeDraft.contactEmail)}
      </dl>
      <div class="profile-lists">
        ${profileList("Equipment / technology", equipment)}
        ${profileList("Required capabilities", capabilities.length ? capabilities : profile.mustHaves)}
        ${profileList("Constraints", profile.constraints)}
      </div>
      ${renderIntakeProvenance()}
    </div>
  `;
}
function renderApproachDetails(approach, citations) {
    const referenced = citations.filter((citation) => approach.citationIds.includes(citation.id));
    return `
    <div class="approach-grid">
      <div>
        <h3>Safe preparation</h3>
        ${bulletList(approach.localActions, "No local preparation listed.")}
      </div>
      <div>
        <h3>Escalate when</h3>
        ${bulletList(approach.outsourceTriggers, "No escalation triggers listed.")}
      </div>
      <div>
        <h3>Supplier capabilities</h3>
        ${tagList(approach.requiredCapabilities)}
      </div>
      <div>
        <h3>Risks to confirm</h3>
        ${bulletList(approach.risks, "No specific risks listed.")}
      </div>
    </div>
    <div class="inline-citations">
      <span>Supports this approach</span>
      ${referenced
        .map((citation) => `
            <a href="${safeHttpUrl(citation.url)}" target="_blank" rel="noreferrer">
              ${escapeHtml(citation.title)}
            </a>
          `)
        .join("")}
    </div>
  `;
}
function renderCandidates(data) {
    const profile = requireNeedProfile(data);
    const candidates = supplierCandidates(data);
    if (!candidates.length) {
        return renderUnavailable("No supplier candidates available", "The supplier discovery API returned no candidates for this requirement. No outreach has been sent.", "Refresh candidates", "refresh-workspace");
    }
    candidates.sort((left, right) => right.score - left.score);
    selectedCandidateIds = resolveSelectedCandidateIds(data, selectedCandidateIds, candidateSelectionInitialised);
    candidateSelectionInitialised = true;
    const selectedCount = candidates.filter((candidate) => selectedCandidateIds.has(candidate.supplierId)).length;
    const unavailableChoices = [...selectedOutreachChoices].filter((choice) => !outreachChoiceAvailable(data, candidates, choice));
    const action = outreachAction(selectedOutreachChoices, selectedCount, unavailableChoices);
    const canSend = selectedCount > 0 &&
        selectedOutreachChoices.size > 0 &&
        unavailableChoices.length === 0;
    return `
    <div class="view-stack">
      <section class="panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Connect / Explainable matches</p>
            <h2>${candidates.length} suppliers matched to ${escapeHtml(profile.title)}</h2>
          </div>
          <span class="source-badge is-api">API workspace</span>
        </div>
        <p class="section-intro">Select one or more candidates after reviewing fit, evidence and risk. No supplier is contacted until the outreach action below succeeds.</p>
        <div class="candidate-grid">
          ${candidates
        .map((match, index) => renderCandidate(data, match, index))
        .join("")}
        </div>
      </section>

      <section class="outreach-approval action-band">
        <div class="outreach-approval-heading">
          <div>
            <p class="eyebrow">Buyer-approved outreach</p>
            <h2>${outreachPanelOpen ? "Choose connection channels" : `${selectedCount} supplier${selectedCount === 1 ? "" : "s"} selected`}</h2>
          </div>
          <span class="selection-count">${selectedCount}/${candidates.length}</span>
        </div>
        ${outreachPanelOpen
        ? `
              <fieldset class="outreach-modes">
                <legend>Select one or more channels</legend>
                ${renderOutreachChoice(data, candidates, "link", "Link", "Create a private RFQ link to copy manually")}
                ${renderOutreachChoice(data, candidates, "sms", "SMS", "Send the private RFQ link to supplier mobile numbers")}
                ${renderOutreachChoice(data, candidates, "email", "Email", "Send the private RFQ link to supplier email addresses")}
              </fieldset>
              <div class="primary-action-row">
                <div>
                  <strong>${escapeHtml(action.title)}</strong>
                  <span>${escapeHtml(action.description)}</span>
                </div>
                <button
                  class="button button-primary button-large"
                  type="button"
                  data-send-outreach
                  ${canSend ? "" : "disabled"}
                >
                  Send
                </button>
              </div>
            `
        : `
              <div class="primary-action-row">
                <div>
                  <strong>Ready to contact the selected suppliers</strong>
                  <span>${escapeHtml(selectedCount
            ? "Choose how each supplier receives the same private RFQ."
            : "Select at least one supplier to continue.")}</span>
                </div>
                <button
                  class="button button-primary button-large"
                  type="button"
                  data-open-outreach
                  ${selectedCount > 0 ? "" : "disabled"}
                >
                  Connect
                </button>
              </div>
            `}
      </section>
    </div>
  `;
}
function renderCandidate(data, match, index) {
    const supplier = supplierFor(data, match.supplierId);
    const invitation = invitationForSupplier(data, match.supplierId);
    const selected = selectedCandidateIds.has(match.supplierId);
    return `
    <article class="candidate-card ${selected ? "is-selected" : ""}">
      <div class="candidate-rank">0${index + 1}</div>
      <label class="candidate-select">
        <input
          type="checkbox"
          value="${escapeHtml(match.supplierId)}"
          data-candidate-id="${escapeHtml(match.supplierId)}"
          ${selected ? "checked" : ""}
        />
        <span>${selected ? "Selected for outreach" : "Select supplier"}</span>
      </label>
      <div class="candidate-heading">
        <div>
          <h3>${renderCompanyIdentity(supplierName(supplier, match.supplierId))}</h3>
          <span>${escapeHtml(supplierLocation(supplier))}</span>
        </div>
        <span class="match-score">${Math.round(match.score)}%</span>
      </div>
      <div class="candidate-provenance">
        ${sourceBadge(supplier && "sourceMode" in supplier ? supplier.sourceMode : "fixture", "Live public evidence", supplierRecordLabel(supplier))}
        <span>${escapeHtml(candidateContactReadiness(supplier))}</span>
      </div>
      <div class="candidate-section">
        <strong>Why this supplier</strong>
        ${bulletList(match.reasons.slice(0, 2), "No match explanation returned.")}
        ${match.reasons.length > 2
        ? `
              <details class="match-more">
                <summary>View ${match.reasons.length - 2} more match signals</summary>
                ${bulletList(match.reasons.slice(2), "No additional signals.")}
              </details>
            `
        : ""}
      </div>
      ${renderCandidateEvidence(supplier)}
      <div class="candidate-section">
        <strong>Risks to verify</strong>
        ${bulletList(match.risks.slice(0, 2), "No specific match risks returned.")}
        ${match.risks.length > 2
        ? `
              <details class="match-more">
                <summary>View ${match.risks.length - 2} more risks</summary>
                ${bulletList(match.risks.slice(2), "No additional risks.")}
              </details>
            `
        : ""}
      </div>
      <div class="candidate-footer">
        <span class="status-chip is-ready">${invitation ? "Link ready" : "Candidate"}</span>
        <span>${invitation ? "Private supplier workspace generated" : "Buyer approval required"}</span>
      </div>
    </article>
  `;
}
function renderCandidateEvidence(supplier) {
    if (!supplier || !("evidence" in supplier))
        return "";
    const live = supplier.sourceMode === "live";
    return `
    <div class="candidate-section candidate-evidence">
      <strong>${live ? "Public discovery evidence" : "Labelled demo evidence"}</strong>
      ${live
        ? `<p>Public evidence produced this candidate. It is not a verified or enrolled supplier.</p>`
        : `<p>Fixture evidence keeps the keyless demo deterministic and does not represent a real supplier.</p>`}
      <details class="match-more">
        <summary>Review ${supplier.evidence.length} source${supplier.evidence.length === 1 ? "" : "s"}</summary>
        <ul class="candidate-source-list">
          ${supplier.evidence
        .map((evidence) => `
                <li>
                  <a href="${safeHttpUrl(evidence.url)}" target="_blank" rel="noreferrer">${escapeHtml(evidence.title)}</a>
                  <small>Retrieved ${escapeHtml(formatTime(evidence.accessedAt))}</small>
                </li>
              `)
        .join("")}
        </ul>
      </details>
    </div>
  `;
}
function renderOutreachChoice(data, candidates, value, label, description) {
    const selected = selectedOutreachChoices.has(value);
    const available = outreachChoiceAvailable(data, candidates, value);
    const availableDescription = value === "email" && stagingOutreachOverrides.email
        ? "Send the private RFQ link through the configured staging email recipient"
        : value === "sms" && stagingOutreachOverrides.sms
            ? "Send the private RFQ link through the configured staging SMS recipient"
            : description;
    return `
    <label class="outreach-mode ${selected ? "is-selected" : ""} ${available ? "" : "is-unavailable"}">
      <input
        type="checkbox"
        name="outreach-choice"
        value="${value}"
        ${selected ? "checked" : ""}
        ${!available && !selected ? "disabled" : ""}
      />
      <span>
        <strong>${escapeHtml(label)}</strong>
        <small>${escapeHtml(available
        ? availableDescription
        : `${description}. Unavailable for one or more selected suppliers.`)}</small>
      </span>
    </label>
  `;
}
function renderOutreach(data) {
    const responded = submittedResponses(data).length;
    const readyToCompare = responded >= 2;
    const singleComparable = hasSingleComparableResponse(data);
    return `
    <div class="view-stack">
      <section class="panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Connect / Supplier outreach</p>
            <h2>${responded} of ${data.invitations.length} suppliers responded</h2>
          </div>
          <span class="response-count ${readyToCompare ? "is-ready" : ""}">${readyToCompare ? "Comparison ready" : "Awaiting responses"}</span>
        </div>
        <div class="separate-link-notice">
          <strong>Suppliers respond from a separate secure link</strong>
          <span>Open a link in another tab for the supplier demo. The buyer workspace updates from backend response records.</span>
        </div>
        ${data.invitations.length
        ? `<div class="outreach-list">${data.invitations
            .map((invitation) => renderSupplierOutreach(data, invitation))
            .join("")}</div>`
        : renderInlineEmpty("No invitations returned", "The backend did not generate supplier invitation links.")}
      </section>

      <section class="primary-action-row action-band">
        <div>
          <strong>${readyToCompare ? "Two supplier responses are ready" : "Waiting for two comparable responses"}</strong>
          <span>${readyToCompare ? "Compare the same commercial and technical fields side by side." : "Delivery and response status refresh automatically. No response is simulated in this buyer UI."}</span>
        </div>
        ${readyToCompare
        ? `<button class="button button-primary button-large" type="button" data-compare>Compare responses</button>`
        : `
              <div class="outcome-actions">
                <button class="button button-primary" type="button" data-refresh-workspace>Refresh responses</button>
                ${singleComparable
            ? `<button class="button button-secondary" type="button" data-compare-single>Review the single response (1 of 2)</button>`
            : ""}
              </div>
            `}
      </section>
    </div>
  `;
}
function renderSupplierOutreach(data, invitation) {
    const supplier = supplierFor(data, invitation.supplierId);
    const response = data.responses.find((item) => item.invitationId === invitation.id);
    const deliveries = data.outreachDeliveries.filter((item) => item.invitationId === invitation.id);
    const activity = supplierActivity(invitation, response, deliveries);
    const email = deliveries.find((item) => item.channel === "email");
    const sms = deliveries.find((item) => item.channel === "sms");
    return `
    <article class="outreach-item">
      <div class="outreach-heading">
        <div>
          <h3>${renderCompanyIdentity(supplierName(supplier, invitation.supplierId))}</h3>
          <span>Secure response expires ${escapeHtml(formatTime(invitation.expiresAt))}</span>
        </div>
        <span class="status-chip is-${activity}">${activityLabel(activity)}</span>
      </div>
      <div class="delivery-grid">
        ${renderDelivery("Email", email)}
        ${renderDelivery("SMS", sms)}
        <div class="delivery-row">
          <span>Secure link</span>
          <strong>${activity === "viewed" || activity === "responded" ? activityLabel(activity) : "Ready"}</strong>
          <small>Separate supplier workspace</small>
        </div>
      </div>
      <div class="secure-link-row">
        <code title="${escapeHtml(invitation.responseUrl)}">${escapeHtml(shortUrl(invitation.responseUrl))}</code>
        <div>
          <button class="button button-quiet button-small" type="button" data-copy-link="${escapeHtml(invitation.responseUrl)}">Copy link</button>
          <a class="button button-secondary button-small" href="${safeHttpUrl(invitation.responseUrl)}" target="_blank" rel="noreferrer">Open supplier link</a>
        </div>
      </div>
      ${response
        ? `<p class="response-signal"><strong>${response.decision === "can_help" ? "Can help" : "Cannot help"}</strong> Response submitted ${escapeHtml(formatTime(response.submittedAt))}</p>`
        : ""}
    </article>
  `;
}
function renderDelivery(label, delivery) {
    if (!delivery) {
        return `
      <div class="delivery-row">
        <span>${label}</span>
        <strong>Unavailable</strong>
        <small>${label === "SMS" ? "No SMS destination configured" : "No delivery destination returned"}</small>
      </div>
    `;
    }
    const status = delivery.deliveryStatus === "sent"
        ? "Sent"
        : delivery.deliveryStatus === "failed"
            ? "Failed"
            : delivery.deliveryStatus === "queued"
                ? "Queued"
                : /local demo/i.test(delivery.errorMessage ?? "")
                    ? "Local demo only"
                    : /not configured/i.test(delivery.errorMessage ?? "")
                        ? "Not configured"
                        : "Ready";
    const detail = delivery.deliveryStatus === "queued"
        ? "Provider request in progress"
        : delivery.errorMessage ??
            (delivery.sentAt
                ? `Confirmed ${formatTime(delivery.sentAt)}`
                : maskDestination(delivery.destination));
    return `
    <div class="delivery-row">
      <span>${label}</span>
      <strong class="${delivery.deliveryStatus === "failed" ? "text-danger" : ""}">${status}</strong>
      <small>${escapeHtml(detail)}</small>
    </div>
  `;
}
function renderComparison(data) {
    const responses = submittedResponses(data);
    const selectable = responses.filter(isSelectableSupplierResponse);
    const hasMinimum = responses.length >= 2;
    const singleResponseMode = responses.length === 1 && selectable.length === 1;
    const readOnly = isHistoricalJourneyPhase(data, "connect");
    const activeResponseId = data.engagement?.supplierResponseId ?? selectedResponseId;
    const selected = selectable.find((item) => item.id === activeResponseId);
    const selectionAllowed = canSelectSupplierFromComparison(data);
    return `
    <div class="view-stack">
      <section class="panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Connect / Standardised comparison</p>
            <h2>Compare supplier responses</h2>
          </div>
          <span class="response-count ${hasMinimum ? "is-ready" : ""}">${responses.length} submitted</span>
        </div>
        ${readOnly
        ? `
              <div class="complete-strip historical-view-notice">
                <strong>Connect complete</strong>
                <span>This comparison is read-only because a supplier engagement already exists.</span>
              </div>
            `
        : hasMinimum
            ? `<p class="section-intro">Every response uses the same decision fields. Select one credible supplier to create a single engagement.</p>`
            : singleResponseMode
                ? `
                <div class="warning-strip">
                  <strong>Only one comparable response was received.</strong>
                  <span>Standard flow compares at least two.</span>
                </div>
              `
                : `
              <div class="warning-strip">
                <strong>A second response is still required for comparison.</strong>
                <span>Open another secure supplier link and submit its response. The buyer UI will not manufacture one.</span>
              </div>
            `}
        ${responses.length
        ? `<div class="response-grid">${responses
            .map((response) => renderResponseCard(data, response, readOnly, activeResponseId))
            .join("")}</div>`
        : renderInlineEmpty("No submitted responses", "Return to outreach and use the secure supplier links.")}
      </section>

      <section class="primary-action-row action-band">
        <div>
          <strong>${selected ? `${renderCompanyIdentity(supplierName(supplierFor(data, selected.supplierId), selected.supplierId), true)} selected` : "Choose one supplier response"}</strong>
          <span>Selection creates the engagement. It does not mark payment complete or secure the supplier.</span>
        </div>
        ${readOnly
        ? `<button class="button button-primary button-large" type="button" disabled>Supplier already selected</button>`
        : selectionAllowed
            ? `<button class="button button-primary button-large" type="button" data-select-supplier ${selected ? "" : "disabled"}>Select supplier</button>`
            : `<button class="button button-primary" type="button" data-back-outreach>Return to outreach</button>`}
      </section>
    </div>
  `;
}
function renderResponseCard(data, response, readOnly = false, activeResponseId = selectedResponseId) {
    const supplier = supplierFor(data, response.supplierId);
    const match = matchForSupplier(data, response.supplierId);
    const canHelp = response.decision === "can_help";
    const validPrice = (response.indicativePrice?.amount ?? 0) > 0;
    const selectable = canHelp && validPrice;
    const selected = selectable && response.id === activeResponseId;
    return `
    <article class="response-card ${selected ? "is-selected" : ""} ${selectable ? "" : canHelp ? "is-invalid" : "is-declined"}">
      <label class="response-select">
        <input
          type="radio"
          name="supplier-response"
          value="${escapeHtml(response.id)}"
          ${selected ? "checked" : ""}
          ${selectable && !readOnly ? "" : "disabled"}
        />
        <span>
          <strong>${renderCompanyIdentity(supplierName(supplier, response.supplierId), true)}</strong>
          <small>${selectable ? "Available for selection" : canHelp ? "Invalid price — unavailable" : "Cannot help"}</small>
        </span>
        <span class="match-score">${match ? `${Math.round(match.score)}%` : "N/A"}</span>
      </label>
      <dl class="comparison-facts">
        ${comparisonFact("Availability", formatSupplierAvailability(response.availability ?? "Not provided"), !response.availability)}
        ${comparisonFact("Price", supplierResponsePriceLabel(response), !validPrice)}
        ${comparisonFact("Technical fit", match?.reasons.slice(0, 3).join("; ") ??
        "No match rationale returned", !match)}
        ${comparisonFact("Experience", response.relevantExperience ?? "Not provided", !response.relevantExperience)}
        ${comparisonFact("Proposed approach", response.proposedApproach ?? "Not provided in this response", !response.proposedApproach)}
        ${comparisonFact("Assumptions", response.assumptions?.join("; ") ?? "Not provided", !response.assumptions?.length)}
        ${comparisonFact("Conditions", response.conditions.length
        ? response.conditions.join("; ")
        : "No conditions supplied", !response.conditions.length)}
      </dl>
    </article>
  `;
}
function supplierResponsePriceLabel(response) {
    if (response.decision !== "can_help" ||
        !response.indicativePrice ||
        response.indicativePrice.amount <= 0) {
        return "Not provided";
    }
    return money(response.indicativePrice.amount, response.indicativePrice.currency);
}
function renderSelected(data) {
    const selection = selectedSupplier(data);
    if (!selection || !data.engagement) {
        return renderUnavailable("Selected supplier unavailable", "The backend engagement does not resolve to a submitted supplier response.", "Refresh selection", "refresh-workspace");
    }
    return `
    <section class="panel selection-panel">
      <p class="eyebrow">Deploy / Supplier selected</p>
      <h2>${renderCompanyIdentity(supplierName(selection.supplier, selection.response.supplierId), true)}</h2>
      <p class="terminal-copy">The engagement exists, but the supplier is not secured until payment evidence is confirmed by the backend.</p>
      <dl class="selection-summary">
        ${fact("Availability", formatSupplierAvailability(selection.response.availability ?? "Not provided"), !selection.response.availability)}
        ${fact("Indicative price", selection.response.indicativePrice
        ? money(selection.response.indicativePrice.amount, selection.response.indicativePrice.currency)
        : "Not provided", !selection.response.indicativePrice)}
        ${fact("Engagement", shortId(data.engagement.id))}
        ${fact("Payment", statusLabel(data.engagement.paymentStatus))}
      </dl>
      <div class="primary-action-row">
        <div>
          <strong>Create a hosted commitment</strong>
          <span>The API uses the configured payment provider and returns its hosted link. Payment remains pending until backend evidence is confirmed.</span>
        </div>
        <button class="button button-primary button-large" type="button" data-create-payment>${localDemoPaymentAvailable ? "Create local demo payment link" : "Create Pinch payment link"}</button>
      </div>
    </section>
    ${renderSpeedReceipt(data.speedReceipt)}
  `;
}
function formatReceiptElapsed(elapsedMilliseconds) {
    const totalSeconds = Math.max(0, Math.floor(elapsedMilliseconds / 1000));
    if (totalSeconds < 1)
        return "<1s";
    if (totalSeconds < 60)
        return `${totalSeconds}s`;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (totalMinutes < 60) {
        return `${totalMinutes}m ${seconds}s`;
    }
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
}
function renderSpeedReceipt(receipt) {
    if (!receipt) {
        return `
      <section class="panel speed-receipt speed-receipt-pending" aria-labelledby="speed-receipt-title">
        <p class="eyebrow">Speed receipt</p>
        <h2 id="speed-receipt-title">Lifecycle timing is loading</h2>
        <p>The buyer-scoped receipt will use backend-recorded timestamps only.</p>
      </section>
    `;
    }
    const secured = receipt.status === "secured" &&
        receipt.elapsedMilliseconds !== undefined;
    const paymentEvidence = receipt.events.find((event) => event.stage === "payment_verified");
    const sourceLabel = paymentEvidence?.evidenceSource === "local_demo"
        ? "Local demo evidence"
        : paymentEvidence?.authoritative
            ? "Backend-verified evidence"
            : "Lifecycle in progress";
    return `
    <section class="panel speed-receipt" aria-labelledby="speed-receipt-title">
      <div class="speed-receipt-heading">
        <div>
          <p class="eyebrow">Speed receipt</p>
          <h2 id="speed-receipt-title">${secured
        ? `Secured in ${escapeHtml(formatReceiptElapsed(receipt.elapsedMilliseconds))}`
        : "Supplier securing in progress"}</h2>
          <p>A timestamped record from requirement to funded engagement.</p>
        </div>
        <span class="source-badge ${paymentEvidence?.evidenceSource === "local_demo"
        ? "is-fixture"
        : ""}">${escapeHtml(sourceLabel)}</span>
      </div>
      <div class="speed-baseline">
        <span>General claim</span>
        <strong>${escapeHtml(receipt.baseline.label)}</strong>
      </div>
      <ol class="speed-receipt-events">
        ${receipt.events
        .map((event) => `
              <li class="is-${event.status}">
                <span class="receipt-marker" aria-hidden="true"></span>
                <div>
                  <strong>${escapeHtml(event.label)}</strong>
                  ${event.detail
        ? `<p>${escapeHtml(event.detail)}</p>`
        : ""}
                </div>
                ${event.occurredAt
        ? `<time datetime="${escapeHtml(event.occurredAt)}">${escapeHtml(formatTime(event.occurredAt))}</time>`
        : `<span class="receipt-pending-label">${escapeHtml(statusLabel(event.status))}</span>`}
              </li>
            `)
        .join("")}
      </ol>
      <div class="speed-receipt-actions">
        <button class="button button-secondary" type="button" data-print-receipt>Print receipt</button>
      </div>
    </section>
  `;
}
function hostedPaymentKind(value) {
    if (!value)
        return "uncreated";
    try {
        const url = new URL(value);
        if (!["http:", "https:"].includes(url.protocol)) {
            return "hosted";
        }
        const paymentLinkId = url.searchParams.get("payment_link_id");
        if (url.searchParams.get("payment_provider") === "local_demo" &&
            paymentLinkId?.startsWith("local_demo_link_")) {
            return "local_demo";
        }
        if (url.protocol === "https:" &&
            (url.hostname === "getpinch.com.au" ||
                url.hostname.endsWith(".getpinch.com.au"))) {
            return "pinch";
        }
        return "hosted";
    }
    catch {
        return "hosted";
    }
}
function paymentLinkPresentation(hostedUrl) {
    const kind = hostedPaymentKind(hostedUrl);
    if (kind === "local_demo") {
        return {
            kind,
            eyebrow: "Deploy / Local demo commitment",
            intro: "This development-only link returns to Veltact without taking payment. The engagement remains pending until explicit local demo evidence is recorded.",
            summaryLabel: "Demo return",
            summaryValue: "Synthetic local link",
            boundaryTitle: "Synthetic local return",
            boundaryCopy: "Opening this link does not contact Pinch or complete payment. It creates no provider approval or authoritative payment evidence.",
            actionTitle: "Open the synthetic local return",
            actionCopy: "Development only. No money moves and the engagement remains awaiting payment.",
            openLabel: "Open local demo return",
            readyMessage: "Local demo return link is ready."
        };
    }
    if (kind === "pinch") {
        return {
            kind,
            eyebrow: "Deploy / Pinch commitment",
            intro: "Payment remains pending until Pinch returns authoritative evidence to the API.",
            summaryLabel: "Pinch link",
            summaryValue: "Created by API",
            boundaryTitle: "Backend-confirmed payment only",
            boundaryCopy: "Opening checkout does not change payment status. The buyer workspace refreshes the engagement record to confirm Pinch evidence.",
            actionTitle: "Complete the commitment in Pinch",
            actionCopy: "Pinch checkout opens in a separate secure tab.",
            openLabel: "Open secure Pinch checkout",
            readyMessage: "Pinch checkout is ready."
        };
    }
    if (kind === "hosted") {
        return {
            kind,
            eyebrow: "Deploy / Hosted commitment",
            intro: "Payment remains pending until the configured provider returns authoritative evidence to the API.",
            summaryLabel: "Hosted link",
            summaryValue: "Created by API",
            boundaryTitle: "Provider confirmation required",
            boundaryCopy: "Opening the hosted link does not change payment status. The buyer workspace refreshes the engagement record for provider evidence.",
            actionTitle: "Complete the hosted commitment",
            actionCopy: "The configured provider opens in a separate secure tab.",
            openLabel: "Open hosted payment",
            readyMessage: "Hosted payment link is ready."
        };
    }
    return {
        kind,
        eyebrow: "Deploy / Hosted commitment",
        intro: "Payment remains pending until the configured provider returns authoritative evidence to the API.",
        summaryLabel: "Hosted link",
        summaryValue: "Not created",
        boundaryTitle: "Backend-confirmed payment only",
        boundaryCopy: "Creating or opening a hosted link does not change payment status. The buyer workspace waits for provider evidence.",
        actionTitle: "Create a hosted payment link",
        actionCopy: "The configured payment provider must return a hosted URL.",
        openLabel: "Create payment link",
        readyMessage: "The API did not return a hosted payment link."
    };
}
function renderPayment(data) {
    const engagement = data.engagement;
    if (!engagement) {
        return renderUnavailable("Payment unavailable", "Select a submitted supplier response before creating a commitment.");
    }
    const secured = engagement.status === "supplier_secured";
    if (secured) {
        return renderDeployment(data);
    }
    const hostedUrl = engagement.hostedCheckoutUrl;
    const paymentPresentation = paymentLinkPresentation(hostedUrl);
    const profile = requireNeedProfile(data);
    const commitmentAmount = data.deployment?.milestones[0]?.amount ??
        selectedSupplier(data)?.response.indicativePrice ??
        profile.budget;
    const serviceFeeMinor = data.deployment?.milestones[0]?.serviceFeeMinor;
    return `
    <section class="panel payment-panel">
      <div class="payment-heading">
        <div>
          <p class="eyebrow">${escapeHtml(paymentPresentation.eyebrow)}</p>
          <h2>Awaiting payment</h2>
          <p>${escapeHtml(paymentPresentation.intro)}</p>
        </div>
        <span class="payment-state">${escapeHtml(statusLabel(engagement.paymentStatus))}</span>
      </div>
      <dl class="payment-summary">
        ${fact("Commitment amount", commitmentAmount
        ? money(commitmentAmount.amount, commitmentAmount.currency)
        : "Set by payment provider", !commitmentAmount)}
        ${fact("Supplier", supplierName(supplierFor(data, engagement.supplierId), engagement.supplierId))}
        ${fact("Engagement", shortId(engagement.id))}
        ${fact(paymentPresentation.summaryLabel, paymentPresentation.summaryValue, !hostedUrl)}
      </dl>
      <div class="payment-boundary">
        <strong>${escapeHtml(paymentPresentation.boundaryTitle)}</strong>
        <span>${escapeHtml(paymentPresentation.boundaryCopy)}</span>
      </div>
      ${serviceFeeMinor === undefined
        ? ""
        : `<p class="service-fee-disclosure">Includes disclosed Veltact service fee: <strong>${money(serviceFeeMinor, commitmentAmount?.currency ?? "AUD")}</strong>. This records the fee allocation; it does not claim settlement.</p>`}
      <div class="payment-evidence payment-evidence-pending">
        <strong>Payment evidence</strong>
        <span>Secured only by verified Pinch webhook or API reconciliation — never by browser return.</span>
      </div>
      <div class="primary-action-row">
        <div>
          <strong>${escapeHtml(paymentPresentation.actionTitle)}</strong>
          <span>${escapeHtml(paymentPresentation.actionCopy)}</span>
        </div>
        ${hostedUrl
        ? `<a class="button button-primary button-large" href="${safeHttpUrl(hostedUrl)}" target="_blank" rel="noreferrer">${escapeHtml(paymentPresentation.openLabel)}</a>`
        : `<button class="button button-primary button-large" type="button" data-create-payment>${escapeHtml(paymentPresentation.openLabel)}</button>`}
      </div>
      <div class="secondary-actions">
        <button class="button button-secondary" type="button" data-refresh-payment>Check payment status</button>
      </div>
      ${localDemoPaymentAvailable &&
        hostedPaymentKind(hostedUrl) === "local_demo"
        ? `
            <details class="developer-utility" open>
              <summary>Local demo payment utility</summary>
              <p>This calls the backend demo-payment route. It is unavailable in production and remains distinct from live Pinch evidence.</p>
              <button class="button button-quiet" type="button" data-demo-payment>Record local demo payment</button>
            </details>
          `
        : ""}
    </section>
    ${renderSpeedReceipt(data.speedReceipt)}
  `;
}
function eligibleDeploymentTransition(deployment) {
    const milestones = [...deployment.milestones].sort((left, right) => left.sequence - right.sequence);
    const index = milestones.findIndex((milestone) => milestone.status !== "completed");
    if (index < 0)
        return undefined;
    const milestone = milestones[index];
    if (!milestone)
        return undefined;
    if (milestone.status === "in_progress") {
        return { milestone, nextStatus: "completed" };
    }
    const previous = index > 0 ? milestones[index - 1] : undefined;
    if (milestone.status === "funded" ||
        (milestone.status === "not_started" &&
            previous?.status === "completed")) {
        return { milestone, nextStatus: "in_progress" };
    }
    return undefined;
}
function deploymentMilestoneTitle(milestone, profile) {
    const robotics = /robot|palletis|cobot/i.test(`${profile.title} ${profile.description} ${profile.category}`);
    if (robotics &&
        milestone.sequence === 1 &&
        /site assessment|scoping/i.test(milestone.title)) {
        return "Site Assessment / Scoping Visit";
    }
    return milestone.title;
}
function renderMilestoneUpdate(deployment) {
    if (deployment.status === "completed")
        return "";
    const transition = eligibleDeploymentTransition(deployment);
    if (!transition) {
        return `
      <div class="warning-strip milestone-update-unavailable">
        <strong>No delivery transition is currently eligible</strong>
        <span>Refresh the deployment record. Payment evidence and the previous milestone determine when work can start.</span>
      </div>
    `;
    }
    const completing = transition.nextStatus === "completed";
    return `
    <form
      id="deployment-milestone-form"
      class="milestone-update-form"
      data-milestone-id="${escapeHtml(transition.milestone.id)}"
      data-next-status="${transition.nextStatus}"
    >
      <div class="milestone-update-heading">
        <div>
          <p class="eyebrow">Buyer delivery update</p>
          <h3>${completing ? "Complete" : "Start"} ${escapeHtml(transition.milestone.title)}</h3>
        </div>
        <span class="status-chip is-${transition.milestone.status}">${escapeHtml(statusLabel(transition.milestone.status))}</span>
      </div>
      <label class="field">
        <span>Latest delivery update <b class="required-mark">Required</b></span>
        <textarea
          name="latestUpdate"
          rows="3"
          maxlength="500"
          required
          placeholder="${completing ? "Summarise the evidence or outcome accepted for this milestone." : "Describe the authorised work now starting and its immediate next step."}"
        >${escapeHtml(milestoneUpdateDraft)}</textarea>
        <small>Delivery updates do not fund milestones, alter payment evidence or secure suppliers.</small>
      </label>
      <button class="button button-primary" type="submit" ${loadState === "loading" ? "disabled" : ""}>
        ${completing ? "Complete milestone" : "Start milestone"}
      </button>
    </form>
  `;
}
function deploymentPaymentEvidence(engagement) {
    const explicitKind = engagement.paymentEvidenceProvider === "local_demo" ||
        engagement.paymentEvidenceSource === "local_demo"
        ? "local_demo"
        : engagement.paymentEvidenceProvider === "pinch" ||
            engagement.paymentEvidenceSource === "pinch_webhook" ||
            engagement.paymentEvidenceSource === "pinch_reconciliation"
            ? "pinch"
            : engagement.localDemoPaymentId ||
                engagement.paymentEvidenceAuthoritative === false
                ? "local_demo"
                : engagement.paymentEvidenceAuthoritative === true
                    ? "pinch"
                    : undefined;
    const legacyLocalDemoPaymentId = !explicitKind && engagement.pinchPaymentId?.startsWith("demo_")
        ? engagement.pinchPaymentId
        : undefined;
    const kind = explicitKind ?? (legacyLocalDemoPaymentId ? "local_demo" : undefined);
    const localDemo = kind === "local_demo";
    return {
        localDemo,
        evidenceId: localDemo
            ? engagement.localDemoPaymentId ?? legacyLocalDemoPaymentId
            : engagement.pinchPaymentId,
        provider: kind ?? engagement.paymentEvidenceProvider,
        source: localDemo ? "local_demo" : engagement.paymentEvidenceSource,
        authoritative: localDemo
            ? false
            : engagement.paymentEvidenceAuthoritative,
        legacyFallback: Boolean(legacyLocalDemoPaymentId)
    };
}
function paymentEvidenceSourceLabel(source) {
    if (source === "pinch_webhook") {
        return "Pinch webhook (signature verified)";
    }
    if (source === "pinch_reconciliation") {
        return "Pinch API reconciliation";
    }
    return "Pinch provider evidence";
}
function renderAuthoritativePaymentEvidence(engagement, amount) {
    const evidence = deploymentPaymentEvidence(engagement);
    if (!evidence.authoritative)
        return "";
    return `
    <div class="payment-evidence">
      <div class="payment-evidence-heading">
        <p class="eyebrow">Verified commitment</p>
        <h3>Payment evidence</h3>
      </div>
      <dl class="payment-summary payment-evidence-facts">
        ${fact("Source", paymentEvidenceSourceLabel(evidence.source))}
        ${fact("Payment ID", evidence.evidenceId ? shortId(evidence.evidenceId) : "Not recorded", !evidence.evidenceId)}
        ${fact("Amount", amount
        ? `${money(amount.amount, amount.currency)} ${amount.currency}`
        : "Not recorded", !amount)}
        ${fact("Recorded", formatTime(engagement.securedAt), !engagement.securedAt)}
      </dl>
    </div>
  `;
}
function nextFundableMilestone(deployment) {
    const nextIncomplete = [...deployment.milestones]
        .sort((left, right) => left.sequence - right.sequence)
        .find((milestone) => milestone.status !== "completed");
    if (!nextIncomplete ||
        nextIncomplete.sequence === 1 ||
        !["not_started", "awaiting_payment"].includes(nextIncomplete.status)) {
        return undefined;
    }
    return nextIncomplete;
}
function renderMilestonePaymentEvidence(milestone) {
    if (milestone.paymentStatus === "awaiting_payment") {
        return `
      <span class="milestone-evidence is-pending">
        Awaiting provider evidence. Browser return does not fund this milestone.
      </span>
    `;
    }
    if (milestone.paymentEvidenceProvider === "local_demo") {
        return `
      <span class="milestone-evidence is-local-demo">
        Local demo only / non-authoritative evidence${milestone.localDemoPaymentId ? ` / ${escapeHtml(shortId(milestone.localDemoPaymentId))}` : ""}
      </span>
    `;
    }
    if (milestone.paymentEvidenceAuthoritative) {
        return `
      <span class="milestone-evidence is-authoritative">
        Verified by ${escapeHtml(paymentEvidenceSourceLabel(milestone.paymentEvidenceSource))}${milestone.pinchPaymentId ? ` / ${escapeHtml(shortId(milestone.pinchPaymentId))}` : ""}
      </span>
    `;
    }
    return "";
}
function renderNextMilestoneFunding(deployment, profile) {
    const milestone = nextFundableMilestone(deployment);
    if (!milestone?.amount)
        return "";
    const hostedUrl = milestone.hostedCheckoutUrl;
    const presentation = paymentLinkPresentation(hostedUrl);
    const localDemo = hostedPaymentKind(hostedUrl) === "local_demo";
    return `
    <section class="milestone-funding-panel" aria-labelledby="next-milestone-funding-title">
      <div class="milestone-funding-heading">
        <div>
          <p class="eyebrow">Next commercial release</p>
          <h3 id="next-milestone-funding-title">${escapeHtml(deploymentMilestoneTitle(milestone, profile))}</h3>
          <p>Only this next incomplete milestone is eligible. Payment does not mark engineering work complete.</p>
        </div>
        <span class="status-chip is-${milestone.status}">${escapeHtml(statusLabel(milestone.status))}</span>
      </div>
      <dl class="payment-summary milestone-funding-facts">
        ${fact("Milestone amount", money(milestone.amount.amount, milestone.amount.currency))}
        ${fact("Veltact service fee", milestone.serviceFeeMinor === undefined
        ? "Disclosed before checkout"
        : money(milestone.serviceFeeMinor, milestone.amount.currency), milestone.serviceFeeMinor === undefined)}
      </dl>
      ${milestone.serviceFeeMinor === undefined
        ? ""
        : `<p class="service-fee-disclosure">Includes disclosed Veltact service fee: <strong>${money(milestone.serviceFeeMinor, milestone.amount.currency)}</strong>. This records the fee allocation; it does not claim settlement.</p>`}
      ${renderMilestonePaymentEvidence(milestone)}
      <div class="primary-action-row milestone-funding-action">
        <div>
          <strong>${hostedUrl ? presentation.actionTitle : "Fund next milestone"}</strong>
          <span>${hostedUrl ? presentation.actionCopy : "Veltact creates a milestone-specific hosted checkout with the amount, fee and milestone ID in its payment metadata."}</span>
        </div>
        ${hostedUrl
        ? `<a class="button button-primary" href="${safeHttpUrl(hostedUrl)}" target="_blank" rel="noreferrer">${escapeHtml(presentation.openLabel)}</a>`
        : `<button class="button button-primary" type="button" data-fund-milestone="${escapeHtml(milestone.id)}">Fund next milestone</button>`}
      </div>
      ${hostedUrl
        ? `
            <div class="secondary-actions milestone-payment-utilities">
              ${localDemoPaymentAvailable && localDemo
            ? `<button class="button button-quiet" type="button" data-demo-milestone-payment="${escapeHtml(milestone.id)}">Record local demo milestone evidence</button>`
            : ""}
              <button class="button button-quiet" type="button" data-cancel-milestone-payment="${escapeHtml(milestone.id)}">Cancel unpaid link</button>
            </div>
          `
        : ""}
    </section>
  `;
}
function renderDeployment(data) {
    const engagement = data.engagement;
    if (!engagement) {
        return renderUnavailable("Deployment unavailable", "No supplier engagement exists for this Need Profile.");
    }
    if (engagement.status !== "supplier_secured") {
        return renderPayment(data);
    }
    const deployment = data.deployment;
    const profile = requireNeedProfile(data);
    const supplier = supplierFor(data, engagement.supplierId);
    const paymentEvidence = deploymentPaymentEvidence(engagement);
    const projection = Boolean(deployment?.milestones.some((item) => item.id.includes("fixture")));
    const milestones = deployment
        ? [...deployment.milestones].sort((left, right) => left.sequence - right.sequence)
        : [];
    const currentMilestone = milestones.find((milestone) => milestone.id === deployment?.currentMilestoneId) ??
        milestones.find((milestone) => milestone.status !== "completed") ??
        milestones.at(-1);
    const nextMilestone = milestones.find((milestone) => milestone.id === deployment?.nextMilestoneId) ??
        milestones.find((milestone) => currentMilestone && milestone.sequence > currentMilestone.sequence);
    const currentMilestoneTitle = currentMilestone
        ? deploymentMilestoneTitle(currentMilestone, profile)
        : "Site Assessment / Scoping Visit";
    const nextMilestoneTitle = nextMilestone
        ? deploymentMilestoneTitle(nextMilestone, profile)
        : "To be confirmed";
    return `
    <section class="panel deployment-summary">
      <div class="deployment-heading">
        <div>
          <p class="eyebrow">Deploy / Active project</p>
          <h2>${escapeHtml(currentMilestoneTitle)}</h2>
          <p>${deployment?.latestUpdate ? escapeHtml(deployment.latestUpdate) : "Payment is confirmed, but the deployment API has not returned a delivery summary."}</p>
        </div>
        <div class="source-stack">
          <span class="secured-badge">Supplier secured</span>
          ${projection ? `<span class="source-badge is-fixture">Projection fallback</span>` : ""}
        </div>
      </div>
      <dl class="deployment-facts">
        ${fact("Supplier", supplierName(supplier, engagement.supplierId))}
        ${fact("Current milestone", currentMilestoneTitle, !currentMilestone)}
        ${fact("Next milestone", nextMilestoneTitle, !nextMilestone)}
      </dl>
      ${renderAuthoritativePaymentEvidence(engagement, deployment?.milestones[0]?.amount)}
      ${paymentEvidence.localDemo
        ? `
            <div class="payment-boundary">
              <strong>Development evidence</strong>
              <span>This secured state was created by the local demo route${paymentEvidence.evidenceId ? ` using evidence ${escapeHtml(paymentEvidence.evidenceId)}` : ""}. It is non-authoritative and is not a Pinch webhook confirmation.${paymentEvidence.legacyFallback ? " This record uses the legacy demo-ID fallback." : ""}</span>
            </div>
          `
        : ""}
      ${deployment
        ? `
            <div class="project-current">
              <div>
                <span>Current stage</span>
                <strong>${escapeHtml(currentMilestoneTitle)}</strong>
                <small>${escapeHtml(currentMilestone ? statusLabel(currentMilestone.status) : "Awaiting deployment record")}</small>
              </div>
              <div>
                <span>Engineering progress</span>
                <strong>${deployment.progressPercentage}%</strong>
                <small>Payment does not advance engineering work</small>
              </div>
            </div>
            <div class="progress-summary">
              <div>
                <span>Engineering progress</span>
                <strong>${deployment.progressPercentage}%</strong>
              </div>
              <div class="progress-track" aria-label="Delivery progress ${deployment.progressPercentage}%">
                <span style="width: ${deployment.progressPercentage}%"></span>
              </div>
            </div>
            <ol class="milestone-list">
              ${milestones
            .map((milestone) => `
                    <li class="is-${milestone.status}">
                      <span class="milestone-index">${milestone.sequence}</span>
                      <span>
                        <strong>${escapeHtml(deploymentMilestoneTitle(milestone, profile))}</strong>
                        <small>${escapeHtml(statusLabel(milestone.status))}${milestone.amount ? ` / ${escapeHtml(money(milestone.amount.amount, milestone.amount.currency))}` : ""}${milestone.latestUpdate ? ` / ${escapeHtml(milestone.latestUpdate)}` : ""}</small>
                        ${renderMilestonePaymentEvidence(milestone)}
                      </span>
                      <span class="milestone-progress">${milestone.progressPercentage}%</span>
                    </li>
                  `)
            .join("")}
            </ol>
            ${renderNextMilestoneFunding(deployment, profile)}
            ${projection
            ? `
                  <div class="warning-strip milestone-update-unavailable">
                    <strong>Projected milestones are read-only</strong>
                    <span>The deployment API must return an authoritative milestone record before the buyer can post delivery updates.</span>
                  </div>
                `
            : `
                  <details class="project-update">
                    <summary>Record a delivery milestone update</summary>
                    ${renderMilestoneUpdate(deployment)}
                  </details>
                `}
          `
        : `
            <div class="warning-strip">
              <strong>Delivery projection unavailable</strong>
              <span>Supplier secured is authoritative. Engineering progress is not inferred from payment.</span>
            </div>
          `}
      <div class="primary-action-row">
        <div>
          <strong>${deployment?.status === "completed" ? "Delivery record complete" : `Keep ${escapeHtml(currentMilestoneTitle)} status current`}</strong>
          <span>Refreshes authoritative payment and deployment records. Payment never marks engineering work complete.</span>
        </div>
        ${deployment?.status === "completed"
        ? `<button class="button button-primary" type="button" data-start-new>Start new requirement</button>`
        : `
              <div class="outcome-actions">
                <button class="button button-secondary" type="button" data-refresh-deployment>Refresh deployment</button>
                <button class="button button-quiet" type="button" data-start-new>Start new requirement</button>
              </div>
            `}
      </div>
    </section>
    ${renderSpeedReceipt(data.speedReceipt)}
  `;
}
function renderRestoreError() {
    return `
    <section class="panel unavailable-panel">
      <p class="eyebrow">Workspace restore failed</p>
      <h2>This buyer workspace cannot be opened</h2>
      <p>${escapeHtml(errorMessage || "The backend did not return the requested workspace.")}</p>
      <p class="quiet-note">The Need Profile ID remains in the URL, but no private token is displayed there.</p>
      <button class="button button-primary" type="button" data-start-new>Start new requirement</button>
    </section>
  `;
}
function renderUnavailable(title, body, actionLabel, action) {
    return `
    <section class="panel unavailable-panel">
      <p class="eyebrow">Unavailable</p>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(body)}</p>
      ${actionLabel && action
        ? `<button class="button button-primary" type="button" data-${action}>${escapeHtml(actionLabel)}</button>`
        : ""}
    </section>
  `;
}
function renderLoadingSkeleton() {
    return `
    <section class="panel loading-skeleton" aria-label="Restoring buyer workspace">
      <span></span><span></span><span></span><span></span>
    </section>
  `;
}
function bindEvents() {
    document
        .querySelectorAll("[data-journey-phase]")
        .forEach((button) => {
        button.addEventListener("click", () => {
            const phase = button.dataset.journeyPhase;
            if (phase === "find" ||
                phase === "connect" ||
                phase === "deploy") {
                navigateToJourneyPhase(phase);
            }
        });
    });
    const requirementForm = document.querySelector("#requirement-form");
    requirementForm?.addEventListener("input", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) &&
            !(target instanceof HTMLTextAreaElement)) {
            return;
        }
        if (target.type === "file")
            return;
        syncIntakeDraft(requirementForm);
        intakeRevision += 1;
        persistPreNeedIntakeDraft();
        updateIntakePrimaryActionState(requirementForm);
    });
    requirementForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        syncIntakeDraft(requirementForm);
        persistPreNeedIntakeDraft();
        if (intakeMode === "ai" && !aiIntakeResult) {
            void structureRequirement(requirementForm, true);
            return;
        }
        void analyseRequirement();
    });
    const milestoneForm = document.querySelector("#deployment-milestone-form");
    milestoneForm
        ?.querySelector("textarea[name='latestUpdate']")
        ?.addEventListener("input", (event) => {
        milestoneUpdateDraft = event.currentTarget.value;
    });
    milestoneForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!milestoneForm.reportValidity())
            return;
        void updateDeploymentMilestone(milestoneForm);
    });
    document.querySelectorAll("[data-demo]").forEach((button) => {
        button.addEventListener("click", () => {
            if (!demoControlsAvailable)
                return;
            const robotics = button.dataset.demo === "robotics";
            loadDemo(robotics ? roboticsDemoInput : plcDemoInput, robotics);
        });
    });
    document.querySelectorAll("[data-priority]").forEach((button) => {
        button.addEventListener("click", () => {
            if (requirementForm)
                syncIntakeDraft(requirementForm);
            intakeRevision += 1;
            const next = button.dataset.priority;
            if (priorities.has(next))
                priority = next;
            persistPreNeedIntakeDraft();
            render();
        });
    });
    document
        .querySelector("input[name='pdfEvidence']")
        ?.addEventListener("change", (event) => {
        void addEvidenceFromInput(event.currentTarget, "pdf");
    });
    document
        .querySelector("input[name='photoEvidence']")
        ?.addEventListener("change", (event) => {
        void addEvidenceFromInput(event.currentTarget, "photo");
    });
    document
        .querySelectorAll("[data-remove-evidence]")
        .forEach((button) => {
        button.addEventListener("click", () => {
            if (requirementForm)
                syncIntakeDraft(requirementForm);
            const index = Number(button.dataset.removeEvidence);
            intakeEvidence = intakeEvidence.filter((_, itemIndex) => itemIndex !== index);
            intakeRevision += 1;
            aiIntakeResult = undefined;
            persistPreNeedIntakeDraft();
            render();
        });
    });
    document
        .querySelectorAll("input[name='solution-pathway']")
        .forEach((radio) => {
        radio.addEventListener("change", () => {
            selectedApproachId = radio.value;
            persistContext();
            render();
        });
    });
    document
        .querySelectorAll("[data-candidate-id]")
        .forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
            const supplierId = checkbox.dataset.candidateId;
            if (!supplierId)
                return;
            if (checkbox.checked) {
                selectedCandidateIds.add(supplierId);
            }
            else {
                selectedCandidateIds.delete(supplierId);
            }
            persistContext();
            render();
        });
    });
    document
        .querySelectorAll("input[name='outreach-choice']")
        .forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
            const next = checkbox.value;
            if (!outreachChoiceValues.has(next))
                return;
            if (checkbox.checked) {
                selectedOutreachChoices.add(next);
            }
            else {
                selectedOutreachChoices.delete(next);
            }
            persistContext();
            render();
        });
    });
    bindClick("[data-retry-research]", retryResearch);
    bindClick("[data-download-report]", downloadReport);
    bindClick("[data-find-suppliers]", findSpecialist);
    bindClick("[data-refresh-workspace]", refreshWorkspace);
    bindClick("[data-open-outreach]", () => {
        outreachPanelOpen = true;
        persistContext();
        render();
    });
    bindClick("[data-send-outreach]", sendOutreach);
    bindClick("[data-compare]", openSupplierComparison);
    bindClick("[data-compare-single]", openSupplierComparison);
    bindClick("[data-back-outreach]", () => {
        view = "outreach";
        persistContext();
        render();
        scrollBuyerWorkspaceToTop();
    });
    bindClick("[data-select-supplier]", selectSupplier);
    bindClick("[data-create-payment]", createPayment);
    bindClick("[data-refresh-payment]", refreshPayment);
    bindClick("[data-demo-payment]", completeDemoPayment);
    bindClick("[data-refresh-deployment]", refreshDeployment);
    bindClick("[data-start-new]", startNewRequirement);
    bindClick("[data-open-registry]", openSupplierRegistry);
    bindClick("[data-close-registry]", closeSupplierRegistry);
    bindClick("[data-print-receipt]", () => window.print());
    document
        .querySelectorAll("[data-fund-milestone]")
        .forEach((button) => {
        button.addEventListener("click", () => {
            const milestoneId = button.dataset.fundMilestone;
            if (milestoneId)
                void createMilestonePayment(milestoneId);
        });
    });
    document
        .querySelectorAll("[data-demo-milestone-payment]")
        .forEach((button) => {
        button.addEventListener("click", () => {
            const milestoneId = button.dataset.demoMilestonePayment;
            if (milestoneId)
                void completeDemoMilestonePayment(milestoneId);
        });
    });
    document
        .querySelectorAll("[data-cancel-milestone-payment]")
        .forEach((button) => {
        button.addEventListener("click", () => {
            const milestoneId = button.dataset.cancelMilestonePayment;
            if (milestoneId)
                void cancelMilestonePayment(milestoneId);
        });
    });
    document
        .querySelectorAll("input[name='supplier-response']")
        .forEach((radio) => {
        radio.addEventListener("change", () => {
            selectedResponseId = radio.value;
            persistContext();
            render();
        });
    });
    document
        .querySelectorAll("[data-copy-link]")
        .forEach((button) => {
        button.addEventListener("click", async () => {
            const url = button.dataset.copyLink;
            if (!url)
                return;
            button.disabled = true;
            button.textContent = "Copying…";
            try {
                const method = await copyText(url);
                showLiveMessage(method === "legacy"
                    ? "Secure supplier link copied using the browser fallback."
                    : "Secure supplier link copied.");
            }
            catch (error) {
                loadState = "error";
                errorMessage = errorText(error);
                render();
            }
        });
    });
}
function openSupplierComparison() {
    if (!workspace || !canReviewSupplierComparison(workspace))
        return;
    view = "compare";
    persistContext();
    render();
}
async function structureRequirement(form, analyseWhenComplete = false) {
    syncIntakeDraft(form);
    const rawRequirementError = validateIntakeRawRequirement(intakeDraft.description);
    if (rawRequirementError) {
        loadState = "error";
        errorMessage = rawRequirementError;
        persistPreNeedIntakeDraft();
        render();
        return;
    }
    const requestRevision = intakeRevision;
    const requestMode = intakeMode;
    const requestId = ++activeIntakeRequestId;
    const input = {
        rawRequirement: intakeDraft.description,
        evidence: intakeEvidence
    };
    loadState = "loading";
    loadingLabel = "Structuring supplier requirement";
    errorMessage = "";
    liveMessage = "";
    render();
    let continueToAnalysis = false;
    try {
        const outcome = await structureIntakeWithFallback(aiIntakeService, localAiIntakeService, input, AI_INTAKE_TIMEOUT_MS);
        if (requestId !== activeIntakeRequestId ||
            !isCurrentIntakeRequest(requestRevision, intakeRevision, requestMode, intakeMode)) {
            if (requestId === activeIntakeRequestId) {
                loadState = "idle";
                liveMessage =
                    "Your newer intake edits were kept. Structure the updated requirement when ready.";
                render();
            }
            return;
        }
        aiIntakeResult = outcome.result;
        intakeSourceMode = outcome.sourceMode;
        applyStructuredResult(outcome.result);
        persistPreNeedIntakeDraft();
        loadState = "success";
        continueToAnalysis =
            analyseWhenComplete && !validateDraft(intakeDraft);
        liveMessage = outcome.fallbackReason
            ? localFallbackMessage(outcome.fallbackReason)
            : intakeSourceMode === "live"
                ? "OpenAI returned a structured draft. Review every field."
                : "Local adapter returned a structured draft. Review every field.";
    }
    catch (error) {
        if (requestId !== activeIntakeRequestId)
            return;
        if (!isCurrentIntakeRequest(requestRevision, intakeRevision, requestMode, intakeMode)) {
            loadState = "idle";
            liveMessage =
                "Your newer intake edits were kept. Structure the updated requirement when ready.";
        }
        else {
            loadState = "error";
            errorMessage = errorText(error);
        }
    }
    if (requestId !== activeIntakeRequestId)
        return;
    if (continueToAnalysis) {
        await analyseRequirement();
        return;
    }
    render();
}
class IntakeTimeoutError extends Error {
    constructor() {
        super("OpenAI intake timed out.");
    }
}
async function structureIntakeWithFallback(primary, fallback, input, timeoutMs) {
    try {
        const result = await withTimeout(primary.structureRequirement(input), timeoutMs);
        return {
            result,
            sourceMode: primary.sourceMode()
        };
    }
    catch (error) {
        const fallbackReason = intakeFallbackReason(error);
        if (!fallbackReason)
            throw error;
        return {
            result: await fallback.structureRequirement(input),
            sourceMode: fallback.sourceMode(),
            fallbackReason
        };
    }
}
function intakeFallbackReason(error) {
    if (error instanceof IntakeTimeoutError)
        return "slow";
    const message = error instanceof Error
        ? error.message
        : typeof error === "object" &&
            error !== null &&
            "message" in error
            ? String(error.message)
            : String(error);
    return /OpenAI intake|AI intake service returned|structured output|unexpected token|network|failed to fetch|fetch failed/i.test(message)
        ? "unavailable"
        : undefined;
}
function withTimeout(promise, timeoutMs) {
    let timeoutHandle;
    const timeout = new Promise((_, reject) => {
        timeoutHandle = window.setTimeout(() => reject(new IntakeTimeoutError()), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => {
        if (timeoutHandle !== undefined)
            window.clearTimeout(timeoutHandle);
    });
}
function isCurrentIntakeRequest(requestRevision, currentRevision, requestMode, currentMode) {
    return (requestRevision === currentRevision &&
        requestMode === "ai" &&
        currentMode === "ai");
}
function localFallbackMessage(reason) {
    const cause = reason === "slow" ? "OpenAI took too long" : "OpenAI was unavailable";
    return `${cause}. A local structured draft is ready; attached PDF/photo content remains unprocessed and every field requires buyer review.`;
}
async function analyseRequirement() {
    const validationError = validateDraft(intakeDraft);
    if (validationError) {
        loadState = "error";
        errorMessage = validationError;
        render();
        return;
    }
    await runAction("Creating Need Profile and analysing options", async () => {
        const created = await service.createNeedProfile(intakeDraft, priority, intakeEvidenceSummaries());
        workspace = created.workspace;
        const needProfile = requireNeedProfile(workspace);
        if (created.buyerAccessToken) {
            saveBuyerToken(needProfile.id, created.buyerAccessToken);
            service.setBuyerAccessToken(needProfile.id, created.buyerAccessToken);
        }
        setNeedProfileUrl(needProfile.id);
        render();
        await new Promise((resolve) => {
            window.setTimeout(resolve, 80);
        });
        workspace = await service.researchRequirement(workspace);
        selectedApproachId = resolveSelectedApproachId(workspace.researchResult, selectedApproachId);
        view = "plan";
        persistContext();
        liveMessage = "Need Profile created. Review the cited plan before continuing.";
    });
}
async function retryResearch() {
    if (!workspace)
        return;
    await runAction("Analysing requirement", async () => {
        workspace = await service.researchRequirement(workspace);
        selectedApproachId = resolveSelectedApproachId(workspace.researchResult, selectedApproachId);
        view = "plan";
        persistContext();
    });
}
async function downloadReport() {
    if (!workspace || !selectedApproachId)
        return;
    await runAction("Preparing Need Profile report", async () => {
        const report = await service.downloadNeedReport(workspace, selectedApproachId);
        const objectUrl = URL.createObjectURL(report.blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = report.fileName;
        anchor.hidden = true;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        liveMessage = "Need Profile report downloaded.";
    });
}
async function findSpecialist() {
    if (!workspace || !selectedApproachId)
        return;
    await runAction("Finding relevant industrial specialists", async () => {
        let next = await service.recordSolutionDecision(workspace, "outsource", selectedApproachId);
        next = await service.discoverSuppliers(next);
        workspace = next;
        selectedCandidateIds = new Set(supplierCandidates(next).map((candidate) => candidate.supplierId));
        candidateSelectionInitialised = true;
        selectedOutreachChoices = new Set();
        outreachPanelOpen = false;
        view = "candidates";
        persistContext();
        liveMessage = "Supplier candidates ready for buyer review.";
    });
}
async function sendOutreach() {
    if (!workspace ||
        selectedCandidateIds.size === 0 ||
        selectedOutreachChoices.size === 0) {
        return;
    }
    const candidates = supplierCandidates(workspace);
    if ([...selectedOutreachChoices].some((choice) => !outreachChoiceAvailable(workspace, candidates, choice))) {
        loadState = "error";
        errorMessage =
            "Remove unavailable outreach channels before sending supplier invitations.";
        render();
        return;
    }
    const deliveryChannels = [];
    if (selectedOutreachChoices.has("email"))
        deliveryChannels.push("email");
    if (selectedOutreachChoices.has("sms"))
        deliveryChannels.push("sms");
    const action = outreachAction(selectedOutreachChoices, selectedCandidateIds.size, []);
    await runAction(action.loadingLabel, async () => {
        workspace = await service.sendSupplierOutreach(workspace, [...selectedCandidateIds], deliveryChannels);
        view = "outreach";
        persistContext();
        const externalChannels = deliveryChannels.map((channel) => channel === "sms" ? "SMS" : "Email");
        liveMessage = externalChannels.length
            ? `${externalChannels.join(" and ")} delivery requested. Secure supplier links are ready and backend status remains authoritative.`
            : "Secure supplier links are ready for manual sharing. No external delivery was requested.";
    });
}
async function refreshWorkspace() {
    if (!workspace)
        return;
    await runAction("Refreshing supplier activity", async () => {
        workspace = await service.refreshWorkspace(workspace);
        selectedResponseId =
            workspace.engagement?.supplierResponseId || selectedResponseId;
        if (workspace.engagement) {
            view = workspace.engagement.hostedCheckoutUrl ? "payment" : "selected";
        }
        else if (submittedResponses(workspace).length >= 2 &&
            view !== "candidates") {
            view = "compare";
        }
        persistContext();
    });
}
async function selectSupplier() {
    if (!workspace || !selectedResponseId)
        return;
    const response = submittedResponses(workspace).find((item) => item.id === selectedResponseId);
    if (!response || !isSelectableSupplierResponse(response)) {
        selectedResponseId = "";
        loadState = "error";
        errorMessage =
            "Select a supplier response with a positive indicative price.";
        persistContext();
        render();
        return;
    }
    await runAction("Creating selected supplier engagement", async () => {
        workspace = await service.selectSupplier(workspace, selectedResponseId);
        view = "selected";
        persistContext();
        liveMessage =
            "Supplier selected. Payment is still required to secure the engagement.";
    });
}
async function createPayment() {
    if (!workspace)
        return;
    await runAction("Creating hosted payment link", async () => {
        workspace = await service.createPaymentLink(workspace);
        view = "payment";
        persistContext();
        liveMessage = paymentLinkPresentation(workspace.engagement?.hostedCheckoutUrl).readyMessage;
    });
}
async function refreshPayment() {
    if (!workspace?.engagement)
        return;
    await runAction("Checking authoritative payment status", async () => {
        workspace = await service.refreshEngagement(workspace);
        view =
            workspace.engagement?.status === "supplier_secured"
                ? "deployment"
                : "payment";
        persistContext();
        liveMessage =
            view === "deployment"
                ? "Payment confirmed. Supplier secured."
                : "Payment is still awaiting confirmation.";
    });
}
async function completeDemoPayment() {
    if (!workspace?.engagement || !localDemoPaymentAvailable)
        return;
    await runAction("Recording local demo payment evidence", async () => {
        workspace = await service.completeDemoPayment(workspace);
        view = "deployment";
        persistContext();
        liveMessage =
            "Local demo payment recorded as non-authoritative development evidence.";
    });
}
async function createMilestonePayment(milestoneId) {
    if (!workspace?.engagement || !workspace.deployment)
        return;
    await runAction("Creating milestone payment link", async () => {
        workspace = await service.createMilestonePaymentLink(workspace, milestoneId);
        view = "deployment";
        persistContext();
        liveMessage = "Milestone payment link is ready with disclosed fee metadata.";
    });
}
async function completeDemoMilestonePayment(milestoneId) {
    if (!workspace?.engagement ||
        !workspace.deployment ||
        !localDemoPaymentAvailable) {
        return;
    }
    await runAction("Recording local demo milestone evidence", async () => {
        workspace = await service.completeDemoMilestonePayment(workspace, milestoneId);
        view = "deployment";
        persistContext();
        liveMessage =
            "Milestone funded with explicitly non-authoritative local demo evidence.";
    });
}
async function cancelMilestonePayment(milestoneId) {
    if (!workspace?.engagement || !workspace.deployment)
        return;
    await runAction("Cancelling unpaid milestone link", async () => {
        workspace = await service.cancelMilestonePaymentLink(workspace, milestoneId);
        view = "deployment";
        persistContext();
        liveMessage = "Unpaid milestone payment link cancelled.";
    });
}
async function refreshDeployment() {
    if (!workspace?.engagement)
        return;
    await runAction("Refreshing deployment summary", async () => {
        workspace = await service.refreshEngagement(workspace);
        view =
            workspace.engagement?.status === "supplier_secured"
                ? "deployment"
                : "payment";
        persistContext();
    });
}
async function updateDeploymentMilestone(form) {
    if (!workspace?.engagement || !workspace.deployment)
        return;
    const milestoneId = form.dataset.milestoneId;
    const nextStatus = form.dataset.nextStatus;
    const latestUpdate = formValue(new FormData(form), "latestUpdate");
    if (!milestoneId ||
        !["in_progress", "completed"].includes(nextStatus ?? "") ||
        !latestUpdate) {
        loadState = "error";
        errorMessage = "A milestone and latest delivery update are required.";
        render();
        return;
    }
    const status = nextStatus;
    await runAction(status === "completed"
        ? "Completing delivery milestone"
        : "Starting delivery milestone", async () => {
        workspace = await service.updateDeploymentMilestone(workspace, milestoneId, status, latestUpdate);
        milestoneUpdateDraft = "";
        view = "deployment";
        persistContext();
        liveMessage =
            status === "completed"
                ? "Delivery milestone completed. Payment evidence was not changed."
                : "Delivery milestone started. Payment evidence was not changed.";
    });
}
async function runAction(label, action) {
    const startingView = view;
    loadState = "loading";
    loadingLabel = label;
    errorMessage = "";
    liveMessage = "";
    render();
    try {
        await action();
        loadState = "success";
    }
    catch (error) {
        loadState = "error";
        errorMessage = errorText(error);
    }
    render();
    if (view !== startingView)
        scrollBuyerWorkspaceToTop();
}
async function openSupplierRegistry() {
    const needProfileId = workspace?.needProfile?.id;
    if (!needProfileId)
        return;
    if (view !== "registry") {
        registryReturnView = view;
    }
    view = "registry";
    await runAction("Loading your supplier bench", async () => {
        supplierRegistry = await service.loadSupplierRegistry(needProfileId);
        persistContext();
    });
}
function closeSupplierRegistry() {
    if (!workspace)
        return;
    view = resolveLegalBuyerView(workspace, registryReturnView);
    persistContext();
    render();
}
function configurePolling() {
    const needProfileId = workspace?.needProfile?.id;
    const shouldPoll = Boolean(needProfileId) &&
        (view === "outreach" || view === "payment" || view === "deployment");
    const nextKey = shouldPoll ? `${needProfileId}:${view}` : "";
    if (nextKey === pollKey)
        return;
    if (pollHandle !== undefined) {
        window.clearInterval(pollHandle);
        pollHandle = undefined;
    }
    pollKey = nextKey;
    if (!shouldPoll)
        return;
    pollHandle = window.setInterval(() => {
        void pollWorkspace();
    }, 4500);
}
function configureRealtime() {
    const needProfileId = workspace?.needProfile?.id;
    if (!needProfileId) {
        leaveRealtimeNeed();
        return;
    }
    if (!realtimeSocket) {
        void initialiseRealtimeSocket(needProfileId);
        return;
    }
    if (joinedNeedProfileId === needProfileId)
        return;
    if (joinedNeedProfileId) {
        realtimeSocket.emit(rapidMatchSocketEvent.leaveNeedProfile, {
            needProfileId: joinedNeedProfileId
        });
    }
    realtimeSocket.emit(rapidMatchSocketEvent.joinNeedProfile, {
        needProfileId,
        buyerAccessToken: service.buyerAccessTokenForNeed(needProfileId)
    });
    joinedNeedProfileId = needProfileId;
}
async function initialiseRealtimeSocket(needProfileId) {
    if (realtimeClientLoading) {
        await realtimeClientLoading;
    }
    else if (!socketWindow.io) {
        realtimeClientLoading = loadRealtimeClient();
        await realtimeClientLoading;
    }
    if (!socketWindow.io)
        return;
    if (realtimeSocket) {
        configureRealtime();
        return;
    }
    realtimeSocket = socketWindow.io(realtimeOrigin, {
        transports: ["websocket"],
        reconnection: true
    });
    realtimeSocket.on(rapidMatchSocketEvent.invitationSent, (payload) => {
        if (payload.needProfileId !== workspace?.needProfile?.id)
            return;
        const message = payload.supplierInvitation?.status === "opened"
            ? "Live update: supplier opened the opportunity link."
            : "Live supplier invitation status updated.";
        void refreshRealtimeState(message);
    });
    realtimeSocket.on(rapidMatchSocketEvent.outreachDeliveryUpdated, (payload) => {
        if (payload.needProfileId !== workspace?.needProfile?.id)
            return;
        const channel = payload.outreachDelivery?.channel?.toUpperCase() ?? "Outreach";
        const status = payload.outreachDelivery?.deliveryStatus?.replaceAll("_", " ") ??
            "updated";
        void refreshRealtimeState(`Live update: ${channel} delivery ${status}.`);
    });
    realtimeSocket.on(rapidMatchSocketEvent.supplierResponseSubmitted, (payload) => {
        if (payload.needProfileId !== workspace?.needProfile?.id)
            return;
        void refreshRealtimeState(payload.supplierResponse?.decision === "cannot_help"
            ? "Live update: supplier declined this opportunity."
            : "Live update: supplier submitted a response.");
    });
    realtimeSocket.on(rapidMatchSocketEvent.agentActivityUpdated, (payload) => {
        const currentWorkspace = workspace;
        const activityEvent = payload.agentActivityEvent;
        if (!currentWorkspace ||
            payload.needProfileId !== currentWorkspace.needProfile?.id ||
            !activityEvent) {
            return;
        }
        const events = currentWorkspace.agentActivityEvents.filter((event) => event.id !== activityEvent.id);
        workspace = {
            ...currentWorkspace,
            agentActivityEvents: [
                ...events,
                activityEvent
            ].sort((left, right) => left.sequence - right.sequence)
        };
        render();
    });
    realtimeSocket.on(rapidMatchSocketEvent.paymentStatusUpdated, (payload) => {
        if (payload.needProfileId === workspace?.needProfile?.id) {
            void refreshRealtimeState("Live payment status update received.");
        }
    });
    realtimeSocket.on(rapidMatchSocketEvent.engagementSecured, (payload) => {
        if (payload.needProfileId === workspace?.needProfile?.id) {
            void refreshRealtimeState("Live update: supplier secured.");
        }
    });
    realtimeSocket.on(rapidMatchSocketEvent.deploymentUpdated, (payload) => {
        if (payload.needProfileId === workspace?.needProfile?.id) {
            void refreshRealtimeState("Live delivery milestone update received.");
        }
    });
    if (workspace?.needProfile?.id === needProfileId) {
        configureRealtime();
    }
}
async function loadRealtimeClient() {
    await new Promise((resolve, reject) => {
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
    if (!realtimeSocket || !joinedNeedProfileId)
        return;
    realtimeSocket.emit(rapidMatchSocketEvent.leaveNeedProfile, {
        needProfileId: joinedNeedProfileId
    });
    joinedNeedProfileId = "";
}
function milestoneUpdateFormHasFocus() {
    return (document.activeElement instanceof HTMLElement &&
        Boolean(document.activeElement.closest("#deployment-milestone-form")));
}
async function refreshRealtimeState(message) {
    if (!workspace || isPolling || loadState === "loading")
        return;
    const activeWorkspace = workspace;
    const activeEpoch = workspaceEpoch;
    isPolling = true;
    try {
        const refreshedWorkspace = activeWorkspace.engagement
            ? await service.refreshEngagement(activeWorkspace)
            : await service.refreshWorkspace(activeWorkspace);
        if (!isCurrentWorkspaceRefresh(activeWorkspace, activeEpoch, workspace, workspaceEpoch)) {
            return;
        }
        workspace = refreshedWorkspace;
        const startingView = view;
        selectedResponseId =
            workspace.engagement?.supplierResponseId || selectedResponseId;
        if (workspace.engagement?.status === "supplier_secured") {
            view = "deployment";
        }
        liveMessage = message;
        persistContext();
        if (!milestoneUpdateFormHasFocus()) {
            render();
            if (view !== startingView)
                scrollBuyerWorkspaceToTop();
        }
    }
    catch {
        // Scheduled polling and explicit refresh remain available if realtime fails.
    }
    finally {
        isPolling = false;
    }
}
async function pollWorkspace() {
    if (!workspace || isPolling || loadState === "loading")
        return;
    const activeWorkspace = workspace;
    const activeEpoch = workspaceEpoch;
    isPolling = true;
    try {
        const previousResponses = submittedResponses(activeWorkspace).length;
        const previousStatus = activeWorkspace.engagement?.status;
        const refreshedWorkspace = activeWorkspace.engagement
            ? await service.refreshEngagement(activeWorkspace)
            : await service.refreshWorkspace(activeWorkspace);
        if (!isCurrentWorkspaceRefresh(activeWorkspace, activeEpoch, workspace, workspaceEpoch)) {
            return;
        }
        const presentationChanged = buyerWorkspacePresentationSignature(activeWorkspace) !==
            buyerWorkspacePresentationSignature(refreshedWorkspace);
        workspace = refreshedWorkspace;
        const startingView = view;
        const nextResponses = submittedResponses(workspace).length;
        if (workspace.engagement?.status === "supplier_secured") {
            view = "deployment";
        }
        if (nextResponses > previousResponses) {
            showLiveMessage(`${nextResponses} supplier response${nextResponses === 1 ? "" : "s"} received.`);
        }
        else if (previousStatus !== "supplier_secured" &&
            workspace.engagement?.status === "supplier_secured") {
            showLiveMessage("Payment confirmed. Supplier secured.");
        }
        else {
            persistContext();
            if (presentationChanged && !milestoneUpdateFormHasFocus())
                render();
        }
        if (view !== startingView)
            scrollBuyerWorkspaceToTop();
    }
    catch {
        // Polling stays silent. Explicit refresh surfaces actionable API errors.
    }
    finally {
        isPolling = false;
    }
}
function captureRenderInteractionState(root) {
    const activeElement = document.activeElement instanceof HTMLElement &&
        root.contains(document.activeElement)
        ? document.activeElement
        : undefined;
    const focusedPath = activeElement
        ? elementPathWithin(root, activeElement)
        : undefined;
    const textControl = activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement
        ? activeElement
        : undefined;
    const selectableTextControl = textControl instanceof HTMLTextAreaElement ||
        (textControl instanceof HTMLInputElement &&
            textControl.selectionStart !== null)
        ? textControl
        : undefined;
    return {
        view,
        ...(focusedPath
            ? {
                focusedPath,
                focusedSignature: renderElementSignature(activeElement)
            }
            : {}),
        ...(selectableTextControl
            ? {
                selectionStart: selectableTextControl.selectionStart,
                selectionEnd: selectableTextControl.selectionEnd
            }
            : {}),
        openDetailsPaths: Array.from(root.querySelectorAll("details[open]"))
            .map((details) => elementPathWithin(root, details))
            .filter((path) => Boolean(path)),
        scrollX: window.scrollX,
        scrollY: window.scrollY
    };
}
function restoreRenderInteractionState(root, state) {
    for (const path of state.openDetailsPaths) {
        const details = elementAtPath(root, path);
        if (details instanceof HTMLDetailsElement) {
            details.open = true;
        }
    }
    const focusTarget = state.focusedPath
        ? elementAtPath(root, state.focusedPath)
        : undefined;
    if (focusTarget instanceof HTMLElement &&
        renderElementSignature(focusTarget) === state.focusedSignature) {
        focusTarget.focus({ preventScroll: true });
        if ((focusTarget instanceof HTMLInputElement ||
            focusTarget instanceof HTMLTextAreaElement) &&
            state.selectionStart !== undefined &&
            state.selectionEnd !== undefined) {
            focusTarget.setSelectionRange(state.selectionStart, state.selectionEnd);
        }
    }
    window.scrollTo({
        top: state.scrollY,
        left: state.scrollX,
        behavior: "auto"
    });
}
function elementPathWithin(root, element) {
    const path = [];
    let current = element;
    while (current && current !== root) {
        const parent = current.parentElement;
        if (!parent)
            return undefined;
        path.unshift(Array.from(parent.children).indexOf(current));
        current = parent;
    }
    return current === root ? path : undefined;
}
function elementAtPath(root, path) {
    let current = root;
    for (const index of path) {
        const child = current.children[index];
        if (!child)
            return undefined;
        current = child;
    }
    return current;
}
function renderElementSignature(element) {
    if (!element)
        return "";
    const stableData = Array.from(element.attributes)
        .filter((attribute) => attribute.name.startsWith("data-"))
        .map((attribute) => `${attribute.name}=${attribute.value}`)
        .sort()
        .join("&");
    return [
        element.tagName,
        element.id,
        element.getAttribute("name") ?? "",
        element.getAttribute("value") ?? "",
        element.getAttribute("aria-label") ?? "",
        stableData
    ].join("|");
}
function isCurrentWorkspaceRefresh(activeWorkspace, activeEpoch, currentWorkspace, currentEpoch) {
    return (activeEpoch === currentEpoch &&
        activeWorkspace === currentWorkspace);
}
function loadDemo(input, robotics) {
    intakeRevision += 1;
    intakeDraft = cloneInput(input);
    priority = robotics ? "technical_fit" : "speed";
    intakeMode = "ai";
    aiIntakeResult = undefined;
    intakeSourceMode = "fixture";
    selectedApproachId = "";
    selectedCandidateIds = new Set();
    candidateSelectionInitialised = false;
    selectedOutreachChoices = new Set();
    outreachPanelOpen = false;
    intakeEvidence = [
        {
            kind: "written",
            name: robotics
                ? "Demo integration brief"
                : "Demo PLC alarm notes",
            mimeType: "text/plain",
            extractedText: robotics
                ? "Existing Siemens controls and conveyor interfaces must remain in service during staged commissioning."
                : "Operator notes: intermittent PLC alarm, conveyor stopped, no authorised program changes made."
        }
    ];
    loadState = "idle";
    errorMessage = "";
    liveMessage = robotics
        ? "Robotic integration demo loaded into the same intake."
        : "PLC demo loaded into the same intake.";
    persistPreNeedIntakeDraft();
    render();
}
async function addEvidenceFromInput(input, fallbackKind) {
    const form = input.form;
    if (form) {
        syncIntakeDraft(form);
        persistPreNeedIntakeDraft();
    }
    const file = input.files?.[0];
    if (!file)
        return;
    intakeRevision += 1;
    loadState = "loading";
    loadingLabel = `Reading ${file.name}`;
    render();
    try {
        const evidence = await evidenceFromFile(file, fallbackKind);
        intakeEvidence = [
            ...intakeEvidence.filter((item) => !(item.kind === evidence.kind && item.name === evidence.name)),
            evidence
        ];
        aiIntakeResult = undefined;
        loadState = "idle";
        liveMessage = `${file.name} attached for intake structuring.`;
        persistPreNeedIntakeDraft();
    }
    catch (error) {
        loadState = "error";
        errorMessage = errorText(error);
    }
    render();
}
async function evidenceFromFile(file, fallbackKind) {
    const maximumBytes = 4 * 1024 * 1024;
    if (file.size > maximumBytes) {
        throw new Error(`${file.name} is larger than 4 MB. Use a smaller PDF or photo for this demo.`);
    }
    const kind = file.type.startsWith("image/")
        ? "photo"
        : file.type === "application/pdf" ||
            file.name.toLowerCase().endsWith(".pdf")
            ? "pdf"
            : fallbackKind;
    if (kind === "photo" &&
        !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        throw new Error("Use a JPG, PNG or WebP photo.");
    }
    return {
        kind,
        name: file.name,
        mimeType: file.type || undefined,
        dataUrl: await fileToDataUrl(file)
    };
}
function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener("load", () => {
            if (typeof reader.result === "string") {
                resolve(reader.result);
            }
            else {
                reject(new Error("Unable to read the selected evidence file."));
            }
        });
        reader.addEventListener("error", () => {
            reject(new Error("Unable to read the selected evidence file."));
        });
        reader.readAsDataURL(file);
    });
}
function applyStructuredResult(result) {
    const profile = result.generatedProfile;
    intakeDraft = {
        ...intakeDraft,
        title: profile.title,
        description: profile.problemSummary,
        category: profile.category,
        equipmentOrTechnology: profile.equipmentOrTechnology,
        requiredCapabilities: profile.requiredCapabilities,
        location: detectIntakeLocation(profile.location ?? intakeDraft.location) ??
            profile.location ??
            intakeDraft.location,
        requiredBy: profile.urgency ?? intakeDraft.requiredBy,
        budgetRange: profile.budgetRange ?? intakeDraft.budgetRange,
        budgetAmount: parseIntakeBudgetAmount(profile.budgetRange ?? intakeDraft.budgetRange) ?? 0,
        constraints: profile.certificationsOrConstraints
    };
    if (profile.buyerPriority)
        priority = profile.buyerPriority;
}
function syncIntakeDraft(form) {
    const formData = new FormData(form);
    intakeDraft = {
        companyName: formValue(formData, "companyName"),
        contactName: formValue(formData, "contactName"),
        contactEmail: formValue(formData, "contactEmail"),
        title: formValue(formData, "title") ||
            titleFromDescription(formValue(formData, "description")),
        description: formValue(formData, "description"),
        category: formValue(formData, "category"),
        equipmentOrTechnology: csvValues(formData, "equipmentOrTechnology"),
        requiredCapabilities: csvValues(formData, "requiredCapabilities"),
        location: formValue(formData, "location"),
        requiredBy: formValue(formData, "requiredBy"),
        budgetRange: formValue(formData, "budgetRange"),
        budgetAmount: parseIntakeBudgetAmount(formValue(formData, "budgetRange")) ?? 0,
        constraints: csvValues(formData, "constraints")
    };
}
function updateIntakePrimaryActionState(form) {
    const description = form.querySelector("textarea[name='description']");
    const guidance = form.querySelector("#factory-context-guidance");
    const submit = form.querySelector("[data-analyse-requirement]");
    const validationError = validateIntakeRawRequirement(intakeDraft.description);
    if (description) {
        description.setAttribute("aria-invalid", intakeDraft.description && validationError ? "true" : "false");
    }
    if (guidance) {
        guidance.textContent = intakeRawRequirementGuidance(intakeDraft.description);
    }
    if (submit) {
        submit.disabled =
            loadState === "loading" || Boolean(validationError);
    }
}
function validateDraft(input) {
    const rawRequirementError = validateIntakeRawRequirement(input.description);
    if (rawRequirementError)
        return rawRequirementError;
    if (!input.title)
        return "Add a requirement title.";
    if (!input.category)
        return "Add a supplier category.";
    if (!input.location)
        return "Add the site location. Unknown locations must not be inferred.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail)) {
        return "Add a valid buyer contact email.";
    }
    return "";
}
function intakeMissingFields() {
    const missing = (aiIntakeResult?.missingFields ?? []).filter((field) => !intakeFieldResolved(field));
    if (!intakeDraft.location)
        missing.push("location");
    if (!intakeDraft.requiredBy)
        missing.push("urgency");
    if (!intakeDraft.budgetRange)
        missing.push("budget or callout tolerance");
    if (!intakeDraft.equipmentOrTechnology.length) {
        missing.push("equipment or technology");
    }
    if (!intakeDraft.requiredCapabilities.length) {
        missing.push("required supplier capabilities");
    }
    if (!intakeDraft.contactEmail)
        missing.push("buyer contact email");
    if (intakeSourceMode === "fixture" && aiIntakeResult) {
        if (intakeEvidence.some((item) => item.kind === "photo" &&
            !item.extractedText)) {
            missing.push("photo visual interpretation (live AI required)");
        }
        if (intakeEvidence.some((item) => item.kind === "pdf" &&
            !item.extractedText)) {
            missing.push("PDF content interpretation (live AI required)");
        }
    }
    return dedupeIntakeMissingFields(missing);
}
function intakeFieldResolved(field) {
    const normalized = field.toLowerCase();
    if (normalized.includes("location"))
        return Boolean(intakeDraft.location);
    if (normalized.includes("urgency") ||
        normalized.includes("timing") ||
        normalized.includes("required by")) {
        return Boolean(intakeDraft.requiredBy);
    }
    if (normalized.includes("budget") ||
        normalized.includes("callout") ||
        normalized.includes("tolerance")) {
        return Boolean(intakeDraft.budgetRange);
    }
    if (normalized.includes("equipment") ||
        normalized.includes("technology")) {
        return intakeDraft.equipmentOrTechnology.length > 0;
    }
    if (normalized.includes("capabilit")) {
        return intakeDraft.requiredCapabilities.length > 0;
    }
    if (normalized.includes("email") || normalized.includes("contact")) {
        return Boolean(intakeDraft.contactEmail);
    }
    return false;
}
function intakeEvidenceSummaries() {
    return intakeEvidence.map((item) => {
        const source = item.name.startsWith("Demo ")
            ? "demo_fixture"
            : "buyer";
        const processed = Boolean(aiIntakeResult) &&
            (item.kind === "written" || intakeSourceMode === "live");
        return {
            kind: item.kind,
            name: item.name,
            mimeType: item.mimeType,
            source,
            status: processed ? "processed" : "provided"
        };
    });
}
function renderIntakeProvenance() {
    const summaries = workspace?.intakeEvidence.length
        ? workspace.intakeEvidence
        : intakeEvidenceSummaries();
    if (!summaries.length) {
        return `
      <div class="provenance-row">
        <span>Intake provenance</span>
        <strong>Buyer-written requirement</strong>
        <small>No PDF or photo evidence attached</small>
      </div>
    `;
    }
    return `
    <div class="provenance-row">
      <span>Intake provenance</span>
      <strong>${summaries.length} evidence item${summaries.length === 1 ? "" : "s"}</strong>
      <small>${summaries
        .map((item) => `${item.name} (${statusLabel(item.status)}, ${statusLabel(item.source)})`)
        .map(escapeHtml)
        .join(" / ")}</small>
    </div>
  `;
}
function readWorkspaceIdentity() {
    const url = new URL(window.location.href);
    const freshEntryRequested = url.searchParams.get("start") === "new";
    if (freshEntryRequested) {
        safeStorageRemove(LAST_NEED_KEY);
        safeSessionStorageSet(NEW_REQUIREMENT_KEY, "1");
        safeSessionStorageRemove(PRE_NEED_INTAKE_DRAFT_KEY);
    }
    const explicitNeedProfileId = url.searchParams.get("needId") ??
        url.searchParams.get("needProfileId") ??
        undefined;
    const needProfileId = resolveRestoredNeedProfileId(explicitNeedProfileId, safeStorageGet(LAST_NEED_KEY) ?? undefined, freshEntryRequested ||
        safeSessionStorageGet(NEW_REQUIREMENT_KEY) === "1");
    if (explicitNeedProfileId) {
        safeSessionStorageRemove(NEW_REQUIREMENT_KEY);
    }
    const incomingToken = url.searchParams.get("buyerToken") ??
        url.searchParams.get("buyerAccessToken") ??
        url.searchParams.get("accessToken") ??
        undefined;
    if (needProfileId && incomingToken) {
        saveBuyerToken(needProfileId, incomingToken);
    }
    for (const key of [
        "buyerToken",
        "buyerAccessToken",
        "accessToken",
        "needProfileId",
        "start"
    ]) {
        url.searchParams.delete(key);
    }
    if (needProfileId) {
        url.searchParams.set("needId", needProfileId);
        safeStorageSet(LAST_NEED_KEY, needProfileId);
    }
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    return {
        needProfileId,
        restoredFromStorage: !explicitNeedProfileId && Boolean(needProfileId),
        buyerAccessToken: incomingToken ??
            (needProfileId
                ? safeStorageGet(`${TOKEN_PREFIX}${needProfileId}`) ?? undefined
                : undefined)
    };
}
function initialiseBuyerHistory() {
    historyReady = true;
    historyView = view;
    replaceBuyerHistoryView(view);
}
function syncBuyerHistory() {
    if (!historyReady)
        return;
    if (handlingPopState) {
        historyView = view;
        return;
    }
    if (historyView === view)
        return;
    window.history.pushState({
        ...buyerHistoryState(window.history.state),
        [BUYER_VIEW_HISTORY_KEY]: view
    }, "", `${window.location.pathname}${window.location.search}${window.location.hash}`);
    historyView = view;
}
function replaceBuyerHistoryView(nextView) {
    window.history.replaceState({
        ...buyerHistoryState(window.history.state),
        [BUYER_VIEW_HISTORY_KEY]: nextView
    }, "", `${window.location.pathname}${window.location.search}${window.location.hash}`);
}
function buyerHistoryState(value) {
    return value && typeof value === "object"
        ? value
        : {};
}
function buyerViewFromHistory(value) {
    const state = buyerHistoryState(value);
    const candidate = state[BUYER_VIEW_HISTORY_KEY];
    return typeof candidate === "string" &&
        buyerViews.has(candidate)
        ? candidate
        : undefined;
}
function handleBuyerPopState(event) {
    const requested = buyerViewFromHistory(event.state);
    const nextView = workspace
        ? resolveLegalBuyerView(workspace, requested ?? resolveRestoredView(workspace))
        : "intake";
    handlingPopState = true;
    view = nextView;
    historyView = nextView;
    if (requested !== nextView) {
        replaceBuyerHistoryView(nextView);
    }
    persistContext();
    render();
    handlingPopState = false;
}
function resolveRestoredNeedProfileId(explicitNeedProfileId, lastNeedProfileId, newRequirementRequested) {
    return (explicitNeedProfileId ??
        (newRequirementRequested ? undefined : lastNeedProfileId));
}
function setNeedProfileUrl(needProfileId) {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("needId", needProfileId);
    window.history.replaceState({
        ...buyerHistoryState(window.history.state),
        [BUYER_VIEW_HISTORY_KEY]: view
    }, "", `${url.pathname}${url.search}`);
    safeSessionStorageRemove(NEW_REQUIREMENT_KEY);
    safeSessionStorageRemove(PRE_NEED_INTAKE_DRAFT_KEY);
    safeStorageSet(LAST_NEED_KEY, needProfileId);
}
function saveBuyerToken(needProfileId, token) {
    safeStorageSet(`${TOKEN_PREFIX}${needProfileId}`, token);
}
function persistPreNeedIntakeDraft() {
    if (workspace)
        return;
    safeSessionStorageSet(PRE_NEED_INTAKE_DRAFT_KEY, serializePreNeedIntakeDraft({
        requirementInput: intakeDraft,
        priority,
        intakeSourceMode,
        intakeResult: aiIntakeResult,
        evidence: intakeEvidence
    }));
}
function restorePreNeedIntakeDraft() {
    const stored = parsePreNeedIntakeDraft(safeSessionStorageGet(PRE_NEED_INTAKE_DRAFT_KEY));
    if (!stored)
        return;
    intakeDraft = cloneInput(stored.requirementInput);
    priority = stored.priority;
    intakeSourceMode = stored.intakeSourceMode;
    aiIntakeResult = stored.intakeResult;
    intakeEvidence = stored.evidence;
}
function persistContext() {
    const current = workspace;
    const needProfileId = current?.needProfile?.id;
    if (!needProfileId || !current)
        return;
    const context = {
        view,
        priority,
        selectedApproachId: selectedApproachId || undefined,
        selectedCandidateIds: [...selectedCandidateIds],
        outreachChoices: orderedOutreachChoices(selectedOutreachChoices),
        outreachPanelOpen,
        selectedResponseId: selectedResponseId || undefined,
        engagementId: current.engagement?.id,
        intakeSourceMode,
        intakeResult: aiIntakeResult,
        requirementInput: intakeDraft,
        intakeEvidence: current.intakeEvidence,
        researchResult: current.researchResult,
        solutionDecision: current.solutionDecision
    };
    safeStorageSet(`${CONTEXT_PREFIX}${needProfileId}`, JSON.stringify(context));
    safeStorageSet(LAST_NEED_KEY, needProfileId);
}
function loadContext(needProfileId) {
    const raw = safeStorageGet(`${CONTEXT_PREFIX}${needProfileId}`);
    if (!raw)
        return {};
    try {
        const value = JSON.parse(raw);
        const intakeResult = aiIntakeResultSchema.safeParse(value.intakeResult);
        const researchResult = solutionResearchResultSchema.safeParse(value.researchResult);
        const solutionDecision = solutionDecisionSchema.safeParse(value.solutionDecision);
        const evidence = intakeEvidenceSummarySchema
            .array()
            .safeParse(value.intakeEvidence);
        const storedView = typeof value.view === "string" && buyerViews.has(value.view)
            ? value.view
            : undefined;
        const storedPriority = typeof value.priority === "string" &&
            priorities.has(value.priority)
            ? value.priority
            : undefined;
        const storedOutreachChoices = Array.isArray(value.outreachChoices)
            ? value.outreachChoices.filter((item) => typeof item === "string" &&
                outreachChoiceValues.has(item))
            : undefined;
        return {
            view: storedView,
            priority: storedPriority,
            selectedApproachId: typeof value.selectedApproachId === "string"
                ? value.selectedApproachId
                : undefined,
            selectedCandidateIds: Array.isArray(value.selectedCandidateIds)
                ? value.selectedCandidateIds.filter((item) => typeof item === "string")
                : undefined,
            outreachChoices: storedOutreachChoices,
            outreachPanelOpen: typeof value.outreachPanelOpen === "boolean"
                ? value.outreachPanelOpen
                : undefined,
            outreachMode: value.outreachMode === "email" ||
                value.outreachMode === "sms" ||
                value.outreachMode === "link"
                ? value.outreachMode
                : undefined,
            selectedResponseId: typeof value.selectedResponseId === "string"
                ? value.selectedResponseId
                : undefined,
            engagementId: typeof value.engagementId === "string"
                ? value.engagementId
                : undefined,
            intakeSourceMode: value.intakeSourceMode === "live" ||
                value.intakeSourceMode === "fixture"
                ? value.intakeSourceMode
                : undefined,
            intakeResult: intakeResult.success ? intakeResult.data : undefined,
            requirementInput: parseBuyerRequirementInput(value.requirementInput),
            intakeEvidence: evidence.success ? evidence.data : undefined,
            researchResult: researchResult.success
                ? researchResult.data
                : undefined,
            solutionDecision: solutionDecision.success
                ? solutionDecision.data
                : undefined
        };
    }
    catch {
        return {};
    }
}
function resolveRestoredView(data, storedView) {
    if (storedView === "registry")
        return "registry";
    const engagement = data.engagement;
    if (engagement?.status === "supplier_secured")
        return "deployment";
    if (engagement) {
        return engagement.hostedCheckoutUrl || storedView === "payment"
            ? "payment"
            : "selected";
    }
    if (submittedResponses(data).length >= 2)
        return "compare";
    if (storedView === "compare" &&
        hasSingleComparableResponse(data)) {
        return "compare";
    }
    if (storedView === "outreach" ||
        data.outreachDeliveries.some((item) => item.deliveryStatus !== "not_sent" ||
            Boolean(item.errorMessage)) ||
        data.invitations.some((item) => ["opened", "responded"].includes(item.status))) {
        return "outreach";
    }
    if (data.solutionDecision &&
        data.solutionDecision.decision !== "local_trial" &&
        supplierCandidates(data).length) {
        return "candidates";
    }
    if (data.researchResult)
        return "plan";
    return "intake";
}
function resetRequirementState(needProfileId) {
    intakeRevision += 1;
    activeIntakeRequestId += 1;
    if (needProfileId) {
        safeStorageRemove(`${CONTEXT_PREFIX}${needProfileId}`);
        safeStorageRemove(`${TOKEN_PREFIX}${needProfileId}`);
    }
    safeStorageRemove(LAST_NEED_KEY);
    safeSessionStorageSet(NEW_REQUIREMENT_KEY, "1");
    safeSessionStorageRemove(PRE_NEED_INTAKE_DRAFT_KEY);
    workspaceEpoch += 1;
    workspace = undefined;
    supplierRegistry = undefined;
    aiIntakeResult = undefined;
    intakeEvidence = [];
    milestoneUpdateDraft = "";
    intakeDraft = cloneInput(emptyInput);
    priority = "speed";
    selectedApproachId = "";
    selectedCandidateIds = new Set();
    candidateSelectionInitialised = false;
    selectedOutreachChoices = new Set();
    outreachPanelOpen = false;
    selectedResponseId = "";
    intakeMode = "ai";
    view = "intake";
    restoreFailed = false;
    loadState = "idle";
    errorMessage = "";
    liveMessage = "";
    historyView = "intake";
    lastFocusedView = undefined;
    window.history.replaceState({
        [BUYER_VIEW_HISTORY_KEY]: "intake"
    }, "", window.location.pathname);
}
function startNewRequirement() {
    resetRequirementState(workspace?.needProfile?.id);
    render();
    scrollBuyerWorkspaceToTop();
}
function currentPhase() {
    if (view === "registry" && workspace) {
        return workflowJourneyPhase(workspace);
    }
    if (view === "candidates" ||
        view === "outreach" ||
        view === "compare") {
        return "connect";
    }
    if (view === "selected" ||
        view === "payment" ||
        view === "deployment") {
        return "deploy";
    }
    return "find";
}
function workflowJourneyPhase(data) {
    if (data.engagement)
        return "deploy";
    return data.phase;
}
function journeyPhaseIndex(phase) {
    return phase === "find" ? 0 : phase === "connect" ? 1 : 2;
}
function isHistoricalJourneyPhase(data, phase) {
    return (journeyPhaseIndex(phase) <
        journeyPhaseIndex(workflowJourneyPhase(data)));
}
function hasSingleComparableResponse(data) {
    const responses = submittedResponses(data);
    return (responses.length === 1 &&
        responses.filter(isSelectableSupplierResponse).length === 1);
}
function canReviewSupplierComparison(data) {
    return (canSelectSupplierFromComparison(data) ||
        Boolean(data.engagement));
}
function canSelectSupplierFromComparison(data) {
    return (submittedResponses(data).length >= 2 ||
        hasSingleComparableResponse(data));
}
function journeyViewForPhase(data, phase) {
    if (phase === "find") {
        return data.researchResult ? "plan" : "intake";
    }
    if (phase === "connect") {
        if (canReviewSupplierComparison(data))
            return "compare";
        if (data.status === "supplier_outreach" ||
            data.status === "supplier_responses" ||
            data.nextAction === "await_responses") {
            return "outreach";
        }
        return "candidates";
    }
    if (data.engagement?.status === "supplier_secured")
        return "deployment";
    return data.engagement?.hostedCheckoutUrl ? "payment" : "selected";
}
function resolveLegalBuyerView(data, requestedView) {
    if (requestedView === "registry") {
        return "registry";
    }
    if (requestedView === "plan" && data.researchResult) {
        return "plan";
    }
    if (requestedView === "compare" &&
        canReviewSupplierComparison(data)) {
        return "compare";
    }
    if (data.engagement?.status === "supplier_secured") {
        return "deployment";
    }
    if (data.engagement) {
        if (requestedView === "payment" || data.engagement.hostedCheckoutUrl) {
            return "payment";
        }
        return "selected";
    }
    if (requestedView === "outreach" &&
        data.invitations.length > 0 &&
        [
            "supplier_outreach",
            "supplier_responses",
            "supplier_selection"
        ].includes(data.status)) {
        return "outreach";
    }
    if (requestedView === "candidates" &&
        data.phase === "connect" &&
        ["approve_outreach", "send_invitations"].includes(data.nextAction) &&
        (data.discoveredSuppliers.length > 0 || data.matches.length > 0)) {
        return "candidates";
    }
    if (requestedView === "intake" &&
        !data.researchResult &&
        data.phase === "find") {
        return "intake";
    }
    return resolveRestoredView(data);
}
function navigateToJourneyPhase(phase) {
    if (!workspace)
        return;
    const workflowIndex = journeyPhaseIndex(workflowJourneyPhase(workspace));
    if (journeyPhaseIndex(phase) > workflowIndex)
        return;
    const nextView = resolveLegalBuyerView(workspace, journeyViewForPhase(workspace, phase));
    if (nextView === view)
        return;
    view = nextView;
    persistContext();
    render();
}
function selectedSupplier(data) {
    const responseId = data.engagement?.supplierResponseId || selectedResponseId;
    const response = data.responses.find((item) => item.id === responseId);
    if (!response)
        return undefined;
    return {
        response,
        supplier: supplierFor(data, response.supplierId)
    };
}
function selectableApproaches(research) {
    return [...research.approaches]
        .sort((left, right) => right.confidence - left.confidence)
        .slice(0, 3);
}
function resolveSelectedApproachId(research, requestedApproachId) {
    if (!research)
        return "";
    const approaches = selectableApproaches(research);
    if (requestedApproachId &&
        approaches.some((approach) => approach.id === requestedApproachId)) {
        return requestedApproachId;
    }
    return approaches[0]?.id ?? "";
}
function submittedResponses(data) {
    return data.responses.filter((item) => item.status === "submitted");
}
function isSelectableSupplierResponse(response) {
    return (response.decision === "can_help" &&
        (response.indicativePrice?.amount ?? 0) > 0);
}
function supplierFor(data, supplierId) {
    return (data.discoveredSuppliers.find((item) => item.id === supplierId) ??
        data.suppliers.find((item) => item.id === supplierId));
}
function supplierCandidates(data) {
    if (data.discoveredSuppliers.length) {
        return data.discoveredSuppliers.map((supplier) => ({
            supplierId: supplier.id,
            score: supplier.matchScore,
            reasons: supplier.matchReasons,
            risks: supplier.risks
        }));
    }
    return [...data.matches];
}
function resolveSelectedCandidateIds(data, requested, initialised) {
    const candidateIds = supplierCandidates(data).map((candidate) => candidate.supplierId);
    const available = new Set(candidateIds);
    if (!initialised) {
        const invited = data.invitations
            .map((invitation) => invitation.supplierId)
            .filter((supplierId) => available.has(supplierId));
        return new Set(invited.length ? invited : candidateIds);
    }
    return new Set([...requested].filter((supplierId) => available.has(supplierId)));
}
function orderedOutreachChoices(choices) {
    const order = ["link", "sms", "email"];
    return order.filter((choice) => choices.has(choice));
}
function outreachChoiceAvailable(data, candidates, choice) {
    if (choice === "link")
        return true;
    const selected = candidates
        .filter((candidate) => selectedCandidateIds.has(candidate.supplierId))
        .map((candidate) => supplierFor(data, candidate.supplierId));
    if (choice === "sms") {
        if (stagingOutreachOverrides.sms)
            return selected.length > 0;
        return (selected.length > 0 &&
            selected.every((supplier) => supplier &&
                "contactPhone" in supplier &&
                Boolean(supplier.contactPhone)));
    }
    if (stagingOutreachOverrides.email)
        return selected.length > 0;
    return (selected.length > 0 &&
        selected.every((supplier) => Boolean(supplier?.contactEmail)));
}
function outreachAction(choices, count, unavailableChoices) {
    const supplierLabel = `${count} supplier${count === 1 ? "" : "s"}`;
    if (count === 0) {
        return {
            title: "Select at least one supplier",
            description: "Choose the suppliers that should receive this RFQ.",
            loadingLabel: "Sending supplier outreach"
        };
    }
    if (choices.size === 0) {
        return {
            title: "Choose at least one channel",
            description: `Select Link, SMS or Email for ${supplierLabel}.`,
            loadingLabel: "Sending supplier outreach"
        };
    }
    if (unavailableChoices.length) {
        const unavailable = unavailableChoices
            .map((choice) => (choice === "sms" ? "SMS" : statusLabel(choice)))
            .join(" and ");
        return {
            title: `${unavailable} unavailable`,
            description: "One or more selected suppliers are missing the required destination. Remove that channel or change the supplier selection.",
            loadingLabel: "Sending supplier outreach"
        };
    }
    const selectedLabels = orderedOutreachChoices(choices).map((choice) => choice === "sms" ? "SMS" : statusLabel(choice));
    const hasExternalDelivery = choices.has("email") || choices.has("sms");
    if (hasExternalDelivery &&
        ((choices.has("email") && stagingOutreachOverrides.email) ||
            (choices.has("sms") && stagingOutreachOverrides.sms))) {
        return {
            title: `Ready to send by ${selectedLabels.join(", ")}`,
            description: "Configured staging recipient overrides protect unverified public contact data while the live providers deliver each private RFQ link.",
            loadingLabel: "Sending staging supplier outreach"
        };
    }
    if (demoControlsAvailable && hasExternalDelivery) {
        return {
            title: `Ready to send by ${selectedLabels.join(", ")}`,
            description: "Demo mode records provider-shaped delivery evidence without contacting external destinations. Private supplier links remain fully usable.",
            loadingLabel: "Recording demo supplier outreach"
        };
    }
    if (!hasExternalDelivery) {
        return {
            title: `Ready to create links for ${supplierLabel}`,
            description: "No external delivery will be requested. Each selected supplier receives a private RFQ link you can copy manually.",
            loadingLabel: "Creating private supplier links"
        };
    }
    return {
        title: `Ready to send by ${selectedLabels.join(", ")}`,
        description: "Backend provider acceptance controls delivery status. A private supplier link is generated for every selected supplier.",
        loadingLabel: "Sending supplier outreach"
    };
}
function matchForSupplier(data, supplierId) {
    const lead = data.discoveredSuppliers.find((item) => item.id === supplierId);
    return lead
        ? {
            supplierId: lead.id,
            score: lead.matchScore,
            reasons: lead.matchReasons,
            risks: lead.risks
        }
        : data.matches.find((item) => item.supplierId === supplierId);
}
function invitationForSupplier(data, supplierId) {
    return data.invitations.find((item) => item.supplierId === supplierId);
}
function supplierActivity(invitation, response, deliveries) {
    if (response?.status === "submitted" || invitation.status === "responded") {
        return "responded";
    }
    if (invitation.status === "opened")
        return "viewed";
    if (deliveries.some((item) => item.deliveryStatus === "sent"))
        return "sent";
    if (deliveries.length &&
        deliveries.every((item) => item.deliveryStatus === "failed")) {
        return "failed";
    }
    return "ready";
}
function activityLabel(status) {
    const labels = {
        ready: "Ready",
        sent: "Sent",
        failed: "Failed",
        viewed: "Viewed",
        responded: "Responded"
    };
    return labels[status];
}
function renderCitations(citations) {
    return `
    <ul class="citation-list">
      ${citations
        .map((citation) => `
            <li>
              <a href="${safeHttpUrl(citation.url)}" target="_blank" rel="noreferrer">${escapeHtml(citation.title)}</a>
              <span>${escapeHtml(statusLabel(citation.sourceType))} / ${escapeHtml(statusLabel(citation.provider))}</span>
              <p>${escapeHtml(citation.evidenceNote)}</p>
            </li>
          `)
        .join("")}
    </ul>
  `;
}
function sourceBadge(source, liveLabel, fixtureLabel) {
    return `<span class="source-badge is-${source}">${escapeHtml(source === "live" ? liveLabel : fixtureLabel)}</span>`;
}
function formField(name, label, value, required, placeholder = "", type = "text") {
    return `
    <label class="field">
      <span>${escapeHtml(label)}${required ? ` <b class="required-mark">Required</b>` : ""}</span>
      <input
        name="${escapeHtml(name)}"
        type="${escapeHtml(type)}"
        value="${escapeHtml(value)}"
        placeholder="${escapeHtml(placeholder)}"
        ${required ? "required" : ""}
      />
    </label>
  `;
}
function priorityButton(value, label, description) {
    return `
    <button class="priority-option ${priority === value ? "is-selected" : ""}" type="button" data-priority="${value}" aria-pressed="${priority === value}">
      <span class="priority-radio" aria-hidden="true"></span>
      <strong>${escapeHtml(label)}</strong>
      <small>${escapeHtml(description)}</small>
    </button>
  `;
}
function fact(label, value, missing = false) {
    return `
    <div class="${missing ? "is-missing" : ""}">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `;
}
function comparisonFact(label, value, missing = false) {
    return `
    <div class="${missing ? "is-missing" : ""}">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `;
}
function profileList(label, items) {
    return `
    <div>
      <span>${escapeHtml(label)}</span>
      ${items.length
        ? tagList(items)
        : `<strong class="missing-value">Not provided</strong>`}
    </div>
  `;
}
function tagList(items) {
    return `<div class="tag-list">${items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`;
}
function bulletList(items, empty) {
    if (!items.length)
        return `<p class="quiet-note">${escapeHtml(empty)}</p>`;
    return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}
function renderInlineEmpty(title, body) {
    return `
    <div class="inline-empty">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(body)}</p>
    </div>
  `;
}
function primaryActionHeading() {
    if (aiIntakeResult)
        return "Continue with the reviewed Need Profile";
    return "Create a supplier-ready Need Profile";
}
function primaryActionDescription() {
    if (aiIntakeResult) {
        return intakeMissingFields().length
            ? "Complete the missing fields before viewing recommended solutions."
            : "Your reviewed scope will be used to generate three recommended pathways.";
    }
    return "Veltact structures the requirement and prepares recommended pathways. No supplier is contacted yet.";
}
function fileEvidenceNote(item) {
    if (item.kind === "written")
        return "Written evidence ready";
    if (!item.dataUrl && !item.extractedText) {
        return "File details restored; reattach before rerunning analysis";
    }
    if (aiIntakeResult && intakeSourceMode === "fixture") {
        return "Provided; local adapter did not interpret file content";
    }
    if (item.dataUrl)
        return "File ready for API processing";
    return "File metadata only";
}
function maskDestination(destination) {
    if (destination.includes("@")) {
        const [name, domain] = destination.split("@");
        return `${name.slice(0, 2)}***@${domain}`;
    }
    return destination.length > 6
        ? `${destination.slice(0, 4)}...${destination.slice(-3)}`
        : destination;
}
function requireNeedProfile(data) {
    if (!data.needProfile) {
        throw new Error("The buyer workspace has no Need Profile.");
    }
    return data.needProfile;
}
function cloneInput(input) {
    return {
        ...input,
        equipmentOrTechnology: [...input.equipmentOrTechnology],
        requiredCapabilities: [...input.requiredCapabilities],
        constraints: [...input.constraints]
    };
}
function titleFromDescription(description) {
    const firstSentence = description.split(/[.!?]/)[0]?.trim();
    return firstSentence
        ? truncateIntakeTitle(firstSentence)
        : "Industrial supplier requirement";
}
function priorityLabel(value) {
    const labels = {
        speed: "Speed",
        technical_fit: "Technical fit",
        quality: "Quality",
        trust: "Trust",
        price: "Price"
    };
    return labels[value];
}
const AU_STATE_TOKENS = new Set(["nsw", "vic", "qld", "sa", "wa", "tas", "nt", "act"]);
// Catalog records store locations/capabilities lowercase ("sydney", "wa",
// "plc diagnostics") while live-discovery entries arrive properly cased. Only
// transform strings that are entirely lowercase so real names pass through.
function formatLocationLabel(value) {
    const trimmed = value.trim();
    if (!trimmed || /[A-Z]/.test(trimmed)) {
        return trimmed.replace(/\b[a-z]{2,3}\b/g, (word) => AU_STATE_TOKENS.has(word) ? word.toUpperCase() : word);
    }
    return trimmed
        .split(/\s+/)
        .map((word) => AU_STATE_TOKENS.has(word)
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}
const CAPABILITY_ACRONYMS = new Set(["plc", "scada", "hmi", "cnc", "vfd", "ups", "io"]);
function formatCapabilityLabel(value) {
    const trimmed = value.trim();
    if (!trimmed || /[A-Z]/.test(trimmed))
        return trimmed;
    const acronymised = trimmed.replace(/\b[a-z]{2,5}\b/g, (word) => CAPABILITY_ACRONYMS.has(word) ? word.toUpperCase() : word);
    return acronymised.charAt(0).toUpperCase() + acronymised.slice(1);
}
function humanFieldName(value) {
    const spaced = value.replaceAll("_", " ").trim();
    // Live intake/research can return full sentences; title-casing is only for
    // short field-style labels like "contact email".
    const looksLikeSentence = spaced.split(/\s+/).length > 5 || /[.:;,]/.test(spaced);
    if (looksLikeSentence) {
        return spaced.charAt(0).toUpperCase() + spaced.slice(1);
    }
    return spaced.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function statusLabel(value) {
    return value
        .replaceAll("_", " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function supplierName(supplier, supplierId) {
    return supplier?.companyName ?? `Supplier ${shortId(supplierId)}`;
}
function supplierRecordLabel(supplier) {
    if (!supplier)
        return "Supplier record";
    if ("sourceMode" in supplier) {
        return supplier.sourceMode === "live"
            ? "Public-source supplier lead"
            : "Demo supplier lead";
    }
    return supplier.verified ? "Verified supplier record" : "Supplier record";
}
function supplierLocation(supplier) {
    if (!supplier)
        return "Location unavailable";
    if ("location" in supplier)
        return supplier.location;
    return supplier.serviceRegions[0] ?? "Service region unavailable";
}
function candidateContactReadiness(supplier) {
    if (!supplier)
        return "Secure link only";
    const channels = [
        supplier.contactEmail ? "email" : "",
        "contactPhone" in supplier && supplier.contactPhone ? "SMS" : ""
    ].filter(Boolean);
    return channels.length
        ? `${channels.join(" + ")} available`
        : stagingOutreachOverrides.email || stagingOutreachOverrides.sms
            ? "Public contact unverified · staging route ready"
            : "Secure link only";
}
function shortId(value) {
    return value.length > 10 ? `${value.slice(0, 8)}...` : value;
}
function shortUrl(value) {
    try {
        const url = new URL(value);
        const token = url.searchParams.get("token");
        return `${url.host}${url.pathname}${token ? `?token=${token.slice(0, 7)}...` : ""}`;
    }
    catch {
        return value;
    }
}
function safeHttpUrl(value) {
    try {
        const url = new URL(value, window.location.origin);
        return ["http:", "https:"].includes(url.protocol)
            ? escapeHtml(url.toString())
            : "#";
    }
    catch {
        return "#";
    }
}
function money(amount, currency) {
    return new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency,
        maximumFractionDigits: 0
    }).format(amount / 100);
}
function formatTime(value) {
    if (!value)
        return "Not yet";
    const date = new Date(value);
    if (Number.isNaN(date.valueOf()))
        return "Unavailable";
    return new Intl.DateTimeFormat("en-AU", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
    }).format(date);
}
function formValue(form, name) {
    return String(form.get(name) ?? "").trim();
}
function csvValues(form, name) {
    return formValue(form, name)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}
function uniqueStrings(values) {
    const seen = new Set();
    return values.filter((value) => {
        const key = value.trim().toLowerCase();
        if (!key || seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
// Live intake and live research each contribute missing-information items that
// often overlap semantically without matching exactly ("Specific gearbox make
// and model" vs "Gearbox make/model, ratio, and mounting arrangement."). Keep
// the first phrasing and drop later items whose significant words mostly
// repeat an earlier item.
function dedupeSimilarStrings(values) {
    const kept = [];
    const tokensOf = (value) => new Set(value
        .toLowerCase()
        .replace(/[^a-z0-9\s/-]/g, " ")
        .split(/[\s/-]+/)
        .filter((word) => word.length > 3));
    for (const value of values) {
        const tokens = tokensOf(value);
        const isNearDuplicate = tokens.size > 0 &&
            kept.some((entry) => {
                let shared = 0;
                for (const token of tokens) {
                    if (entry.tokens.has(token))
                        shared += 1;
                }
                return shared / Math.min(tokens.size, entry.tokens.size || 1) >= 0.6;
            });
        if (!isNearDuplicate)
            kept.push({ value, tokens });
    }
    return kept.map((entry) => entry.value);
}
function bindClick(selector, handler) {
    document.querySelector(selector)?.addEventListener("click", () => {
        void handler();
    });
}
function showLiveMessage(message) {
    liveMessage = message;
    persistContext();
    render();
    window.setTimeout(() => {
        if (liveMessage === message) {
            liveMessage = "";
            render();
        }
    }, 2600);
}
function safeStorageGet(key) {
    try {
        return window.localStorage.getItem(key);
    }
    catch {
        return null;
    }
}
function safeStorageSet(key, value) {
    try {
        window.localStorage.setItem(key, value);
    }
    catch {
        // Storage may be unavailable in a hardened browser; the current session continues.
    }
}
function safeStorageRemove(key) {
    try {
        window.localStorage.removeItem(key);
    }
    catch {
        // Storage may be unavailable in a hardened browser.
    }
}
function safeSessionStorageGet(key) {
    try {
        return window.sessionStorage.getItem(key);
    }
    catch {
        return null;
    }
}
function safeSessionStorageSet(key, value) {
    try {
        window.sessionStorage.setItem(key, value);
    }
    catch {
        // Session storage may be unavailable; the current in-memory reset still works.
    }
}
function safeSessionStorageRemove(key) {
    try {
        window.sessionStorage.removeItem(key);
    }
    catch {
        // Session storage may be unavailable in a hardened browser.
    }
}
function errorText(error) {
    return error instanceof Error
        ? error.message
        : "Unexpected RapidMatch error.";
}
function isMissingNeedProfileError(error) {
    return (error instanceof Error &&
        "status" in error &&
        error.status === 404);
}
function renderCompanyIdentity(companyName, compact = false) {
    const logo = companyLogoFor(companyName);
    if (!logo)
        return escapeHtml(companyName);
    return `
    <span class="company-identity ${compact ? "is-compact" : ""}">
      <span class="company-logo-shell" aria-hidden="true">
        <img class="company-logo" src="${logo}" alt="" />
      </span>
      <span class="company-name-text">${escapeHtml(companyName)}</span>
    </span>
  `;
}
function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
