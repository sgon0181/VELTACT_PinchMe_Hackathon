import { RapidMatchService } from "./rapidMatchService.js";
const service = new RapidMatchService();
const app = document.querySelector("#app");
const runtimeWindow = window;
const realtimeOrigin = new URL(runtimeWindow.API_BASE_URL ?? "http://localhost:4000/api").origin;
const rapidMatchSocketEvent = {
    joinNeedProfile: "rapidmatch:need.join",
    leaveNeedProfile: "rapidmatch:need.leave",
    supplierResponseSubmitted: "rapidmatch:response.submitted",
    paymentStatusUpdated: "rapidmatch:payment.status_updated",
    engagementSecured: "rapidmatch:engagement.secured"
};
const socketWindow = window;
let stage = "submit";
let loadState = "idle";
let errorMessage = "";
let priority = "speed";
let selectedResponseId = "";
let workspace;
let pollHandle;
let isPolling = false;
let realtimeSocket;
let joinedNeedProfileId = "";
let realtimeClientLoading;
const defaultInput = {
    companyName: "",
    contactName: "",
    contactEmail: "",
    title: "",
    description: "",
    category: "",
    location: "",
    requiredBy: "",
    budgetAmount: 0
};
const demoInput = {
    companyName: "HarbourPack Manufacturing",
    contactName: "Elena Morris",
    contactEmail: "elena.morris@harbourpack.example",
    title: "Urgent PLC fault on packaging conveyor",
    description: "Main packaging conveyor stopped after intermittent PLC faults. We need an industrial automation supplier to diagnose the fault, restore safe production and advise on any replacement parts.",
    category: "Industrial automation",
    location: "Western Sydney, NSW",
    requiredBy: "Today",
    budgetAmount: 1800
};
function render() {
    if (!app)
        return;
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
    const steps = [
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
        .map(([key, label], index) => `
            <span class="progress-step ${index <= activeIndex ? "is-active" : ""}">
              <span>${index + 1}</span>${label}
            </span>
          `)
        .join("")}
    </nav>
  `;
}
function renderStateBanner() {
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
    if (stage === "submit")
        return renderSubmit();
    if (stage === "profile" && workspace)
        return renderProfile(workspace);
    if (stage === "matches" && workspace)
        return renderMatches(workspace);
    if (stage === "selected" && workspace)
        return renderSelection(workspace);
    if (stage === "payment" && workspace)
        return renderPayment(workspace);
    if (stage === "secured" && workspace)
        return renderSecured(workspace);
    return renderEmpty("No workspace loaded", "Submit a requirement to generate the buyer workspace.");
}
function renderSubmit() {
    return `
    <form id="requirement-form" class="panel intake-form">
      <div class="panel-heading">
        <p class="eyebrow">Step 1</p>
        <h2>Start a supplier response brief</h2>
        <p class="muted">Focus on the operational problem, site constraints and what a qualified provider needs to know before responding.</p>
      </div>
      <label class="field requirement-field">
        <span>Requirement</span>
        <textarea name="description" rows="8" placeholder="Describe the equipment, failure or service need, operating environment, access constraints and what outcome you need.">${escapeHtml(defaultInput.description)}</textarea>
      </label>
      <div class="primary-fields">
        ${field("location", "Location", defaultInput.location, "text", "Site, region or service area")}
        ${basicField("urgencySignal", "Urgency", "", "text", "Immediate, this week, planned")}
        ${field("budgetAmount", "Budget", defaultInput.budgetAmount ? String(defaultInput.budgetAmount) : "", "number", "Indicative AUD")}
      </div>
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
        ${field("companyName", "Company", defaultInput.companyName, "text", "Company name")}
        ${field("contactName", "Contact", defaultInput.contactName, "text", "Primary contact")}
        ${field("contactEmail", "Email", defaultInput.contactEmail, "email", "buyer@example.com")}
        ${field("category", "Category", defaultInput.category, "text", "Industrial automation, fabrication, maintenance")}
        ${field("requiredBy", "Required date", defaultInput.requiredBy, "text", "Today, 25 July, next shutdown window")}
      </section>
      <div class="actions field-wide">
        <button class="primary" type="submit">Find matching suppliers</button>
      </div>
    </form>
  `;
}
function renderProfile(data) {
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
function renderMatches(data) {
    return `
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
        </div>
        ${renderActivity(data)}
      </div>
    </section>
    <section class="panel">
      <div class="panel-heading">
        <p class="eyebrow">Step 6</p>
        <h2>Compare standardised supplier responses</h2>
      </div>
      ${data.responses.length ? renderResponseTable(data) : renderEmpty("No responses yet", "Supplier invitations have been sent. Responses will appear here.")}
      <div class="actions">
        <button id="refresh-responses-button" class="secondary-action" type="button">Refresh supplier responses</button>
        <button id="select-button" class="primary" type="button" ${selectedResponseId ? "" : "disabled"}>Select Supplier</button>
      </div>
    </section>
  `;
}
function renderMatchCard(match) {
    return `
    <article class="match-card">
      <div>
        <h3>${escapeHtml(match.supplier.companyName)}</h3>
        <p>${escapeHtml(match.priorityReason)}</p>
      </div>
      <strong class="score">${match.weightedScore}</strong>
      <ul>${match.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>
      ${match.risks.length ? `<p class="risk">Risk: ${escapeHtml(match.risks.join(" "))}</p>` : ""}
    </article>
  `;
}
function renderActivity(data) {
    return `
    <ol class="activity">
      ${data.invitations
        .map((invitation) => {
        const supplier = data.suppliers.find((item) => item.id === invitation.supplierId);
        const response = data.responses.find((item) => item.invitationId === invitation.id);
        return `
            <li>
              <span class="activity-dot ${response ? "is-done" : ""}"></span>
              <div>
                <strong>${escapeHtml(supplier?.companyName ?? invitation.supplierId)}</strong>
                <p>${formatStatus(invitation.status)}${response ? ` - response submitted ${formatTime(response.submittedAt)}` : " - awaiting supplier response"}</p>
                <a class="supplier-link" href="${escapeHtml(invitation.responseUrl)}" target="_blank" rel="noreferrer">Open supplier link</a>
              </div>
            </li>
          `;
    })
        .join("")}
    </ol>
  `;
}
function renderResponseTable(data) {
    return `
    <div class="response-table" role="table">
      <div class="response-row response-head" role="row">
        <span>Supplier</span><span>Availability</span><span>Price</span><span>Evidence</span><span>Select</span>
      </div>
      ${data.responses
        .map((response) => {
        const supplier = data.suppliers.find((item) => item.id === response.supplierId);
        return `
            <label class="response-row" role="row">
              <span><strong>${escapeHtml(supplier?.companyName ?? response.supplierId)}</strong><small>${formatStatus(response.decision)}</small></span>
              <span>${escapeHtml(response.availability ?? "Not supplied")}</span>
              <span>${response.indicativePrice ? money(response.indicativePrice.amount, response.indicativePrice.currency) : "Not supplied"}</span>
              <span>${escapeHtml(response.relevantExperience ?? "Not supplied")}</span>
              <span><input type="radio" name="supplierResponse" value="${response.id}" ${selectedResponseId === response.id ? "checked" : ""}></span>
            </label>
          `;
    })
        .join("")}
    </div>
  `;
}
function renderSelection(data) {
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
function renderPayment(data) {
    const checkoutUrl = data.hostedCheckoutUrl ?? data.engagement?.hostedCheckoutUrl;
    return `
    <section class="panel payment-panel">
      <p class="eyebrow">Step 8</p>
      <h2>Awaiting payment</h2>
      <p>Veltact created a Pinch-hosted payment link through the API. The supplier is secured only after the backend receives verified payment evidence.</p>
      ${checkoutUrl
        ? `<a class="checkout-link" href="${escapeHtml(checkoutUrl)}" target="_blank" rel="noreferrer">Open Pinch hosted checkout</a>`
        : renderEmpty("Payment link unavailable", "Try creating the payment link again.")}
      <dl class="profile-list">
        ${detail("Engagement status", data.engagement?.status ?? "payment_link_created")}
        ${detail("Payment status", data.engagement?.paymentStatus ?? "link_created")}
      </dl>
      <div class="actions">
        <button id="payment-status-button" class="primary" type="button">Refresh Payment Status</button>
      </div>
    </section>
  `;
}
function renderSecured(data) {
    const selected = selectedSupplier(data);
    return `
    <section class="panel secured-panel">
      <p class="eyebrow">Step 9</p>
      <h2>Supplier secured</h2>
      <p>${escapeHtml(selected?.supplier.companyName ?? "The supplier")} is secured after verified payment evidence.</p>
      <dl class="profile-list">
        ${detail("Need Profile", data.needProfile.status)}
        ${detail("Engagement", data.engagement?.status ?? "supplier_secured")}
        ${detail("Payment", data.engagement?.paymentStatus ?? "paid")}
        ${detail("Secured at", data.engagement?.securedAt ? formatTime(data.engagement.securedAt) : "Pending")}
      </dl>
    </section>
  `;
}
function bindEvents() {
    document.querySelector("#requirement-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await run(async () => {
            const description = value(form, "description");
            const needProfile = await service.createNeedProfile({
                companyName: value(form, "companyName"),
                contactName: value(form, "contactName"),
                contactEmail: value(form, "contactEmail"),
                title: titleFromRequirement(description),
                description,
                category: value(form, "category"),
                location: value(form, "location"),
                requiredBy: value(form, "requiredBy") || value(form, "urgencySignal"),
                budgetAmount: Number(value(form, "budgetAmount"))
            });
            workspace = { needProfile, suppliers: [], matches: [], invitations: [], responses: [] };
            stage = "profile";
        });
    });
    document.querySelector("#demo-fill-button")?.addEventListener("click", () => {
        const form = document.querySelector("#requirement-form");
        if (!form)
            return;
        setFormValue(form, "companyName", demoInput.companyName);
        setFormValue(form, "contactName", demoInput.contactName);
        setFormValue(form, "contactEmail", demoInput.contactEmail);
        setFormValue(form, "description", demoInput.description);
        setFormValue(form, "category", demoInput.category);
        setFormValue(form, "location", demoInput.location);
        setFormValue(form, "urgencySignal", "Immediate production impact");
        setFormValue(form, "requiredBy", demoInput.requiredBy);
        setFormValue(form, "budgetAmount", String(demoInput.budgetAmount));
        priority = "speed";
        document.querySelectorAll("[data-priority]").forEach((button) => {
            button.classList.toggle("is-selected", button.dataset.priority === priority);
        });
    });
    document.querySelectorAll("[data-priority]").forEach((button) => {
        button.addEventListener("click", () => {
            priority = button.dataset.priority;
            render();
        });
    });
    document.querySelector("#match-button")?.addEventListener("click", async () => {
        const currentWorkspace = workspace;
        if (!currentWorkspace)
            return;
        await run(async () => {
            workspace = await service.submitPriority(currentWorkspace.needProfile, priority);
            selectedResponseId = workspace.responses[0]?.id ?? "";
            stage = "matches";
        });
    });
    document.querySelectorAll("input[name='supplierResponse']").forEach((input) => {
        input.addEventListener("change", () => {
            selectedResponseId = input.value;
            render();
        });
    });
    document.querySelector("#refresh-responses-button")?.addEventListener("click", async () => {
        const currentWorkspace = workspace;
        if (!currentWorkspace)
            return;
        await run(async () => {
            workspace = await service.refreshWorkspace(currentWorkspace, priority);
            selectedResponseId = workspace.responses[0]?.id ?? selectedResponseId;
            stage = "matches";
        });
    });
    document.querySelector("#select-button")?.addEventListener("click", async () => {
        const currentWorkspace = workspace;
        if (!currentWorkspace || !selectedResponseId)
            return;
        await run(async () => {
            workspace = await service.selectSupplier(currentWorkspace, selectedResponseId);
            stage = "selected";
        });
    });
    document.querySelector("#payment-button")?.addEventListener("click", async () => {
        const currentWorkspace = workspace;
        if (!currentWorkspace)
            return;
        await run(async () => {
            workspace = await service.createPaymentLink(currentWorkspace);
            stage = "payment";
        });
    });
    document.querySelector("#payment-status-button")?.addEventListener("click", async () => {
        const currentWorkspace = workspace;
        if (!currentWorkspace)
            return;
        await run(async () => {
            workspace = await service.refreshEngagement(currentWorkspace);
            stage = workspace.engagement?.status === "supplier_secured" ? "secured" : "payment";
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
async function initialiseRealtimeSocket(needProfileId) {
    if (realtimeClientLoading) {
        await realtimeClientLoading;
    }
    else if (!socketWindow.io) {
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
    realtimeSocket.on(rapidMatchSocketEvent.supplierResponseSubmitted, (payload) => {
        if (payload.needProfileId === workspace?.needProfile.id) {
            void refreshLiveState({ forceRender: true });
        }
    });
    realtimeSocket.on(rapidMatchSocketEvent.paymentStatusUpdated, (payload) => {
        if (payload.needProfileId === workspace?.needProfile.id) {
            void refreshLiveState({ forceRender: true });
        }
    });
    realtimeSocket.on(rapidMatchSocketEvent.engagementSecured, (payload) => {
        if (payload.needProfileId === workspace?.needProfile.id) {
            void refreshLiveState({ forceRender: true });
        }
    });
    if (workspace?.needProfile.id === needProfileId) {
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
    if (!realtimeSocket || !joinedNeedProfileId) {
        return;
    }
    realtimeSocket.emit(rapidMatchSocketEvent.leaveNeedProfile, { needProfileId: joinedNeedProfileId });
    joinedNeedProfileId = "";
}
async function refreshLiveState(options = {}) {
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
                selectedResponseId = workspace.responses[0].id;
            }
            const nextResponseIds = workspace.responses.map((response) => response.id).join(",");
            if (options.forceRender || nextResponseIds !== previousResponseIds) {
                render();
            }
        }
        if (stage === "payment") {
            workspace = await service.refreshEngagement(workspace);
            if (workspace.engagement?.status === "supplier_secured") {
                stage = "secured";
            }
            if (options.forceRender || workspace.engagement?.status !== previousEngagementStatus || stage === "secured") {
                render();
            }
        }
    }
    catch {
        // Manual refresh keeps user-facing errors explicit; polling should not interrupt the demo flow.
    }
    finally {
        isPolling = false;
    }
}
async function run(action) {
    loadState = "loading";
    errorMessage = "";
    render();
    try {
        await action();
        loadState = "success";
    }
    catch (error) {
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
function field(name, label, valueText, type = "text", placeholder = "") {
    return basicField(name, label, valueText, type, placeholder);
}
function basicField(name, label, valueText, type = "text", placeholder = "") {
    return `
    <label class="field">
      <span>${label}</span>
      <input name="${name}" type="${type}" value="${escapeHtml(valueText)}" placeholder="${escapeHtml(placeholder)}" />
    </label>
  `;
}
function setFormValue(form, name, valueText) {
    const fieldElement = form.elements.namedItem(name);
    if (fieldElement instanceof HTMLInputElement || fieldElement instanceof HTMLTextAreaElement) {
        fieldElement.value = valueText;
    }
}
function titleFromRequirement(description) {
    const firstSentence = description.split(/[.!?]/)[0]?.trim();
    if (firstSentence) {
        return firstSentence.slice(0, 90);
    }
    return "Industrial supplier requirement";
}
function priorityButton(valueText, label, description) {
    return `
    <button class="priority-card ${priority === valueText ? "is-selected" : ""}" type="button" data-priority="${valueText}">
      <strong>${label}</strong>
      <span>${description}</span>
    </button>
  `;
}
function detail(label, valueText) {
    return `<div><dt>${label}</dt><dd>${escapeHtml(formatStatus(valueText))}</dd></div>`;
}
function tagGroup(label, items) {
    if (!items.length)
        return renderEmpty(label, "No items supplied.");
    return `
    <div>
      <h3>${label}</h3>
      <div class="tags">${items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
    </div>
  `;
}
function renderEmpty(title, body) {
    return `<div class="empty"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(body)}</p></div>`;
}
function selectedSupplier(data) {
    const response = data.responses.find((item) => item.id === selectedResponseId);
    const supplier = data.suppliers.find((item) => item.id === response?.supplierId);
    return response && supplier ? { response, supplier } : undefined;
}
function value(form, name) {
    return String(form.get(name) ?? "").trim();
}
function money(amount, currency) {
    return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(amount / 100);
}
function formatStatus(valueText) {
    return valueText.replaceAll("_", " ");
}
function formatTime(valueText) {
    if (!valueText)
        return "not yet";
    return new Intl.DateTimeFormat("en-AU", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
    }).format(new Date(valueText));
}
function escapeHtml(valueText) {
    return valueText
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
render();
