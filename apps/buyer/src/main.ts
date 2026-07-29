import {
  aiIntakeResultSchema,
  intakeEvidenceSummarySchema,
  solutionDecisionSchema,
  solutionResearchResultSchema,
  type AiIntakeResult,
  type IntakeEvidenceSummary,
  type NeedProfile,
  type OutreachChannel,
  type ResearchCitation,
  type SolutionApproach,
  type Supplier,
  type SupplierInvitation,
  type SupplierLead,
  type SupplierMatch,
  type SupplierOutreachDelivery,
  type SupplierResponse
} from "@veltact/contracts";
import {
  BackendAiIntakeService,
  type IntakeEvidence,
  type IntakeSourceMode
} from "./aiIntakeService.js";
import {
  apiBaseUrl,
  demoControlsEnabled,
  localDemoPaymentEnabled
} from "./apiBase.js";
import { companyLogoFor } from "./companyLogos.js";
import { RapidMatchService } from "./rapidMatchService.js";
import type {
  BuyerRequirementInput,
  BuyerWorkspace,
  PrioritySignal
} from "./types.js";

type BuyerView =
  | "intake"
  | "plan"
  | "candidates"
  | "outreach"
  | "compare"
  | "selected"
  | "payment"
  | "deployment";
type IntakeMode = "ai" | "manual";
type LoadState = "idle" | "loading" | "error" | "success";
type OutreachMode = OutreachChannel | "link";
type SupplierActivityStatus = "ready" | "sent" | "failed" | "viewed" | "responded";
type SupplierCandidate = Pick<
  SupplierMatch,
  "supplierId" | "score" | "reasons" | "risks"
>;
type SupplierReference = Supplier | SupplierLead;

type PersistedContext = {
  view?: BuyerView;
  priority?: PrioritySignal;
  selectedApproachId?: string;
  selectedCandidateIds?: string[];
  outreachMode?: OutreachMode;
  selectedResponseId?: string;
  engagementId?: string;
  intakeSourceMode?: IntakeSourceMode;
  intakeResult?: AiIntakeResult;
  requirementInput?: BuyerRequirementInput;
  intakeEvidence?: IntakeEvidenceSummary[];
  researchResult?: BuyerWorkspace["researchResult"];
  solutionDecision?: BuyerWorkspace["solutionDecision"];
};

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
    destination?: string;
    deliveryStatus?: "not_sent" | "queued" | "sent" | "failed";
  };
};

type RealtimeSocket = {
  emit(
    eventName: string,
    payload: { needProfileId: string; buyerAccessToken?: string }
  ): void;
  on(eventName: string, handler: (payload: RealtimePayload) => void): void;
};

type SocketIoFactory = (
  origin: string,
  options: { transports: string[]; reconnection: boolean }
) => RealtimeSocket;

const service = new RapidMatchService();
const aiIntakeService = new BackendAiIntakeService();
const app = document.querySelector<HTMLDivElement>("#app");
const socketWindow = window as Window & { io?: SocketIoFactory };
const realtimeOrigin = new URL(apiBaseUrl(), window.location.origin).origin;
const rapidMatchSocketEvent = {
  joinNeedProfile: "rapidmatch:need.join",
  leaveNeedProfile: "rapidmatch:need.leave",
  invitationSent: "rapidmatch:invitation.sent",
  outreachDeliveryUpdated: "rapidmatch:outreach.delivery_updated",
  supplierResponseSubmitted: "rapidmatch:response.submitted",
  paymentStatusUpdated: "rapidmatch:payment.status_updated",
  engagementSecured: "rapidmatch:engagement.secured",
  deploymentUpdated: "rapidmatch:deployment.updated"
} as const;
const LAST_NEED_KEY = "veltact:rapidmatch:last-need-id";
const NEW_REQUIREMENT_KEY = "veltact:rapidmatch:new-requirement";
const CONTEXT_PREFIX = "veltact:rapidmatch:buyer-context:";
const TOKEN_PREFIX = "veltact:rapidmatch:buyer-token:";
const buyerViews = new Set<BuyerView>([
  "intake",
  "plan",
  "candidates",
  "outreach",
  "compare",
  "selected",
  "payment",
  "deployment"
]);
const priorities = new Set<PrioritySignal>([
  "speed",
  "technical_fit",
  "quality",
  "trust",
  "price"
]);

let view: BuyerView = "intake";
let intakeMode: IntakeMode = "ai";
let loadState: LoadState = "idle";
let loadingLabel = "";
let errorMessage = "";
let liveMessage = "";
let priority: PrioritySignal = "speed";
let selectedApproachId = "";
let selectedCandidateIds = new Set<string>();
let candidateSelectionInitialised = false;
let outreachMode: OutreachMode = "email";
let selectedResponseId = "";
let workspace: BuyerWorkspace | undefined;
let aiIntakeResult: AiIntakeResult | undefined;
let intakeSourceMode: IntakeSourceMode = "fixture";
let intakeEvidence: IntakeEvidence[] = [];
let booting = true;
let demoControlsAvailable = false;
let localDemoPaymentAvailable = false;
let milestoneUpdateDraft = "";
let restoreFailed = false;
let workspaceEpoch = 0;
let pollHandle: number | undefined;
let pollKey = "";
let isPolling = false;
let realtimeSocket: RealtimeSocket | undefined;
let joinedNeedProfileId = "";
let realtimeClientLoading: Promise<void> | undefined;

const emptyInput: BuyerRequirementInput = {
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

let intakeDraft: BuyerRequirementInput = cloneInput(emptyInput);

const plcDemoInput: BuyerRequirementInput = {
  companyName: "HarbourPack Manufacturing",
  contactName: "Elena Morris",
  contactEmail: "elena.morris@harbourpack.example",
  title: "Urgent Siemens PLC fault on packaging line",
  description:
    "Packaging line stopped after intermittent Siemens PLC faults in Western Sydney. Need an authorised industrial automation specialist today to inspect the fault evidence, restore safe production and document the work. Speed matters.",
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

const roboticsDemoInput: BuyerRequirementInput = {
  companyName: "HarbourPack Manufacturing",
  contactName: "Elena Morris",
  contactEmail: "elena.morris@harbourpack.example",
  title: "Robotic palletiser integration for dispatch line",
  description:
    "We need an ABB robotic palletising cell integrated with the existing Siemens controls and packaging conveyor in Western Sydney. The system must handle mixed cartons, meet the morning dispatch cycle and include machinery safety validation. Technical fit matters.",
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
void bootstrap();

async function bootstrap() {
  const demoGate = demoControlsEnabled();
  const localDemoPaymentGate = localDemoPaymentEnabled();
  const identity = readWorkspaceIdentity();
  if (!identity.needProfileId) {
    [demoControlsAvailable, localDemoPaymentAvailable] = await Promise.all([
      demoGate,
      localDemoPaymentGate
    ]);
    booting = false;
    render();
    return;
  }

  const context = loadContext(identity.needProfileId);
  if (context.priority) priority = context.priority;
  if (context.selectedApproachId) {
    selectedApproachId = context.selectedApproachId;
  }
  if (context.selectedCandidateIds) {
    selectedCandidateIds = new Set(context.selectedCandidateIds);
    candidateSelectionInitialised = true;
  }
  if (context.outreachMode) outreachMode = context.outreachMode;
  if (context.selectedResponseId) selectedResponseId = context.selectedResponseId;
  if (context.intakeResult) aiIntakeResult = context.intakeResult;
  if (context.intakeSourceMode) intakeSourceMode = context.intakeSourceMode;
  if (context.requirementInput) {
    intakeDraft = cloneInput(context.requirementInput);
  }

  if (identity.buyerAccessToken) {
    service.setBuyerAccessToken(
      identity.needProfileId,
      identity.buyerAccessToken
    );
  }

  loadState = "loading";
  loadingLabel = "Restoring buyer workspace";
  render();

  try {
    workspace = await service.restoreWorkspace(
      identity.needProfileId,
      {
        intakeEvidence: context.intakeEvidence,
        researchResult: context.researchResult,
        solutionDecision: context.solutionDecision
      },
      context.engagementId
    );
    selectedResponseId =
      workspace.engagement?.supplierResponseId || selectedResponseId;
    selectedApproachId = resolveSelectedApproachId(
      workspace.researchResult,
      selectedApproachId ||
        workspace.solutionDecision?.selectedApproachIds[0]
    );
    selectedCandidateIds = resolveSelectedCandidateIds(
      workspace,
      selectedCandidateIds,
      candidateSelectionInitialised
    );
    candidateSelectionInitialised = true;
    view = resolveRestoredView(workspace, context.view);
    restoreFailed = false;
    loadState = "idle";
  } catch (error) {
    restoreFailed = true;
    loadState = "error";
    errorMessage = errorText(error);
    view = "intake";
  } finally {
    [demoControlsAvailable, localDemoPaymentAvailable] = await Promise.all([
      demoGate,
      localDemoPaymentGate
    ]);
    booting = false;
    render();
  }
}

function render() {
  if (!app) return;
  const phase = currentPhase();
  if (phase === "deploy") {
    document.body.dataset.phase = "deploy";
  } else {
    delete document.body.dataset.phase;
  }
  app.innerHTML = `
    <header class="product-header">
      <a class="product-wordmark" href="./index.html" aria-label="Veltact RapidMatch">
        <span class="product-wordmark-notch" aria-hidden="true"></span>
        <span>Veltact</span>
      </a>
      <div class="product-context">
        <strong>RapidMatch</strong>
        <span>Buyer workspace</span>
      </div>
    </header>

    <section class="hero ${workspace ? "hero-compact" : ""}">
      <div class="hero-copy-block">
        <p class="eyebrow">Industrial supplier response</p>
        <h1>Describe what you need. The right industrial suppliers respond.</h1>
        <p class="hero-copy">Submit one requirement and receive comparable responses from relevant, available providers.</p>
      </div>
      ${workspace ? renderWorkspaceStatus() : ""}
    </section>

    ${renderJourney(phase)}
    ${renderBanner()}

    <section class="workspace" aria-busy="${loadState === "loading"}">
      ${booting ? renderLoadingSkeleton() : renderCurrentView()}
    </section>
  `;
  bindEvents();
  configurePolling();
  configureRealtime();
}

function renderJourney(phase: "find" | "connect" | "deploy") {
  const phases = [
    ["find", "Find", "Structure and choose a path"],
    ["connect", "Connect", "Match, invite and compare"],
    ["deploy", "Deploy", "Commit and track delivery"]
  ] as const;
  const activeIndex = phases.findIndex(([key]) => key === phase);
  return `
    <nav class="journey" aria-label="RapidMatch journey">
      ${phases
        .map(
          ([key, label, description], index) => `
            <div class="journey-step ${index < activeIndex ? "is-complete" : ""} ${index === activeIndex ? "is-current" : ""}">
              <span class="journey-number">${index + 1}</span>
              <span>
                <strong>${label}</strong>
                <small>${description}</small>
              </span>
            </div>
          `
        )
        .join("")}
    </nav>
  `;
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
  if (view === "intake") return renderIntake();
  if (!workspace?.needProfile) {
    return renderUnavailable(
      "Buyer workspace unavailable",
      "The backend did not return a canonical Need Profile for this workspace."
    );
  }
  if (view === "plan") return renderPlan(workspace);
  if (view === "candidates") return renderCandidates(workspace);
  if (view === "outreach") return renderOutreach(workspace);
  if (view === "compare") return renderComparison(workspace);
  if (view === "selected") return renderSelected(workspace);
  if (view === "payment") return renderPayment(workspace);
  return renderDeployment(workspace);
}

function renderWorkspaceStatus() {
  if (!workspace?.needProfile) return "";
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
      ${
        payment
          ? `<div><span>Payment</span><strong>${escapeHtml(statusLabel(payment))}</strong></div>`
          : ""
      }
    </aside>
  `;
}

function renderIntake() {
  const structured = Boolean(aiIntakeResult);
  const primaryLabel =
    intakeMode === "manual"
      ? "Analyse manual requirement"
      : structured
        ? "Analyse requirement"
        : "Structure requirement";
  const missing = intakeMissingFields();
  const evidence = intakeEvidence.length
    ? `
      <div class="evidence-list" aria-label="Attached evidence">
        ${intakeEvidence
          .map(
            (item, index) => `
              <div class="evidence-item">
                <span class="file-kind">${escapeHtml(item.kind.toUpperCase())}</span>
                <span>
                  <strong>${escapeHtml(item.name)}</strong>
                  <small>${escapeHtml(fileEvidenceNote(item))}</small>
                </span>
                <button class="text-button" type="button" data-remove-evidence="${index}">Remove</button>
              </div>
            `
          )
          .join("")}
      </div>
    `
    : `<p class="quiet-note">No files attached. PDF and photo evidence are optional.</p>`;

  return `
    <form id="requirement-form" class="panel intake-form">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Find / Requirement intake</p>
          <h2>Turn factory context into a supplier-ready Need Profile</h2>
        </div>
        ${
          demoControlsAvailable
            ? `
              <div class="demo-utilities" aria-label="Demo utilities">
                <button class="button button-quiet" type="button" data-demo="plc">Demo: PLC</button>
                <button class="button button-quiet" type="button" data-demo="robotics">Demo: Robotic integration</button>
              </div>
            `
            : ""
        }
      </div>

      <div class="mode-switch" role="group" aria-label="Intake mode">
        <button type="button" class="${intakeMode === "ai" ? "is-active" : ""}" data-intake-mode="ai" aria-pressed="${intakeMode === "ai"}">AI assisted</button>
        <button type="button" class="${intakeMode === "manual" ? "is-active" : ""}" data-intake-mode="manual" aria-pressed="${intakeMode === "manual"}">Manual</button>
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
          <textarea name="description" rows="6" placeholder="Packaging line stopped after intermittent Siemens PLC faults in Western Sydney. Need someone today. Speed matters." required>${escapeHtml(intakeDraft.description)}</textarea>
          <small>Use plain language. Veltact does not diagnose equipment or instruct machinery changes.</small>
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
            <span class="file-control-title">PDF document</span>
            <span>Manual, alarm report or scope</span>
            <input name="pdfEvidence" type="file" accept="application/pdf,.pdf" />
          </label>
          <label class="file-control">
            <span class="file-control-title">Equipment photo</span>
            <span>Nameplate, HMI or visible condition</span>
            <input name="photoEvidence" type="file" accept="image/jpeg,image/png,image/webp" />
          </label>
        </div>
        ${evidence}
      </section>

      ${
        structured
          ? renderStructuredIntakeSummary(missing)
          : intakeMode === "ai"
            ? `
              <div class="intake-explainer">
                <strong>One bounded structuring pass</strong>
                <span>The API extracts procurement fields, identifies unknowns and keeps every field editable before any supplier is contacted.</span>
              </div>
            `
            : ""
      }

      ${renderManualFields(structured || intakeMode === "manual", missing)}

      <div class="primary-action-row">
        <div>
          <strong>${escapeHtml(primaryActionHeading())}</strong>
          <span>${escapeHtml(primaryActionDescription())}</span>
        </div>
        <button class="button button-primary" type="submit" ${loadState === "loading" ? "disabled" : ""}>
          ${escapeHtml(primaryLabel)}
        </button>
      </div>
    </form>
  `;
}

function renderStructuredIntakeSummary(missing: string[]) {
  const confidence = aiIntakeResult?.confidence;
  return `
    <section class="structure-result">
      <div class="structure-result-heading">
        <div>
          <p class="eyebrow">Structured draft ready</p>
          <h3>Review every field before analysis</h3>
        </div>
        <div class="source-stack">
          ${sourceBadge(
            intakeSourceMode,
            "OpenAI API",
            "Local deterministic adapter"
          )}
          <span class="confidence">
            ${confidence === undefined ? "Confidence not supplied" : `${Math.round(confidence * 100)}% intake confidence`}
          </span>
        </div>
      </div>
      ${
        missing.length
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
          `
      }
    </section>
  `;
}

function renderManualFields(open: boolean, missing: string[]) {
  return `
    <details class="manual-fields" ${open ? "open" : ""}>
      <summary>
        <span>
          <strong>Review and edit Need Profile fields</strong>
          <small>Manual entry stays available at every intake step.</small>
        </span>
        <span class="summary-status">${missing.length ? `${missing.length} missing` : "Ready"}</span>
      </summary>
      <div class="manual-fields-body">
        <div class="form-grid">
          ${formField("title", "Requirement title", intakeDraft.title, open)}
          ${formField("category", "Category", intakeDraft.category, open)}
          ${formField(
            "location",
            "Site location",
            intakeDraft.location,
            open,
            "Western Sydney, NSW"
          )}
          ${formField(
            "requiredBy",
            "Urgency / required by",
            intakeDraft.requiredBy,
            false,
            "Today or target date"
          )}
          ${formField(
            "equipmentOrTechnology",
            "Equipment / technology",
            intakeDraft.equipmentOrTechnology.join(", "),
            false,
            "Siemens S7 PLC, packaging line"
          )}
          ${formField(
            "requiredCapabilities",
            "Required capabilities",
            intakeDraft.requiredCapabilities.join(", "),
            false,
            "PLC diagnostics, onsite support"
          )}
          ${formField(
            "budgetRange",
            "Budget / callout tolerance",
            intakeDraft.budgetRange,
            false,
            "Up to AUD 2,000"
          )}
          ${formField(
            "constraints",
            "Constraints",
            intakeDraft.constraints.join(", "),
            false,
            "Safe isolation, minimal downtime"
          )}
          ${formField(
            "companyName",
            "Buyer organisation",
            intakeDraft.companyName,
            false
          )}
          ${formField(
            "contactName",
            "Buyer contact",
            intakeDraft.contactName,
            false
          )}
          ${formField(
            "contactEmail",
            "Contact email",
            intakeDraft.contactEmail,
            open,
            "buyer@factory.com",
            "email"
          )}
        </div>

        <fieldset class="priority-fieldset">
          <legend>Buyer priority</legend>
          <div class="priority-grid">
            ${priorityButton("speed", "Speed", "Fastest credible response")}
            ${priorityButton(
              "technical_fit",
              "Technical fit",
              "Best capability alignment"
            )}
            ${priorityButton("quality", "Quality", "Strongest delivery standard")}
            ${priorityButton("trust", "Trust", "Most proven supplier")}
            ${priorityButton("price", "Price", "Lowest credible cost")}
          </div>
        </fieldset>
      </div>
    </details>
  `;
}

function renderPlan(data: BuyerWorkspace) {
  const profile = requireNeedProfile(data);
  const research = data.researchResult;
  if (!research) {
    return renderUnavailable(
      "Solution analysis unavailable",
      "The API did not return research or a labelled fallback result.",
      "Retry analysis",
      "retry-research"
    );
  }
  const approaches = selectableApproaches(research);
  if (approaches.length !== 3) {
    return renderUnavailable(
      "Three solution pathways are required",
      `The research API returned ${approaches.length} usable pathway${approaches.length === 1 ? "" : "s"}. Veltact will not invent the missing supplier scope.`,
      "Retry analysis",
      "retry-research"
    );
  }
  selectedApproachId = resolveSelectedApproachId(
    research,
    selectedApproachId ||
      data.solutionDecision?.selectedApproachIds[0]
  );
  const selectedApproach = approaches.find(
    (approach) => approach.id === selectedApproachId
  );
  const missing = uniqueStrings([
    ...intakeMissingFields(),
    ...research.missingInformation
  ]);
  return `
    <div class="view-stack">
      <article class="need-report" aria-label="Veltact Need Profile report">
        <header class="report-heading">
          <div>
            <span class="report-wordmark">Veltact</span>
            <p>Need Profile ${escapeHtml(shortId(profile.id))}</p>
          </div>
          <div class="source-stack">
            ${sourceBadge(
              research.sourceMode,
              "Live research",
              "Fixture research"
            )}
            ${
              aiIntakeResult?.confidence === undefined
                ? ""
                : `<span class="confidence">${Math.round(aiIntakeResult.confidence * 100)}% intake confidence</span>`
            }
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
              <h2>Select one supplier-ready solution</h2>
            </div>
            <span class="solution-count">3 pathways</span>
          </div>
          <p class="section-intro">The highest-confidence path is recommended, but all three remain available for buyer review. Selecting a path does not contact suppliers.</p>
          <div class="solution-grid" role="radiogroup" aria-label="Solution pathways">
            ${approaches
              .map((approach, index) =>
                renderSolutionOption(
                  approach,
                  research.citations,
                  index === 0
                )
              )
              .join("")}
          </div>
          <div class="selected-scope" aria-live="polite">
            <span>Selected supplier scope</span>
            <strong>${selectedApproach ? escapeHtml(selectedApproach.title) : "Select one pathway"}</strong>
          </div>
        </section>

        <section class="report-evidence">
          <div class="evidence-columns">
            <div>
              <p class="eyebrow">Missing information</p>
              <h3>Confirm before supplier commitment</h3>
              ${
                missing.length
                  ? `<ul class="check-list missing-list">${missing.map((item) => `<li>${escapeHtml(humanFieldName(item))}</li>`).join("")}</ul>`
                  : `<p class="positive-copy">No material intake gaps were identified.</p>`
              }
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
          <p class="eyebrow">Report ready</p>
          <h2>Keep the report or continue to suppliers</h2>
          <p>Download is a report utility. Supplier discovery begins only when you choose Find suppliers.</p>
        </div>
        <div class="outcome-actions">
          <button class="button button-secondary button-large" type="button" data-download-report ${selectedApproach ? "" : "disabled"}>
            Download report
          </button>
          <button class="button button-primary button-large" type="button" data-find-suppliers ${selectedApproach ? "" : "disabled"}>
            Find suppliers
          </button>
        </div>
      </section>
    </div>
  `;
}

function renderSolutionOption(
  approach: SolutionApproach,
  citations: ResearchCitation[],
  recommended: boolean
) {
  const selected = approach.id === selectedApproachId;
  return `
    <article class="solution-option ${selected ? "is-selected" : ""}">
      <label class="solution-choice">
        <input
          type="radio"
          name="solution-pathway"
          value="${escapeHtml(approach.id)}"
          ${selected ? "checked" : ""}
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

function renderNeedProfile(profile: NeedProfile) {
  const equipment =
    intakeDraft.equipmentOrTechnology.length
      ? intakeDraft.equipmentOrTechnology
      : aiIntakeResult?.generatedProfile.equipmentOrTechnology ?? [];
  const capabilities =
    intakeDraft.requiredCapabilities.length
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
        ${fact(
          "Budget / tolerance",
          profile.budget
            ? money(profile.budget.amount, profile.budget.currency)
            : intakeDraft.budgetRange || "Not provided",
          !profile.budget && !intakeDraft.budgetRange
        )}
        ${fact("Priority", priorityLabel(priority))}
        ${fact("Contact", (profile.contactEmail ?? intakeDraft.contactEmail) || "Not provided", !profile.contactEmail && !intakeDraft.contactEmail)}
      </dl>
      <div class="profile-lists">
        ${profileList("Equipment / technology", equipment)}
        ${profileList(
          "Required capabilities",
          capabilities.length ? capabilities : profile.mustHaves
        )}
        ${profileList("Constraints", profile.constraints)}
      </div>
      ${renderIntakeProvenance()}
    </div>
  `;
}

function renderApproachDetails(
  approach: SolutionApproach,
  citations: ResearchCitation[]
) {
  const referenced = citations.filter((citation) =>
    approach.citationIds.includes(citation.id)
  );
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
        .map(
          (citation) => `
            <a href="${safeHttpUrl(citation.url)}" target="_blank" rel="noreferrer">
              ${escapeHtml(citation.title)}
            </a>
          `
        )
        .join("")}
    </div>
  `;
}

function renderCandidates(data: BuyerWorkspace) {
  const profile = requireNeedProfile(data);
  const candidates = supplierCandidates(data);
  if (!candidates.length) {
    return renderUnavailable(
      "No supplier candidates available",
      "The supplier discovery API returned no candidates for this requirement. No outreach has been sent.",
      "Refresh candidates",
      "refresh-workspace"
    );
  }
  candidates.sort(
    (left, right) => right.score - left.score
  );
  selectedCandidateIds = resolveSelectedCandidateIds(
    data,
    selectedCandidateIds,
    candidateSelectionInitialised
  );
  candidateSelectionInitialised = true;
  const selectedCount = candidates.filter((candidate) =>
    selectedCandidateIds.has(candidate.supplierId)
  ).length;
  const channelAvailable = outreachModeAvailable(
    data,
    candidates,
    outreachMode
  );
  const action = outreachAction(outreachMode, selectedCount);
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
            <h2>${selectedCount} supplier${selectedCount === 1 ? "" : "s"} selected</h2>
          </div>
          <span class="selection-count">${selectedCount}/${candidates.length}</span>
        </div>
        <fieldset class="outreach-modes">
          <legend>Choose one outreach method</legend>
          ${renderOutreachMode(
            "email",
            "Email",
            "Send through the configured email provider"
          )}
          ${renderOutreachMode(
            "sms",
            "SMS",
            "Send only where a mobile number is available"
          )}
          ${renderOutreachMode(
            "link",
            "Secure link",
            "Generate links without requesting external delivery"
          )}
        </fieldset>
        <div class="primary-action-row">
          <div>
            <strong>${escapeHtml(action.title)}</strong>
            <span>${escapeHtml(
              selectedCount === 0
                ? "Select at least one supplier to continue."
                : channelAvailable
                  ? action.description
                  : `${outreachMode === "sms" ? "SMS" : "Email"} is unavailable for the selected suppliers. Choose secure link instead.`
            )}</span>
          </div>
          <button
            class="button button-primary button-large"
            type="button"
            data-send-outreach
            ${selectedCount > 0 && channelAvailable ? "" : "disabled"}
          >
            ${escapeHtml(action.label)}
          </button>
        </div>
      </section>
    </div>
  `;
}

function renderCandidate(
  data: BuyerWorkspace,
  match: SupplierCandidate,
  index: number
) {
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
        ${sourceBadge(
          supplier && "sourceMode" in supplier ? supplier.sourceMode : "fixture",
          "Live public evidence",
          supplierRecordLabel(supplier)
        )}
        <span>${escapeHtml(candidateContactReadiness(supplier))}</span>
      </div>
      <div class="candidate-section">
        <strong>Why this supplier</strong>
        ${bulletList(match.reasons.slice(0, 3), "No match explanation returned.")}
        ${
          match.reasons.length > 3
            ? `
              <details class="match-more">
                <summary>View ${match.reasons.length - 3} more match signals</summary>
                ${bulletList(match.reasons.slice(3), "No additional signals.")}
              </details>
            `
            : ""
        }
      </div>
      <div class="candidate-section">
        <strong>Risks to verify</strong>
        ${bulletList(match.risks, "No specific match risks returned.")}
      </div>
      <div class="candidate-footer">
        <span class="status-chip is-ready">${invitation ? "Link ready" : "Candidate"}</span>
        <span>${invitation ? "Private supplier workspace generated" : "Buyer approval required"}</span>
      </div>
    </article>
  `;
}

function renderOutreachMode(
  value: OutreachMode,
  label: string,
  description: string
) {
  return `
    <label class="outreach-mode ${outreachMode === value ? "is-selected" : ""}">
      <input
        type="radio"
        name="outreach-mode"
        value="${value}"
        ${outreachMode === value ? "checked" : ""}
      />
      <span>
        <strong>${escapeHtml(label)}</strong>
        <small>${escapeHtml(description)}</small>
      </span>
    </label>
  `;
}

function renderOutreach(data: BuyerWorkspace) {
  const responded = submittedResponses(data).length;
  const readyToCompare = responded >= 2;
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
        ${
          data.invitations.length
            ? `<div class="outreach-list">${data.invitations
                .map((invitation) => renderSupplierOutreach(data, invitation))
                .join("")}</div>`
            : renderInlineEmpty(
                "No invitations returned",
                "The backend did not generate supplier invitation links."
              )
        }
      </section>

      <section class="primary-action-row action-band">
        <div>
          <strong>${readyToCompare ? "Two supplier responses are ready" : "Waiting for two comparable responses"}</strong>
          <span>${readyToCompare ? "Compare the same commercial and technical fields side by side." : "Delivery and response status refresh automatically. No response is simulated in this buyer UI."}</span>
        </div>
        ${
          readyToCompare
            ? `<button class="button button-primary button-large" type="button" data-compare>Compare responses</button>`
            : `<button class="button button-primary" type="button" data-refresh-workspace>Refresh responses</button>`
        }
      </section>
    </div>
  `;
}

function renderSupplierOutreach(
  data: BuyerWorkspace,
  invitation: SupplierInvitation
) {
  const supplier = supplierFor(data, invitation.supplierId);
  const response = data.responses.find(
    (item) => item.invitationId === invitation.id
  );
  const deliveries = data.outreachDeliveries.filter(
    (item) => item.invitationId === invitation.id
  );
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
      ${
        response
          ? `<p class="response-signal"><strong>${response.decision === "can_help" ? "Can help" : "Cannot help"}</strong> Response submitted ${escapeHtml(formatTime(response.submittedAt))}</p>`
          : ""
      }
    </article>
  `;
}

function renderDelivery(
  label: "Email" | "SMS",
  delivery: SupplierOutreachDelivery | undefined
) {
  if (!delivery) {
    return `
      <div class="delivery-row">
        <span>${label}</span>
        <strong>Unavailable</strong>
        <small>${label === "SMS" ? "No SMS destination configured" : "No delivery destination returned"}</small>
      </div>
    `;
  }
  const status =
    delivery.deliveryStatus === "sent"
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
  const detail =
    delivery.deliveryStatus === "queued"
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

function renderComparison(data: BuyerWorkspace) {
  const responses = submittedResponses(data);
  const selectable = responses.filter(isSelectableSupplierResponse);
  const hasMinimum = responses.length >= 2;
  const selected = selectable.find((item) => item.id === selectedResponseId);
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
        ${
          hasMinimum
            ? `<p class="section-intro">Every response uses the same decision fields. Select one credible supplier to create a single engagement.</p>`
            : `
              <div class="warning-strip">
                <strong>A second response is still required for comparison.</strong>
                <span>Open another secure supplier link and submit its response. The buyer UI will not manufacture one.</span>
              </div>
            `
        }
        ${
          responses.length
            ? `<div class="response-grid">${responses
                .map((response) => renderResponseCard(data, response))
                .join("")}</div>`
            : renderInlineEmpty(
                "No submitted responses",
                "Return to outreach and use the secure supplier links."
              )
        }
      </section>

      <section class="primary-action-row action-band">
        <div>
          <strong>${selected ? `${renderCompanyIdentity(supplierName(supplierFor(data, selected.supplierId), selected.supplierId), true)} selected` : "Choose one supplier response"}</strong>
          <span>Selection creates the engagement. It does not mark payment complete or secure the supplier.</span>
        </div>
        ${
          hasMinimum
            ? `<button class="button button-primary button-large" type="button" data-select-supplier ${selected ? "" : "disabled"}>Select supplier</button>`
            : `<button class="button button-primary" type="button" data-back-outreach>Return to outreach</button>`
        }
      </section>
    </div>
  `;
}

function renderResponseCard(
  data: BuyerWorkspace,
  response: SupplierResponse
) {
  const supplier = supplierFor(data, response.supplierId);
  const match = matchForSupplier(data, response.supplierId);
  const canHelp = response.decision === "can_help";
  const validPrice = (response.indicativePrice?.amount ?? 0) > 0;
  const selectable = canHelp && validPrice;
  const selected = selectable && response.id === selectedResponseId;
  return `
    <article class="response-card ${selected ? "is-selected" : ""} ${selectable ? "" : canHelp ? "is-invalid" : "is-declined"}">
      <label class="response-select">
        <input
          type="radio"
          name="supplier-response"
          value="${escapeHtml(response.id)}"
          ${selected ? "checked" : ""}
          ${selectable ? "" : "disabled"}
        />
        <span>
          <strong>${renderCompanyIdentity(supplierName(supplier, response.supplierId), true)}</strong>
          <small>${selectable ? "Available for selection" : canHelp ? "Invalid price — unavailable" : "Cannot help"}</small>
        </span>
        <span class="match-score">${match ? `${Math.round(match.score)}%` : "N/A"}</span>
      </label>
      <dl class="comparison-facts">
        ${comparisonFact("Availability", response.availability ?? "Not provided", !response.availability)}
        ${comparisonFact(
          "Price",
          response.indicativePrice
            ? money(
                response.indicativePrice.amount,
                response.indicativePrice.currency
              )
            : "Not provided",
          !validPrice
        )}
        ${comparisonFact(
          "Technical fit",
          match?.reasons.slice(0, 3).join("; ") ??
            "No match rationale returned",
          !match
        )}
        ${comparisonFact(
          "Experience",
          response.relevantExperience ?? "Not provided",
          !response.relevantExperience
        )}
        ${comparisonFact(
          "Proposed approach",
          response.proposedApproach ?? "Not provided in this response",
          !response.proposedApproach
        )}
        ${comparisonFact(
          "Assumptions",
          response.assumptions?.join("; ") ?? "Not provided",
          !response.assumptions?.length
        )}
        ${comparisonFact(
          "Conditions",
          response.conditions.length
            ? response.conditions.join("; ")
            : "No conditions supplied",
          !response.conditions.length
        )}
      </dl>
    </article>
  `;
}

function renderSelected(data: BuyerWorkspace) {
  const selection = selectedSupplier(data);
  if (!selection || !data.engagement) {
    return renderUnavailable(
      "Selected supplier unavailable",
      "The backend engagement does not resolve to a submitted supplier response.",
      "Refresh selection",
      "refresh-workspace"
    );
  }
  return `
    <section class="panel selection-panel">
      <div class="success-mark" aria-hidden="true">OK</div>
      <p class="eyebrow">Deploy / Supplier selected</p>
      <h2>${renderCompanyIdentity(supplierName(selection.supplier, selection.response.supplierId), true)}</h2>
      <p class="terminal-copy">The engagement exists, but the supplier is not secured until payment evidence is confirmed by the backend.</p>
      <dl class="selection-summary">
        ${fact("Availability", selection.response.availability ?? "Not provided", !selection.response.availability)}
        ${fact(
          "Indicative price",
          selection.response.indicativePrice
            ? money(
                selection.response.indicativePrice.amount,
                selection.response.indicativePrice.currency
              )
            : "Not provided",
          !selection.response.indicativePrice
        )}
        ${fact("Engagement", shortId(data.engagement.id))}
        ${fact("Payment", statusLabel(data.engagement.paymentStatus))}
      </dl>
      <div class="primary-action-row">
        <div>
          <strong>Create a hosted commitment</strong>
          <span>The API uses the configured payment provider and returns its hosted link. Payment remains pending until backend evidence is confirmed.</span>
        </div>
        <button class="button button-primary button-large" type="button" data-create-payment>Create payment link</button>
      </div>
    </section>
  `;
}

function hostedPaymentKind(value?: string) {
  if (!value) return "uncreated" as const;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) {
      return "hosted" as const;
    }
    const paymentLinkId = url.searchParams.get("payment_link_id");
    if (
      url.searchParams.get("payment_provider") === "local_demo" &&
      paymentLinkId?.startsWith("local_demo_link_")
    ) {
      return "local_demo" as const;
    }
    if (
      url.protocol === "https:" &&
      (url.hostname === "getpinch.com.au" ||
        url.hostname.endsWith(".getpinch.com.au"))
    ) {
      return "pinch" as const;
    }
    return "hosted" as const;
  } catch {
    return "hosted" as const;
  }
}

function paymentLinkPresentation(hostedUrl?: string) {
  const kind = hostedPaymentKind(hostedUrl);
  if (kind === "local_demo") {
    return {
      kind,
      eyebrow: "Deploy / Local demo commitment",
      intro:
        "This development-only link returns to Veltact without taking payment. The engagement remains pending until explicit local demo evidence is recorded.",
      summaryLabel: "Demo return",
      summaryValue: "Synthetic local link",
      boundaryTitle: "Synthetic local return",
      boundaryCopy:
        "Opening this link does not contact Pinch or complete payment. It creates no provider approval or authoritative payment evidence.",
      actionTitle: "Open the synthetic local return",
      actionCopy:
        "Development only. No money moves and the engagement remains awaiting payment.",
      openLabel: "Open local demo return",
      readyMessage: "Local demo return link is ready."
    };
  }
  if (kind === "pinch") {
    return {
      kind,
      eyebrow: "Deploy / Pinch commitment",
      intro:
        "Payment remains pending until Pinch returns authoritative evidence to the API.",
      summaryLabel: "Pinch link",
      summaryValue: "Created by API",
      boundaryTitle: "Backend-confirmed payment only",
      boundaryCopy:
        "Opening checkout does not change payment status. The buyer workspace refreshes the engagement record to confirm Pinch evidence.",
      actionTitle: "Complete the commitment in Pinch",
      actionCopy: "Pinch checkout opens in a separate secure tab.",
      openLabel: "Open Pinch payment",
      readyMessage: "Pinch checkout is ready."
    };
  }
  if (kind === "hosted") {
    return {
      kind,
      eyebrow: "Deploy / Hosted commitment",
      intro:
        "Payment remains pending until the configured provider returns authoritative evidence to the API.",
      summaryLabel: "Hosted link",
      summaryValue: "Created by API",
      boundaryTitle: "Provider confirmation required",
      boundaryCopy:
        "Opening the hosted link does not change payment status. The buyer workspace refreshes the engagement record for provider evidence.",
      actionTitle: "Complete the hosted commitment",
      actionCopy: "The configured provider opens in a separate secure tab.",
      openLabel: "Open hosted payment",
      readyMessage: "Hosted payment link is ready."
    };
  }
  return {
    kind,
    eyebrow: "Deploy / Hosted commitment",
    intro:
      "Payment remains pending until the configured provider returns authoritative evidence to the API.",
    summaryLabel: "Hosted link",
    summaryValue: "Not created",
    boundaryTitle: "Backend-confirmed payment only",
    boundaryCopy:
      "Creating or opening a hosted link does not change payment status. The buyer workspace waits for provider evidence.",
    actionTitle: "Create a hosted payment link",
    actionCopy: "The configured payment provider must return a hosted URL.",
    openLabel: "Create payment link",
    readyMessage: "The API did not return a hosted payment link."
  };
}

function renderPayment(data: BuyerWorkspace): string {
  const engagement = data.engagement;
  if (!engagement) {
    return renderUnavailable(
      "Payment unavailable",
      "Select a submitted supplier response before creating a commitment."
    );
  }
  const secured = engagement.status === "supplier_secured";
  if (secured) {
    view = "deployment";
    persistContext();
    return renderDeployment(data);
  }
  const hostedUrl = engagement.hostedCheckoutUrl;
  const paymentPresentation = paymentLinkPresentation(hostedUrl);
  const profile = requireNeedProfile(data);
  const commitmentAmount =
    data.deployment?.milestones[0]?.amount ??
    selectedSupplier(data)?.response.indicativePrice ??
    profile.budget;
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
        ${fact(
          "Commitment amount",
          commitmentAmount
            ? money(commitmentAmount.amount, commitmentAmount.currency)
            : "Set by payment provider",
          !commitmentAmount
        )}
        ${fact("Supplier", supplierName(supplierFor(data, engagement.supplierId), engagement.supplierId))}
        ${fact("Engagement", shortId(engagement.id))}
        ${fact(
          paymentPresentation.summaryLabel,
          paymentPresentation.summaryValue,
          !hostedUrl
        )}
      </dl>
      <div class="payment-boundary">
        <strong>${escapeHtml(paymentPresentation.boundaryTitle)}</strong>
        <span>${escapeHtml(paymentPresentation.boundaryCopy)}</span>
      </div>
      <div class="primary-action-row">
        <div>
          <strong>${escapeHtml(paymentPresentation.actionTitle)}</strong>
          <span>${escapeHtml(paymentPresentation.actionCopy)}</span>
        </div>
        ${
          hostedUrl
            ? `<a class="button button-primary button-large" href="${safeHttpUrl(hostedUrl)}" target="_blank" rel="noreferrer">${escapeHtml(paymentPresentation.openLabel)}</a>`
            : `<button class="button button-primary button-large" type="button" data-create-payment>${escapeHtml(paymentPresentation.openLabel)}</button>`
        }
      </div>
      <div class="secondary-actions">
        <button class="button button-secondary" type="button" data-refresh-payment>Check payment status</button>
      </div>
      ${
        localDemoPaymentAvailable &&
        hostedPaymentKind(hostedUrl) === "local_demo"
          ? `
            <details class="developer-utility" open>
              <summary>Local demo payment utility</summary>
              <p>This calls the backend demo-payment route. It is unavailable in production and remains distinct from live Pinch evidence.</p>
              <button class="button button-quiet" type="button" data-demo-payment>Record local demo payment</button>
            </details>
          `
          : ""
      }
    </section>
  `;
}

function eligibleDeploymentTransition(
  deployment: NonNullable<BuyerWorkspace["deployment"]>
) {
  const milestones = [...deployment.milestones].sort(
    (left, right) => left.sequence - right.sequence
  );
  const index = milestones.findIndex(
    (milestone) => milestone.status !== "completed"
  );
  if (index < 0) return undefined;
  const milestone = milestones[index];
  if (!milestone) return undefined;
  if (milestone.status === "in_progress") {
    return { milestone, nextStatus: "completed" as const };
  }
  const previous = index > 0 ? milestones[index - 1] : undefined;
  if (
    milestone.status === "funded" ||
    (milestone.status === "not_started" &&
      previous?.status === "completed")
  ) {
    return { milestone, nextStatus: "in_progress" as const };
  }
  return undefined;
}

function deploymentMilestoneTitle(
  milestone: NonNullable<BuyerWorkspace["deployment"]>["milestones"][number],
  profile: NeedProfile
) {
  const robotics = /robot|palletis|cobot/i.test(
    `${profile.title} ${profile.description} ${profile.category}`
  );
  if (
    robotics &&
    milestone.sequence === 1 &&
    /site assessment|scoping/i.test(milestone.title)
  ) {
    return "Site Assessment / Scoping Visit";
  }
  return milestone.title;
}

function renderMilestoneUpdate(
  deployment: NonNullable<BuyerWorkspace["deployment"]>
) {
  if (deployment.status === "completed") return "";
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

function deploymentPaymentEvidence(
  engagement: NonNullable<BuyerWorkspace["engagement"]>
) {
  const explicitKind =
    engagement.paymentEvidenceProvider === "local_demo" ||
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
  const legacyLocalDemoPaymentId =
    !explicitKind && engagement.pinchPaymentId?.startsWith("demo_")
      ? engagement.pinchPaymentId
      : undefined;
  const kind =
    explicitKind ?? (legacyLocalDemoPaymentId ? "local_demo" : undefined);
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

function renderDeployment(data: BuyerWorkspace): string {
  const engagement = data.engagement;
  if (!engagement) {
    return renderUnavailable(
      "Deployment unavailable",
      "No supplier engagement exists for this Need Profile."
    );
  }
  if (engagement.status !== "supplier_secured") {
    view = "payment";
    return renderPayment(data);
  }
  const deployment = data.deployment;
  const profile = requireNeedProfile(data);
  const supplier = supplierFor(data, engagement.supplierId);
  const paymentEvidence = deploymentPaymentEvidence(engagement);
  const paymentEvidenceValue = paymentEvidence.evidenceId
    ? shortId(paymentEvidence.evidenceId)
    : paymentEvidence.authoritative
      ? paymentEvidence.source === "pinch_webhook"
        ? "Pinch webhook confirmed"
        : paymentEvidence.source === "pinch_reconciliation"
          ? "Pinch reconciliation confirmed"
          : "Provider confirmation recorded"
      : paymentEvidence.localDemo
        ? "Local demo record"
        : "Provider confirmation recorded";
  const projection = Boolean(
    deployment?.milestones.some((item) => item.id.includes("fixture"))
  );
  const milestones = deployment
    ? [...deployment.milestones].sort(
        (left, right) => left.sequence - right.sequence
      )
    : [];
  const currentMilestone =
    milestones.find(
      (milestone) => milestone.id === deployment?.currentMilestoneId
    ) ??
    milestones.find((milestone) => milestone.status !== "completed") ??
    milestones.at(-1);
  const nextMilestone =
    milestones.find(
      (milestone) => milestone.id === deployment?.nextMilestoneId
    ) ??
    milestones.find(
      (milestone) =>
        currentMilestone && milestone.sequence > currentMilestone.sequence
    );
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
          <p class="eyebrow">Deploy / Site Assessment project</p>
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
        ${fact(paymentEvidence.localDemo ? "Development evidence" : "Payment evidence", paymentEvidenceValue, false)}
      </dl>
      ${
        paymentEvidence.localDemo
          ? `
            <div class="payment-boundary">
              <strong>Development evidence</strong>
              <span>This secured state was created by the local demo route${paymentEvidence.evidenceId ? ` using evidence ${escapeHtml(paymentEvidence.evidenceId)}` : ""}. It is non-authoritative and is not a Pinch webhook confirmation.${paymentEvidence.legacyFallback ? " This record uses the legacy demo-ID fallback." : ""}</span>
            </div>
          `
          : ""
      }
      ${
        deployment
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
                .map(
                  (milestone) => `
                    <li class="is-${milestone.status}">
                      <span class="milestone-index">${milestone.sequence}</span>
                      <span>
                        <strong>${escapeHtml(deploymentMilestoneTitle(milestone, profile))}</strong>
                        <small>${escapeHtml(statusLabel(milestone.status))}${milestone.latestUpdate ? ` / ${escapeHtml(milestone.latestUpdate)}` : ""}</small>
                      </span>
                      <span class="milestone-progress">${milestone.progressPercentage}%</span>
                    </li>
                  `
                )
                .join("")}
            </ol>
            ${
              projection
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
                `
            }
          `
          : `
            <div class="warning-strip">
              <strong>Delivery projection unavailable</strong>
              <span>Supplier secured is authoritative. Engineering progress is not inferred from payment.</span>
            </div>
          `
      }
      <div class="primary-action-row">
        <div>
          <strong>${deployment?.status === "completed" ? "Delivery record complete" : "Keep Site Assessment status current"}</strong>
          <span>Refreshes authoritative payment and deployment records. Payment never marks engineering work complete.</span>
        </div>
        ${
          deployment?.status === "completed"
            ? `<button class="button button-primary" type="button" data-start-new>Start new requirement</button>`
            : `
              <div class="outcome-actions">
                <button class="button button-secondary" type="button" data-refresh-deployment>Refresh deployment</button>
                <button class="button button-quiet" type="button" data-start-new>Start new requirement</button>
              </div>
            `
        }
      </div>
    </section>
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

function renderUnavailable(
  title: string,
  body: string,
  actionLabel?: string,
  action?: string
) {
  return `
    <section class="panel unavailable-panel">
      <p class="eyebrow">Unavailable</p>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(body)}</p>
      ${
        actionLabel && action
          ? `<button class="button button-primary" type="button" data-${action}>${escapeHtml(actionLabel)}</button>`
          : ""
      }
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
  const requirementForm =
    document.querySelector<HTMLFormElement>("#requirement-form");
  requirementForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    syncIntakeDraft(requirementForm);
    if (intakeMode === "ai" && !aiIntakeResult) {
      void structureRequirement(requirementForm);
      return;
    }
    void analyseRequirement();
  });

  const milestoneForm = document.querySelector<HTMLFormElement>(
    "#deployment-milestone-form"
  );
  milestoneForm
    ?.querySelector<HTMLTextAreaElement>("textarea[name='latestUpdate']")
    ?.addEventListener("input", (event) => {
      milestoneUpdateDraft = (event.currentTarget as HTMLTextAreaElement).value;
    });
  milestoneForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!milestoneForm.reportValidity()) return;
    void updateDeploymentMilestone(milestoneForm);
  });

  document.querySelectorAll<HTMLButtonElement>("[data-intake-mode]").forEach(
    (button) => {
      button.addEventListener("click", () => {
        if (requirementForm) syncIntakeDraft(requirementForm);
        intakeMode = button.dataset.intakeMode === "manual" ? "manual" : "ai";
        loadState = "idle";
        errorMessage = "";
        render();
      });
    }
  );

  document.querySelectorAll<HTMLButtonElement>("[data-demo]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!demoControlsAvailable) return;
      const robotics = button.dataset.demo === "robotics";
      loadDemo(robotics ? roboticsDemoInput : plcDemoInput, robotics);
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-priority]").forEach(
    (button) => {
      button.addEventListener("click", () => {
        if (requirementForm) syncIntakeDraft(requirementForm);
        const next = button.dataset.priority as PrioritySignal;
        if (priorities.has(next)) priority = next;
        render();
      });
    }
  );

  document
    .querySelector<HTMLInputElement>("input[name='pdfEvidence']")
    ?.addEventListener("change", (event) => {
      void addEvidenceFromInput(event.currentTarget as HTMLInputElement, "pdf");
    });
  document
    .querySelector<HTMLInputElement>("input[name='photoEvidence']")
    ?.addEventListener("change", (event) => {
      void addEvidenceFromInput(event.currentTarget as HTMLInputElement, "photo");
    });

  document
    .querySelectorAll<HTMLButtonElement>("[data-remove-evidence]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        if (requirementForm) syncIntakeDraft(requirementForm);
        const index = Number(button.dataset.removeEvidence);
        intakeEvidence = intakeEvidence.filter((_, itemIndex) => itemIndex !== index);
        aiIntakeResult = undefined;
        render();
      });
    });

  document
    .querySelectorAll<HTMLInputElement>("input[name='solution-pathway']")
    .forEach((radio) => {
      radio.addEventListener("change", () => {
        selectedApproachId = radio.value;
        persistContext();
        render();
      });
    });

  document
    .querySelectorAll<HTMLInputElement>("[data-candidate-id]")
    .forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const supplierId = checkbox.dataset.candidateId;
        if (!supplierId) return;
        if (checkbox.checked) {
          selectedCandidateIds.add(supplierId);
        } else {
          selectedCandidateIds.delete(supplierId);
        }
        persistContext();
        render();
      });
    });

  document
    .querySelectorAll<HTMLInputElement>("input[name='outreach-mode']")
    .forEach((radio) => {
      radio.addEventListener("change", () => {
        const next = radio.value as OutreachMode;
        if (next === "email" || next === "sms" || next === "link") {
          outreachMode = next;
          persistContext();
          render();
        }
      });
    });

  bindClick("[data-retry-research]", retryResearch);
  bindClick("[data-download-report]", downloadReport);
  bindClick("[data-find-suppliers]", findSpecialist);
  bindClick("[data-refresh-workspace]", refreshWorkspace);
  bindClick("[data-send-outreach]", sendOutreach);
  bindClick("[data-compare]", () => {
    view = "compare";
    persistContext();
    render();
  });
  bindClick("[data-back-outreach]", () => {
    view = "outreach";
    persistContext();
    render();
  });
  bindClick("[data-select-supplier]", selectSupplier);
  bindClick("[data-create-payment]", createPayment);
  bindClick("[data-refresh-payment]", refreshPayment);
  bindClick("[data-demo-payment]", completeDemoPayment);
  bindClick("[data-refresh-deployment]", refreshDeployment);
  bindClick("[data-start-new]", startNewRequirement);

  document
    .querySelectorAll<HTMLInputElement>("input[name='supplier-response']")
    .forEach((radio) => {
      radio.addEventListener("change", () => {
        selectedResponseId = radio.value;
        persistContext();
        render();
      });
    });

  document
    .querySelectorAll<HTMLButtonElement>("[data-copy-link]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const url = button.dataset.copyLink;
        if (!url) return;
        void copyText(url).then(() => {
          showLiveMessage("Secure supplier link copied.");
        });
      });
    });
}

async function structureRequirement(form: HTMLFormElement) {
  syncIntakeDraft(form);
  await runAction("Structuring supplier requirement", async () => {
    const result = await aiIntakeService.structureRequirement({
      rawRequirement: intakeDraft.description,
      evidence: intakeEvidence
    });
    aiIntakeResult = result;
    intakeSourceMode = aiIntakeService.sourceMode();
    applyStructuredResult(result);
    liveMessage =
      intakeSourceMode === "live"
        ? "OpenAI returned a structured draft. Review every field."
        : "Local adapter returned a structured draft. Review every field.";
  });
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
    const created = await service.createNeedProfile(
      intakeDraft,
      priority,
      intakeEvidenceSummaries()
    );
    workspace = created.workspace;
    const needProfile = requireNeedProfile(workspace);
    if (created.buyerAccessToken) {
      saveBuyerToken(needProfile.id, created.buyerAccessToken);
      service.setBuyerAccessToken(needProfile.id, created.buyerAccessToken);
    }
    setNeedProfileUrl(needProfile.id);
    workspace = await service.researchRequirement(workspace);
    selectedApproachId = resolveSelectedApproachId(
      workspace.researchResult,
      selectedApproachId
    );
    view = "plan";
    persistContext();
    liveMessage = "Need Profile created. Review the cited plan before continuing.";
  });
}

async function retryResearch() {
  if (!workspace) return;
  await runAction("Analysing requirement", async () => {
    workspace = await service.researchRequirement(workspace as BuyerWorkspace);
    selectedApproachId = resolveSelectedApproachId(
      workspace.researchResult,
      selectedApproachId
    );
    view = "plan";
    persistContext();
  });
}

async function downloadReport() {
  if (!workspace || !selectedApproachId) return;
  await runAction("Preparing Need Profile report", async () => {
    const report = await service.downloadNeedReport(
      workspace as BuyerWorkspace,
      selectedApproachId
    );
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
  if (!workspace || !selectedApproachId) return;
  await runAction("Finding relevant industrial specialists", async () => {
    let next = await service.recordSolutionDecision(
      workspace as BuyerWorkspace,
      "outsource",
      selectedApproachId
    );
    next = await service.discoverSuppliers(next);
    workspace = next;
    selectedCandidateIds = new Set(
      supplierCandidates(next).map((candidate) => candidate.supplierId)
    );
    candidateSelectionInitialised = true;
    view = "candidates";
    persistContext();
    liveMessage = "Supplier candidates ready for buyer review.";
  });
}

async function sendOutreach() {
  if (!workspace || selectedCandidateIds.size === 0) return;
  const deliveryChannels: OutreachChannel[] =
    outreachMode === "link" ? [] : [outreachMode];
  const action = outreachAction(outreachMode, selectedCandidateIds.size);
  await runAction(action.loadingLabel, async () => {
    workspace = await service.sendSupplierOutreach(
      workspace as BuyerWorkspace,
      [...selectedCandidateIds],
      deliveryChannels
    );
    view = "outreach";
    persistContext();
    liveMessage =
      outreachMode === "link"
        ? "Secure supplier links are ready. Delivery records below remain authoritative."
        : `${outreachMode === "sms" ? "SMS" : "Email"} delivery requested. Status reflects backend confirmation.`;
  });
}

async function refreshWorkspace() {
  if (!workspace) return;
  await runAction("Refreshing supplier activity", async () => {
    workspace = await service.refreshWorkspace(workspace as BuyerWorkspace);
    selectedResponseId =
      workspace.engagement?.supplierResponseId || selectedResponseId;
    if (workspace.engagement) {
      view = workspace.engagement.hostedCheckoutUrl ? "payment" : "selected";
    } else if (
      submittedResponses(workspace).length >= 2 &&
      view !== "candidates"
    ) {
      view = "compare";
    }
    persistContext();
  });
}

async function selectSupplier() {
  if (!workspace || !selectedResponseId) return;
  const response = submittedResponses(workspace).find(
    (item) => item.id === selectedResponseId
  );
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
    workspace = await service.selectSupplier(
      workspace as BuyerWorkspace,
      selectedResponseId
    );
    view = "selected";
    persistContext();
    liveMessage =
      "Supplier selected. Payment is still required to secure the engagement.";
  });
}

async function createPayment() {
  if (!workspace) return;
  await runAction("Creating hosted payment link", async () => {
    workspace = await service.createPaymentLink(workspace as BuyerWorkspace);
    view = "payment";
    persistContext();
    liveMessage = paymentLinkPresentation(
      workspace.engagement?.hostedCheckoutUrl
    ).readyMessage;
  });
}

async function refreshPayment() {
  if (!workspace?.engagement) return;
  await runAction("Checking authoritative payment status", async () => {
    workspace = await service.refreshEngagement(workspace as BuyerWorkspace);
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
  if (!workspace?.engagement || !localDemoPaymentAvailable) return;
  await runAction("Recording local demo payment evidence", async () => {
    workspace = await service.completeDemoPayment(workspace as BuyerWorkspace);
    view = "deployment";
    persistContext();
    liveMessage =
      "Local demo payment recorded as non-authoritative development evidence.";
  });
}

async function refreshDeployment() {
  if (!workspace?.engagement) return;
  await runAction("Refreshing deployment summary", async () => {
    workspace = await service.refreshEngagement(workspace as BuyerWorkspace);
    view =
      workspace.engagement?.status === "supplier_secured"
        ? "deployment"
        : "payment";
    persistContext();
  });
}

async function updateDeploymentMilestone(form: HTMLFormElement) {
  if (!workspace?.engagement || !workspace.deployment) return;
  const milestoneId = form.dataset.milestoneId;
  const nextStatus = form.dataset.nextStatus;
  const latestUpdate = formValue(new FormData(form), "latestUpdate");
  if (
    !milestoneId ||
    !["in_progress", "completed"].includes(nextStatus ?? "") ||
    !latestUpdate
  ) {
    loadState = "error";
    errorMessage = "A milestone and latest delivery update are required.";
    render();
    return;
  }
  const status =
    nextStatus as "in_progress" | "completed";
  await runAction(
    status === "completed"
      ? "Completing delivery milestone"
      : "Starting delivery milestone",
    async () => {
      workspace = await service.updateDeploymentMilestone(
        workspace as BuyerWorkspace,
        milestoneId,
        status,
        latestUpdate
      );
      milestoneUpdateDraft = "";
      view = "deployment";
      persistContext();
      liveMessage =
        status === "completed"
          ? "Delivery milestone completed. Payment evidence was not changed."
          : "Delivery milestone started. Payment evidence was not changed.";
    }
  );
}

async function runAction(label: string, action: () => Promise<void>) {
  loadState = "loading";
  loadingLabel = label;
  errorMessage = "";
  liveMessage = "";
  render();
  try {
    await action();
    loadState = "success";
  } catch (error) {
    loadState = "error";
    errorMessage = errorText(error);
  }
  render();
}

function configurePolling() {
  const needProfileId = workspace?.needProfile?.id;
  const shouldPoll =
    Boolean(needProfileId) &&
    (view === "outreach" || view === "payment" || view === "deployment");
  const nextKey = shouldPoll ? `${needProfileId}:${view}` : "";
  if (nextKey === pollKey) return;
  if (pollHandle !== undefined) {
    window.clearInterval(pollHandle);
    pollHandle = undefined;
  }
  pollKey = nextKey;
  if (!shouldPoll) return;
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
  if (joinedNeedProfileId === needProfileId) return;
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

async function initialiseRealtimeSocket(needProfileId: string) {
  if (realtimeClientLoading) {
    await realtimeClientLoading;
  } else if (!socketWindow.io) {
    realtimeClientLoading = loadRealtimeClient();
    await realtimeClientLoading;
  }
  if (!socketWindow.io) return;
  if (realtimeSocket) {
    configureRealtime();
    return;
  }

  realtimeSocket = socketWindow.io(realtimeOrigin, {
    transports: ["websocket"],
    reconnection: true
  });
  realtimeSocket.on(rapidMatchSocketEvent.invitationSent, (payload) => {
    if (payload.needProfileId !== workspace?.needProfile?.id) return;
    const message =
      payload.supplierInvitation?.status === "opened"
        ? "Live update: supplier opened the opportunity link."
        : "Live supplier invitation status updated.";
    void refreshRealtimeState(message);
  });
  realtimeSocket.on(
    rapidMatchSocketEvent.outreachDeliveryUpdated,
    (payload) => {
      if (payload.needProfileId !== workspace?.needProfile?.id) return;
      const channel =
        payload.outreachDelivery?.channel?.toUpperCase() ?? "Outreach";
      const status =
        payload.outreachDelivery?.deliveryStatus?.replaceAll("_", " ") ??
        "updated";
      void refreshRealtimeState(
        `Live update: ${channel} delivery ${status}.`
      );
    }
  );
  realtimeSocket.on(
    rapidMatchSocketEvent.supplierResponseSubmitted,
    (payload) => {
      if (payload.needProfileId !== workspace?.needProfile?.id) return;
      void refreshRealtimeState(
        payload.supplierResponse?.decision === "cannot_help"
          ? "Live update: supplier declined this opportunity."
          : "Live update: supplier submitted a response."
      );
    }
  );
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
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${realtimeOrigin}/socket.io/socket.io.js`;
    script.async = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Unable to load realtime client.")),
      { once: true }
    );
    document.head.append(script);
  }).catch(() => {
    realtimeClientLoading = undefined;
  });
}

function leaveRealtimeNeed() {
  if (!realtimeSocket || !joinedNeedProfileId) return;
  realtimeSocket.emit(rapidMatchSocketEvent.leaveNeedProfile, {
    needProfileId: joinedNeedProfileId
  });
  joinedNeedProfileId = "";
}

function milestoneUpdateFormHasFocus() {
  return (
    document.activeElement instanceof HTMLElement &&
    Boolean(
      document.activeElement.closest("#deployment-milestone-form")
    )
  );
}

async function refreshRealtimeState(message: string) {
  if (!workspace || isPolling || loadState === "loading") return;
  const activeWorkspace = workspace;
  const activeEpoch = workspaceEpoch;
  isPolling = true;
  try {
    const refreshedWorkspace = activeWorkspace.engagement
      ? await service.refreshEngagement(activeWorkspace)
      : await service.refreshWorkspace(activeWorkspace);
    if (
      !isCurrentWorkspaceRefresh(
        activeWorkspace,
        activeEpoch,
        workspace,
        workspaceEpoch
      )
    ) {
      return;
    }
    workspace = refreshedWorkspace;
    selectedResponseId =
      workspace.engagement?.supplierResponseId || selectedResponseId;
    if (workspace.engagement?.status === "supplier_secured") {
      view = "deployment";
    }
    liveMessage = message;
    persistContext();
    if (!milestoneUpdateFormHasFocus()) render();
  } catch {
    // Scheduled polling and explicit refresh remain available if realtime fails.
  } finally {
    isPolling = false;
  }
}

async function pollWorkspace() {
  if (!workspace || isPolling || loadState === "loading") return;
  const activeWorkspace = workspace;
  const activeEpoch = workspaceEpoch;
  isPolling = true;
  try {
    const previousResponses = submittedResponses(activeWorkspace).length;
    const previousStatus = activeWorkspace.engagement?.status;
    const refreshedWorkspace = activeWorkspace.engagement
      ? await service.refreshEngagement(activeWorkspace)
      : await service.refreshWorkspace(activeWorkspace);
    if (
      !isCurrentWorkspaceRefresh(
        activeWorkspace,
        activeEpoch,
        workspace,
        workspaceEpoch
      )
    ) {
      return;
    }
    workspace = refreshedWorkspace;
    const nextResponses = submittedResponses(workspace).length;
    if (workspace.engagement?.status === "supplier_secured") {
      view = "deployment";
    }
    if (nextResponses > previousResponses) {
      showLiveMessage(
        `${nextResponses} supplier response${nextResponses === 1 ? "" : "s"} received.`
      );
    } else if (
      previousStatus !== "supplier_secured" &&
      workspace.engagement?.status === "supplier_secured"
    ) {
      showLiveMessage("Payment confirmed. Supplier secured.");
    } else {
      persistContext();
      if (!milestoneUpdateFormHasFocus()) render();
    }
  } catch {
    // Polling stays silent. Explicit refresh surfaces actionable API errors.
  } finally {
    isPolling = false;
  }
}

function isCurrentWorkspaceRefresh(
  activeWorkspace: BuyerWorkspace,
  activeEpoch: number,
  currentWorkspace: BuyerWorkspace | undefined,
  currentEpoch: number
) {
  return (
    activeEpoch === currentEpoch &&
    activeWorkspace === currentWorkspace
  );
}

function loadDemo(input: BuyerRequirementInput, robotics: boolean) {
  intakeDraft = cloneInput(input);
  priority = robotics ? "technical_fit" : "speed";
  intakeMode = "ai";
  aiIntakeResult = undefined;
  intakeSourceMode = "fixture";
  selectedApproachId = "";
  selectedCandidateIds = new Set();
  candidateSelectionInitialised = false;
  outreachMode = "email";
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
  render();
}

async function addEvidenceFromInput(
  input: HTMLInputElement,
  fallbackKind: "pdf" | "photo"
) {
  const form = input.form;
  if (form) syncIntakeDraft(form);
  const file = input.files?.[0];
  if (!file) return;
  loadState = "loading";
  loadingLabel = `Reading ${file.name}`;
  render();
  try {
    const evidence = await evidenceFromFile(file, fallbackKind);
    intakeEvidence = [
      ...intakeEvidence.filter(
        (item) => !(item.kind === evidence.kind && item.name === evidence.name)
      ),
      evidence
    ];
    aiIntakeResult = undefined;
    loadState = "idle";
    liveMessage = `${file.name} attached for intake structuring.`;
  } catch (error) {
    loadState = "error";
    errorMessage = errorText(error);
  }
  render();
}

async function evidenceFromFile(
  file: File,
  fallbackKind: "pdf" | "photo"
): Promise<IntakeEvidence> {
  const maximumBytes = 4 * 1024 * 1024;
  if (file.size > maximumBytes) {
    throw new Error(
      `${file.name} is larger than 4 MB. Use a smaller PDF or photo for this demo.`
    );
  }
  const kind: IntakeEvidence["kind"] = file.type.startsWith("image/")
    ? "photo"
    : file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf")
      ? "pdf"
      : fallbackKind;
  if (
    kind === "photo" &&
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  ) {
    throw new Error("Use a JPG, PNG or WebP photo.");
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
      } else {
        reject(new Error("Unable to read the selected evidence file."));
      }
    });
    reader.addEventListener("error", () => {
      reject(new Error("Unable to read the selected evidence file."));
    });
    reader.readAsDataURL(file);
  });
}

function applyStructuredResult(result: AiIntakeResult) {
  const profile = result.generatedProfile;
  intakeDraft = {
    ...intakeDraft,
    title: profile.title,
    description: profile.problemSummary,
    category: profile.category,
    equipmentOrTechnology: profile.equipmentOrTechnology,
    requiredCapabilities: profile.requiredCapabilities,
    location: profile.location ?? intakeDraft.location,
    requiredBy: profile.urgency ?? intakeDraft.requiredBy,
    budgetRange: profile.budgetRange ?? intakeDraft.budgetRange,
    budgetAmount: parseBudgetAmount(
      profile.budgetRange ?? intakeDraft.budgetRange
    ),
    constraints: profile.certificationsOrConstraints
  };
  if (profile.buyerPriority) priority = profile.buyerPriority;
}

function syncIntakeDraft(form: HTMLFormElement) {
  const formData = new FormData(form);
  intakeDraft = {
    companyName: formValue(formData, "companyName"),
    contactName: formValue(formData, "contactName"),
    contactEmail: formValue(formData, "contactEmail"),
    title:
      formValue(formData, "title") ||
      titleFromDescription(formValue(formData, "description")),
    description: formValue(formData, "description"),
    category: formValue(formData, "category"),
    equipmentOrTechnology: csvValues(formData, "equipmentOrTechnology"),
    requiredCapabilities: csvValues(formData, "requiredCapabilities"),
    location: formValue(formData, "location"),
    requiredBy: formValue(formData, "requiredBy"),
    budgetRange: formValue(formData, "budgetRange"),
    budgetAmount: parseBudgetAmount(formValue(formData, "budgetRange")),
    constraints: csvValues(formData, "constraints")
  };
}

function validateDraft(input: BuyerRequirementInput) {
  if (input.description.trim().length < 24) {
    return "Add a little more factory context before creating the Need Profile.";
  }
  if (!input.title) return "Add a requirement title.";
  if (!input.category) return "Add a supplier category.";
  if (!input.location) return "Add the site location. Unknown locations must not be inferred.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail)) {
    return "Add a valid buyer contact email.";
  }
  return "";
}

function intakeMissingFields() {
  const missing = (aiIntakeResult?.missingFields ?? []).filter(
    (field) => !intakeFieldResolved(field)
  );
  if (!intakeDraft.location) missing.push("location");
  if (!intakeDraft.requiredBy) missing.push("urgency");
  if (!intakeDraft.budgetRange) missing.push("budget or callout tolerance");
  if (!intakeDraft.equipmentOrTechnology.length) {
    missing.push("equipment or technology");
  }
  if (!intakeDraft.requiredCapabilities.length) {
    missing.push("required supplier capabilities");
  }
  if (!intakeDraft.contactEmail) missing.push("buyer contact email");
  if (intakeSourceMode === "fixture" && aiIntakeResult) {
    if (
      intakeEvidence.some(
        (item) =>
          item.kind === "photo" &&
          !item.extractedText
      )
    ) {
      missing.push("photo visual interpretation (live AI required)");
    }
    if (
      intakeEvidence.some(
        (item) =>
          item.kind === "pdf" &&
          !item.extractedText
      )
    ) {
      missing.push("PDF content interpretation (live AI required)");
    }
  }
  return uniqueStrings(missing);
}

function intakeFieldResolved(field: string) {
  const normalized = field.toLowerCase();
  if (normalized.includes("location")) return Boolean(intakeDraft.location);
  if (
    normalized.includes("urgency") ||
    normalized.includes("timing") ||
    normalized.includes("required by")
  ) {
    return Boolean(intakeDraft.requiredBy);
  }
  if (
    normalized.includes("budget") ||
    normalized.includes("callout") ||
    normalized.includes("tolerance")
  ) {
    return Boolean(intakeDraft.budgetRange);
  }
  if (
    normalized.includes("equipment") ||
    normalized.includes("technology")
  ) {
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

function intakeEvidenceSummaries(): IntakeEvidenceSummary[] {
  return intakeEvidence.map((item) => {
    const source = item.name.startsWith("Demo ")
      ? ("demo_fixture" as const)
      : ("buyer" as const);
    const processed =
      Boolean(aiIntakeResult) &&
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
  const summaries =
    workspace?.intakeEvidence.length
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
        .map(
          (item) =>
            `${item.name} (${statusLabel(item.status)}, ${statusLabel(item.source)})`
        )
        .map(escapeHtml)
        .join(" / ")}</small>
    </div>
  `;
}

function readWorkspaceIdentity() {
  const url = new URL(window.location.href);
  const explicitNeedProfileId =
    url.searchParams.get("needId") ??
    url.searchParams.get("needProfileId") ??
    undefined;
  const needProfileId = resolveRestoredNeedProfileId(
    explicitNeedProfileId,
    safeStorageGet(LAST_NEED_KEY) ?? undefined,
    safeSessionStorageGet(NEW_REQUIREMENT_KEY) === "1"
  );
  if (explicitNeedProfileId) {
    safeSessionStorageRemove(NEW_REQUIREMENT_KEY);
  }
  const incomingToken =
    url.searchParams.get("buyerToken") ??
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
    "needProfileId"
  ]) {
    url.searchParams.delete(key);
  }
  if (needProfileId) {
    url.searchParams.set("needId", needProfileId);
    safeStorageSet(LAST_NEED_KEY, needProfileId);
  }
  window.history.replaceState(
    {},
    "",
    `${url.pathname}${url.search}${url.hash}`
  );
  return {
    needProfileId,
    buyerAccessToken:
      incomingToken ??
      (needProfileId
        ? safeStorageGet(`${TOKEN_PREFIX}${needProfileId}`) ?? undefined
        : undefined)
  };
}

function resolveRestoredNeedProfileId(
  explicitNeedProfileId: string | undefined,
  lastNeedProfileId: string | undefined,
  newRequirementRequested: boolean
) {
  return (
    explicitNeedProfileId ??
    (newRequirementRequested ? undefined : lastNeedProfileId)
  );
}

function setNeedProfileUrl(needProfileId: string) {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("needId", needProfileId);
  window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  safeSessionStorageRemove(NEW_REQUIREMENT_KEY);
  safeStorageSet(LAST_NEED_KEY, needProfileId);
}

function saveBuyerToken(needProfileId: string, token: string) {
  safeStorageSet(`${TOKEN_PREFIX}${needProfileId}`, token);
}

function persistContext() {
  const current = workspace;
  const needProfileId = current?.needProfile?.id;
  if (!needProfileId || !current) return;
  const context: PersistedContext = {
    view,
    priority,
    selectedApproachId: selectedApproachId || undefined,
    selectedCandidateIds: [...selectedCandidateIds],
    outreachMode,
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

function loadContext(needProfileId: string): PersistedContext {
  const raw = safeStorageGet(`${CONTEXT_PREFIX}${needProfileId}`);
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const intakeResult = aiIntakeResultSchema.safeParse(value.intakeResult);
    const researchResult = solutionResearchResultSchema.safeParse(
      value.researchResult
    );
    const solutionDecision = solutionDecisionSchema.safeParse(
      value.solutionDecision
    );
    const evidence = intakeEvidenceSummarySchema
      .array()
      .safeParse(value.intakeEvidence);
    const storedView =
      typeof value.view === "string" && buyerViews.has(value.view as BuyerView)
        ? (value.view as BuyerView)
        : undefined;
    const storedPriority =
      typeof value.priority === "string" &&
      priorities.has(value.priority as PrioritySignal)
        ? (value.priority as PrioritySignal)
        : undefined;
    return {
      view: storedView,
      priority: storedPriority,
      selectedApproachId:
        typeof value.selectedApproachId === "string"
          ? value.selectedApproachId
          : undefined,
      selectedCandidateIds: Array.isArray(value.selectedCandidateIds)
        ? value.selectedCandidateIds.filter(
            (item): item is string => typeof item === "string"
          )
        : undefined,
      outreachMode:
        value.outreachMode === "email" ||
        value.outreachMode === "sms" ||
        value.outreachMode === "link"
          ? value.outreachMode
          : undefined,
      selectedResponseId:
        typeof value.selectedResponseId === "string"
          ? value.selectedResponseId
          : undefined,
      engagementId:
        typeof value.engagementId === "string"
          ? value.engagementId
          : undefined,
      intakeSourceMode:
        value.intakeSourceMode === "live" ||
        value.intakeSourceMode === "fixture"
          ? value.intakeSourceMode
          : undefined,
      intakeResult: intakeResult.success ? intakeResult.data : undefined,
      requirementInput: parseStoredRequirement(value.requirementInput),
      intakeEvidence: evidence.success ? evidence.data : undefined,
      researchResult: researchResult.success
        ? researchResult.data
        : undefined,
      solutionDecision: solutionDecision.success
        ? solutionDecision.data
        : undefined
    };
  } catch {
    return {};
  }
}

function parseStoredRequirement(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Partial<BuyerRequirementInput>;
  if (
    typeof input.description !== "string" ||
    typeof input.title !== "string"
  ) {
    return undefined;
  }
  return {
    companyName: stringValue(input.companyName),
    contactName: stringValue(input.contactName),
    contactEmail: stringValue(input.contactEmail),
    title: input.title,
    description: input.description,
    category: stringValue(input.category),
    equipmentOrTechnology: stringArray(input.equipmentOrTechnology),
    requiredCapabilities: stringArray(input.requiredCapabilities),
    location: stringValue(input.location),
    requiredBy: stringValue(input.requiredBy),
    budgetRange: stringValue(input.budgetRange),
    budgetAmount:
      typeof input.budgetAmount === "number" ? input.budgetAmount : 0,
    constraints: stringArray(input.constraints)
  };
}

function resolveRestoredView(
  data: BuyerWorkspace,
  storedView?: BuyerView
): BuyerView {
  const engagement = data.engagement;
  if (engagement?.status === "supplier_secured") return "deployment";
  if (engagement) {
    return engagement.hostedCheckoutUrl || storedView === "payment"
      ? "payment"
      : "selected";
  }
  if (submittedResponses(data).length >= 2) return "compare";
  if (
    storedView === "outreach" ||
    storedView === "compare" ||
    data.outreachDeliveries.some(
      (item) =>
        item.deliveryStatus !== "not_sent" ||
        Boolean(item.errorMessage)
    ) ||
    data.invitations.some((item) =>
      ["opened", "responded"].includes(item.status)
    )
  ) {
    return storedView === "compare" ? "compare" : "outreach";
  }
  if (
    data.solutionDecision &&
    data.solutionDecision.decision !== "local_trial" &&
    supplierCandidates(data).length
  ) {
    return "candidates";
  }
  if (data.researchResult) return "plan";
  return "intake";
}

function startNewRequirement() {
  const needProfileId = workspace?.needProfile?.id;
  if (needProfileId) {
    safeStorageRemove(`${CONTEXT_PREFIX}${needProfileId}`);
    safeStorageRemove(`${TOKEN_PREFIX}${needProfileId}`);
  }
  safeStorageRemove(LAST_NEED_KEY);
  safeSessionStorageSet(NEW_REQUIREMENT_KEY, "1");
  workspaceEpoch += 1;
  workspace = undefined;
  aiIntakeResult = undefined;
  intakeEvidence = [];
  milestoneUpdateDraft = "";
  intakeDraft = cloneInput(emptyInput);
  priority = "speed";
  selectedApproachId = "";
  selectedCandidateIds = new Set();
  candidateSelectionInitialised = false;
  outreachMode = "email";
  selectedResponseId = "";
  intakeMode = "ai";
  view = "intake";
  restoreFailed = false;
  loadState = "idle";
  errorMessage = "";
  liveMessage = "";
  window.history.replaceState({}, "", window.location.pathname);
  render();
}

function currentPhase(): "find" | "connect" | "deploy" {
  if (
    view === "candidates" ||
    view === "outreach" ||
    view === "compare"
  ) {
    return "connect";
  }
  if (
    view === "selected" ||
    view === "payment" ||
    view === "deployment"
  ) {
    return "deploy";
  }
  return "find";
}

function selectedSupplier(data: BuyerWorkspace) {
  const responseId =
    data.engagement?.supplierResponseId || selectedResponseId;
  const response = data.responses.find((item) => item.id === responseId);
  if (!response) return undefined;
  return {
    response,
    supplier: supplierFor(data, response.supplierId)
  };
}

function selectableApproaches(
  research: NonNullable<BuyerWorkspace["researchResult"]>
) {
  return [...research.approaches]
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 3);
}

function resolveSelectedApproachId(
  research: BuyerWorkspace["researchResult"],
  requestedApproachId?: string
) {
  if (!research) return "";
  const approaches = selectableApproaches(research);
  if (
    requestedApproachId &&
    approaches.some((approach) => approach.id === requestedApproachId)
  ) {
    return requestedApproachId;
  }
  return approaches[0]?.id ?? "";
}

function submittedResponses(data: BuyerWorkspace) {
  return data.responses.filter((item) => item.status === "submitted");
}

function isSelectableSupplierResponse(response: SupplierResponse) {
  return (
    response.decision === "can_help" &&
    (response.indicativePrice?.amount ?? 0) > 0
  );
}

function supplierFor(data: BuyerWorkspace, supplierId: string) {
  return (
    data.discoveredSuppliers.find((item) => item.id === supplierId) ??
    data.suppliers.find((item) => item.id === supplierId)
  );
}

function supplierCandidates(data: BuyerWorkspace): SupplierCandidate[] {
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

function resolveSelectedCandidateIds(
  data: BuyerWorkspace,
  requested: Set<string>,
  initialised: boolean
) {
  const candidateIds = supplierCandidates(data).map(
    (candidate) => candidate.supplierId
  );
  const available = new Set(candidateIds);
  if (!initialised) {
    const invited = data.invitations
      .map((invitation) => invitation.supplierId)
      .filter((supplierId) => available.has(supplierId));
    return new Set(invited.length ? invited : candidateIds);
  }
  return new Set(
    [...requested].filter((supplierId) => available.has(supplierId))
  );
}

function outreachModeAvailable(
  data: BuyerWorkspace,
  candidates: SupplierCandidate[],
  mode: OutreachMode
) {
  if (mode === "link") return true;
  const selected = candidates
    .filter((candidate) => selectedCandidateIds.has(candidate.supplierId))
    .map((candidate) => supplierFor(data, candidate.supplierId));
  if (mode === "sms") {
    return (
      selected.length > 0 &&
      selected.every(
        (supplier) =>
          supplier &&
          "contactPhone" in supplier &&
          Boolean(supplier.contactPhone)
      )
    );
  }
  return (
    selected.length > 0 &&
    selected.every((supplier) => Boolean(supplier?.contactEmail))
  );
}

function outreachAction(mode: OutreachMode, count: number) {
  const supplierLabel = `${count} supplier${count === 1 ? "" : "s"}`;
  if (mode === "link") {
    return {
      title: "Secure link fallback",
      description:
        "The request selects no provider channel. The backend delivery records remain the source of truth.",
      label: `Create links for ${supplierLabel}`,
      loadingLabel: "Creating secure supplier links"
    };
  }
  if (mode === "sms") {
    if (demoControlsAvailable) {
      return {
        title: "Prepare demo SMS invitations",
        description:
          "Veltact prepares the same private links and delivery records without contacting an external phone.",
        label: `Prepare demo SMS for ${supplierLabel}`,
        loadingLabel: "Preparing demo SMS outreach"
      };
    }
    return {
      title: "Send SMS through the configured provider",
      description:
        "Only backend provider acceptance can move SMS delivery to Sent. Secure links remain available for every selected supplier.",
      label: `Send SMS to ${supplierLabel}`,
      loadingLabel: "Requesting approved SMS outreach"
    };
  }
  if (demoControlsAvailable) {
    return {
      title: "Prepare demo email invitations",
      description:
        "Veltact prepares the same private links and delivery records without contacting an external inbox.",
      label: `Prepare demo email for ${supplierLabel}`,
      loadingLabel: "Preparing demo email outreach"
    };
  }
  return {
    title: "Send email through the configured provider",
    description:
      "Only backend provider acceptance can move email delivery to Sent. Secure links remain available for every selected supplier.",
    label: `Send email to ${supplierLabel}`,
    loadingLabel: "Requesting approved email outreach"
  };
}

function matchForSupplier(
  data: BuyerWorkspace,
  supplierId: string
): SupplierCandidate | undefined {
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

function invitationForSupplier(data: BuyerWorkspace, supplierId: string) {
  return data.invitations.find((item) => item.supplierId === supplierId);
}

function supplierActivity(
  invitation: SupplierInvitation,
  response: SupplierResponse | undefined,
  deliveries: SupplierOutreachDelivery[]
): SupplierActivityStatus {
  if (response?.status === "submitted" || invitation.status === "responded") {
    return "responded";
  }
  if (invitation.status === "opened") return "viewed";
  if (deliveries.some((item) => item.deliveryStatus === "sent")) return "sent";
  if (
    deliveries.length &&
    deliveries.every((item) => item.deliveryStatus === "failed")
  ) {
    return "failed";
  }
  return "ready";
}

function activityLabel(status: SupplierActivityStatus) {
  const labels: Record<SupplierActivityStatus, string> = {
    ready: "Ready",
    sent: "Sent",
    failed: "Failed",
    viewed: "Viewed",
    responded: "Responded"
  };
  return labels[status];
}

function renderCitations(
  citations: NonNullable<BuyerWorkspace["researchResult"]>["citations"]
) {
  return `
    <ul class="citation-list">
      ${citations
        .map(
          (citation) => `
            <li>
              <a href="${safeHttpUrl(citation.url)}" target="_blank" rel="noreferrer">${escapeHtml(citation.title)}</a>
              <span>${escapeHtml(statusLabel(citation.sourceType))} / ${escapeHtml(statusLabel(citation.provider))}</span>
              <p>${escapeHtml(citation.evidenceNote)}</p>
            </li>
          `
        )
        .join("")}
    </ul>
  `;
}

function sourceBadge(
  source: "live" | "fixture",
  liveLabel: string,
  fixtureLabel: string
) {
  return `<span class="source-badge is-${source}">${escapeHtml(source === "live" ? liveLabel : fixtureLabel)}</span>`;
}

function formField(
  name: string,
  label: string,
  value: string,
  required: boolean,
  placeholder = "",
  type = "text"
) {
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

function priorityButton(
  value: PrioritySignal,
  label: string,
  description: string
) {
  return `
    <button class="priority-option ${priority === value ? "is-selected" : ""}" type="button" data-priority="${value}" aria-pressed="${priority === value}">
      <span class="priority-radio" aria-hidden="true"></span>
      <strong>${escapeHtml(label)}</strong>
      <small>${escapeHtml(description)}</small>
    </button>
  `;
}

function fact(label: string, value: string, missing = false) {
  return `
    <div class="${missing ? "is-missing" : ""}">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `;
}

function comparisonFact(label: string, value: string, missing = false) {
  return `
    <div class="${missing ? "is-missing" : ""}">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `;
}

function profileList(label: string, items: string[]) {
  return `
    <div>
      <span>${escapeHtml(label)}</span>
      ${
        items.length
          ? tagList(items)
          : `<strong class="missing-value">Not provided</strong>`
      }
    </div>
  `;
}

function tagList(items: string[]) {
  return `<div class="tag-list">${items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`;
}

function bulletList(items: string[], empty: string) {
  if (!items.length) return `<p class="quiet-note">${escapeHtml(empty)}</p>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderInlineEmpty(title: string, body: string) {
  return `
    <div class="inline-empty">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(body)}</p>
    </div>
  `;
}

function primaryActionHeading() {
  if (intakeMode === "manual") return "Create and analyse the manual profile";
  if (aiIntakeResult) return "Create the reviewed Need Profile";
  return "Structure one supplier requirement";
}

function primaryActionDescription() {
  if (intakeMode === "manual") {
    return "Manual fields go through the same canonical Need Profile API.";
  }
  if (aiIntakeResult) {
    return "No supplier outreach occurs during analysis.";
  }
  return "Low-signal input is rejected before a paid model call.";
}

function fileEvidenceNote(item: IntakeEvidence) {
  if (item.kind === "written") return "Written evidence ready";
  if (aiIntakeResult && intakeSourceMode === "fixture") {
    return "Provided; local adapter did not interpret file content";
  }
  if (item.dataUrl) return "File ready for API processing";
  return "File metadata only";
}

function maskDestination(destination: string) {
  if (destination.includes("@")) {
    const [name, domain] = destination.split("@");
    return `${name.slice(0, 2)}***@${domain}`;
  }
  return destination.length > 6
    ? `${destination.slice(0, 4)}...${destination.slice(-3)}`
    : destination;
}

function requireNeedProfile(data: BuyerWorkspace) {
  if (!data.needProfile) {
    throw new Error("The buyer workspace has no Need Profile.");
  }
  return data.needProfile;
}

function cloneInput(input: BuyerRequirementInput): BuyerRequirementInput {
  return {
    ...input,
    equipmentOrTechnology: [...input.equipmentOrTechnology],
    requiredCapabilities: [...input.requiredCapabilities],
    constraints: [...input.constraints]
  };
}

function parseBudgetAmount(value: string) {
  const matches = [...value.matchAll(/(\d[\d,]*)/g)];
  const last = matches.at(-1)?.[1];
  return last ? Number(last.replaceAll(",", "")) : 0;
}

function titleFromDescription(description: string) {
  const firstSentence = description.split(/[.!?]/)[0]?.trim();
  return firstSentence
    ? firstSentence.slice(0, 90)
    : "Industrial supplier requirement";
}

function priorityLabel(value: PrioritySignal) {
  const labels: Record<PrioritySignal, string> = {
    speed: "Speed",
    technical_fit: "Technical fit",
    quality: "Quality",
    trust: "Trust",
    price: "Price"
  };
  return labels[value];
}

function humanFieldName(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function supplierName(
  supplier: SupplierReference | undefined,
  supplierId: string
) {
  return supplier?.companyName ?? `Supplier ${shortId(supplierId)}`;
}

function supplierRecordLabel(supplier: SupplierReference | undefined) {
  if (!supplier) return "Supplier record";
  if ("sourceMode" in supplier) {
    return supplier.sourceMode === "live"
      ? "Public-source supplier lead"
      : "Demo supplier lead";
  }
  return supplier.verified ? "Verified supplier record" : "Supplier record";
}

function supplierLocation(supplier: SupplierReference | undefined) {
  if (!supplier) return "Location unavailable";
  if ("location" in supplier) return supplier.location;
  return supplier.serviceRegions[0] ?? "Service region unavailable";
}

function candidateContactReadiness(
  supplier: SupplierReference | undefined
) {
  if (!supplier) return "Secure link only";
  const channels = [
    supplier.contactEmail ? "email" : "",
    "contactPhone" in supplier && supplier.contactPhone ? "SMS" : ""
  ].filter(Boolean);
  return channels.length
    ? `${channels.join(" + ")} available`
    : "Secure link only";
}

function shortId(value: string) {
  return value.length > 10 ? `${value.slice(0, 8)}...` : value;
}

function shortUrl(value: string) {
  try {
    const url = new URL(value);
    const token = url.searchParams.get("token");
    return `${url.host}${url.pathname}${token ? `?token=${token.slice(0, 7)}...` : ""}`;
  } catch {
    return value;
  }
}

function safeHttpUrl(value: string) {
  try {
    const url = new URL(value, window.location.origin);
    return ["http:", "https:"].includes(url.protocol)
      ? escapeHtml(url.toString())
      : "#";
  } catch {
    return "#";
  }
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(amount / 100);
}

function formatTime(value?: string) {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Unavailable";
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formValue(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}

function csvValues(form: FormData, name: string) {
  return formValue(form, name)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function bindClick(selector: string, handler: () => void | Promise<void>) {
  document.querySelector<HTMLButtonElement>(selector)?.addEventListener(
    "click",
    () => {
      void handler();
    }
  );
}

async function copyText(value: string) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function showLiveMessage(message: string) {
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

function safeStorageGet(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable in a hardened browser; the current session continues.
  }
}

function safeStorageRemove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage may be unavailable in a hardened browser.
  }
}

function safeSessionStorageGet(key: string) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionStorageSet(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Session storage may be unavailable; the current in-memory reset still works.
  }
}

function safeSessionStorageRemove(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Session storage may be unavailable in a hardened browser.
  }
}

function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unexpected RapidMatch error.";
}

function renderCompanyIdentity(companyName: string, compact = false) {
  const logo = companyLogoFor(companyName);
  if (!logo) return escapeHtml(companyName);
  return `
    <span class="company-identity ${compact ? "is-compact" : ""}">
      <span class="company-logo-shell" aria-hidden="true">
        <img class="company-logo" src="${logo}" alt="" />
      </span>
      <span class="company-name-text">${escapeHtml(companyName)}</span>
    </span>
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
