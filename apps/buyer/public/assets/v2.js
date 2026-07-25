const runtimeWindow = window;
const apiRoot = runtimeWindow.API_BASE_URL ??
    (["localhost", "127.0.0.1"].includes(window.location.hostname) &&
        window.location.port !== "4000"
        ? "http://localhost:4000/api"
        : `${window.location.origin}/api`);
const v2Api = `${apiRoot.replace(/\/$/, "")}/v2`;
const app = document.querySelector("#v2-app");
const localDemo = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const socketEvents = [
    "veltact:v2:research.updated",
    "veltact:v2:discovery.updated",
    "veltact:v2:supplier.lifecycle_updated",
    "veltact:v2:supplier.response_submitted",
    "veltact:v2:project.updated",
    "veltact:v2:milestone.payment_updated"
];
let intake = emptyIntake();
let workspace;
let needId = new URLSearchParams(window.location.search).get("needId") ?? "";
let buyerAccessToken = "";
let phase = "find";
let busyAction = "";
let notice;
let selectedLeadIds = new Set();
let selectedApproachIds = new Set();
let decisionType = "hybrid";
let pollHandle;
let socketConnectedNeedId = "";
bootstrap();
async function bootstrap() {
    const params = new URLSearchParams(window.location.search);
    const queryToken = params.get("accessToken");
    if (needId) {
        buyerAccessToken =
            queryToken ?? localStorage.getItem(tokenKey(needId)) ?? "";
        if (queryToken) {
            localStorage.setItem(tokenKey(needId), queryToken);
            params.delete("accessToken");
            history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
        }
        await loadWorkspace();
    }
    else {
        render();
    }
    configurePolling();
}
function render() {
    if (!app)
        return;
    const title = workspace
        ? workspace.need.profile.title
        : "From factory problem to accountable deployment.";
    app.innerHTML = `
    <header class="topbar">
      <a class="wordmark" href="./landing.html" aria-label="Veltact home">
        <span class="wordmark-mark" aria-hidden="true"></span>
        <span>Veltact</span>
      </a>
      <div class="topbar-meta">
        <span>Buyer workspace / Find / Connect / Deploy</span>
        <button class="button tertiary small" data-action="reset-workspace" type="button">Reset</button>
      </div>
    </header>
    <section class="workspace-title">
      <div>
        <span class="eyebrow">${workspace ? `Requirement ${escapeHtml(shortId(workspace.need.id))}` : "Industrial procurement workspace"}</span>
        <h1>${escapeHtml(title)}</h1>
        <p>${workspace
        ? "Research the solution space, activate the right supplier, then control milestones and payment evidence through delivery."
        : "Describe the operational need once. Veltact structures it, researches cited approaches, discovers relevant suppliers and carries the selected response into a controlled project."}</p>
      </div>
      ${workspace ? `<span class="status-badge ${workspace.projects.length ? "active_supplier" : "invited"}">${workspace.projects.length ? "Deployment active" : "Requirement active"}</span>` : ""}
    </section>
    ${notice ? `<div class="banner ${notice.kind}">${escapeHtml(notice.message)}</div>` : ""}
    <div class="workspace-grid">
      ${renderPhaseNav()}
      <section class="workspace-main">
        ${workspace ? renderPhase() : renderIntake()}
      </section>
    </div>
    <p class="footer-note">Veltact 2.0 prototype / Australia / AUD / External results carry provenance labels</p>
  `;
}
function renderPhaseNav() {
    const phases = [
        ["find", "Find", "Need + evidence"],
        ["connect", "Connect", "Supplier activation"],
        ["deploy", "Deploy", "Milestones + Pinch"]
    ];
    return `
    <nav class="phase-nav" aria-label="Veltact workflow phases">
      ${phases
        .map(([key, label, detail], index) => `
            <button type="button" data-phase="${key}" class="${phase === key ? "is-active" : ""}" ${!workspace ? "disabled" : ""}>
              <span class="phase-index">0${index + 1}</span>
              <span><strong>${label}</strong><small>${detail}</small></span>
            </button>`)
        .join("")}
    </nav>
  `;
}
function renderPhase() {
    if (phase === "connect")
        return renderConnect();
    if (phase === "deploy")
        return renderDeploy();
    return renderFind();
}
function renderIntake() {
    return `
    <form id="need-form" class="panel">
      <div class="panel-header">
        <div>
          <span class="micro-label">Start with the factory problem</span>
          <h2>Describe the operating need</h2>
          <p>Use plain language. The AI intake structures procurement fields; it does not diagnose machinery or provide control instructions.</p>
        </div>
      </div>
      <div class="template-row">
        <button class="button secondary small" data-action="fill-template" data-template="plc" type="button">Demo: PLC</button>
        <button class="button secondary small" data-action="fill-template" data-template="robotics" type="button">Demo: Robotic integration</button>
        <button class="button tertiary small ${busyAction === "ai-intake" ? "is-loading" : ""}" data-action="structure-intake" type="button" ${busyAction ? "disabled" : ""}>Structure with AI</button>
      </div>
      <div class="intake-layout">
        <div>
          <label class="field">
            Requirement
            <textarea id="raw-requirement" class="requirement-input" name="rawRequirement" required placeholder="What stopped, what outcome is required, where is the site, how urgent is it, and what constraints must a provider respect?">${escapeHtml(intake.rawRequirement)}</textarea>
          </label>
          <div class="field-grid">
            ${inputField("Title", "title", intake.title, true, "is-wide")}
            ${inputField("Location", "location", intake.location, true)}
            ${inputField("Urgency (days)", "urgencyDays", String(intake.urgencyDays || ""), true, "", "number", "1")}
            ${inputField("Budget (AUD)", "budgetAud", String(intake.budgetAud || ""), true, "", "number", "100")}
            ${selectPriority()}
            ${inputField("Category", "category", intake.category, true)}
            ${inputField("Industry", "industry", intake.industry, true)}
            ${inputField("Equipment / technology", "equipment", intake.equipment, false, "is-wide", "text", "", "Comma separated")}
            ${inputField("Required capabilities", "capabilities", intake.capabilities, true, "is-wide", "text", "", "Comma separated")}
            ${inputField("Constraints", "constraints", intake.constraints, false, "is-wide", "text", "", "Comma separated")}
          </div>
        </div>
        <aside class="secondary-fields">
          <div>
            <span class="micro-label">Buyer record</span>
            <h3>Contact details</h3>
          </div>
          ${inputField("Company", "companyName", intake.companyName, true)}
          ${inputField("Buyer name", "buyerName", intake.buyerName, true)}
          ${inputField("Buyer email", "buyerEmail", intake.buyerEmail, true, "", "email")}
          <div class="banner warning">
            Supplier outreach is never automatic. You will review discovery evidence and approve each destination first.
          </div>
          <button class="button ${busyAction === "create-need" ? "is-loading" : ""}" type="submit" ${busyAction ? "disabled" : ""}>Create Need Profile</button>
        </aside>
      </div>
    </form>
  `;
}
function renderFind() {
    if (!workspace)
        return "";
    const research = workspace.researchResult;
    const decision = workspace.solutionDecision;
    if (research && selectedApproachIds.size === 0) {
        selectedApproachIds = new Set(decision?.selectedApproachIds ?? research.approaches.map((item) => item.id));
    }
    return `
    ${renderNeedProfile()}
    ${!research ? `
      <section class="panel">
        <div class="panel-header">
          <div>
            <span class="micro-label">Cited solution research</span>
            <h2>Frame the solution space before sourcing</h2>
            <p>Veltact separates safe local evidence gathering from work that needs an authorised industrial specialist.</p>
          </div>
        </div>
        <button class="button ${busyAction === "research" ? "is-loading" : ""}" data-action="research" type="button" ${busyAction ? "disabled" : ""}>Research solution approaches</button>
      </section>` : renderResearch(research, decision)}
  `;
}
function renderNeedProfile() {
    if (!workspace)
        return "";
    const profile = workspace.need.profile;
    return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <span class="micro-label">Structured Need Profile</span>
          <h2>${escapeHtml(profile.title)}</h2>
          <p>${escapeHtml(profile.description)}</p>
        </div>
        <span class="status-badge active_supplier">Buyer reviewed</span>
      </div>
      <dl class="data-grid">
        <div><dt>Location</dt><dd>${escapeHtml(profile.location)}</dd></div>
        <div><dt>Urgency</dt><dd>${profile.urgencyDays ? `${profile.urgencyDays} day(s)` : "Not specified"}</dd></div>
        <div><dt>Budget</dt><dd>${profile.budgetAud ? money(profile.budgetAud * 100) : "Not specified"}</dd></div>
        <div><dt>Priority</dt><dd>${formatStatus(profile.buyerPriority ?? "technical_fit")}</dd></div>
      </dl>
      <div class="chip-row">${(profile.requiredCapabilities ?? []).map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join("")}</div>
    </section>
  `;
}
function renderResearch(research, decision) {
    return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <span class="micro-label">Solution intelligence</span>
          <h2>Evidence-backed approaches</h2>
          <p>${escapeHtml(research.overview)}</p>
        </div>
        <span class="mode-badge ${research.sourceMode}">${research.sourceMode}</span>
      </div>
      <div class="banner warning">${escapeHtml(research.safetyNotice)}</div>
      <div class="approach-list" style="margin-top: 14px">
        ${research.approaches.map(renderApproach).join("")}
      </div>
      <div class="decision-bar">
        <div>
          <span class="micro-label">Buyer decision</span>
          <div class="segmented" style="margin-top: 8px">
            ${decisionOption("local_trial", "Try locally")}
            ${decisionOption("hybrid", "Hybrid")}
            ${decisionOption("outsource", "Outsource")}
          </div>
        </div>
        <button class="button ${busyAction === "decision" ? "is-loading" : ""}" data-action="save-decision" type="button" ${busyAction ? "disabled" : ""}>${decision ? "Update decision" : "Approve solution path"}</button>
      </div>
      ${decision ? `
        <div class="button-row" style="margin-top: 16px">
          <span class="status-badge active_supplier">${formatStatus(decision.decision)} approved</span>
          ${decision.decision !== "local_trial" && workspace?.supplierLeads.length === 0
        ? `<button class="button ${busyAction === "discover" ? "is-loading" : ""}" data-action="discover" type="button" ${busyAction ? "disabled" : ""}>Discover relevant suppliers</button>`
        : ""}
          ${workspace?.supplierLeads.length
        ? `<button class="button secondary" data-phase="connect" type="button">Review ${workspace.supplierLeads.length} candidates</button>`
        : ""}
        </div>` : ""}
      <details style="margin-top: 18px">
        <summary>Sources and missing information</summary>
        <ul class="citation-list" style="margin-top: 12px">
          ${research.citations
        .map((citation) => `<li>
                <a href="${safeHref(citation.url)}" target="_blank" rel="noreferrer">${escapeHtml(citation.title)}</a>
                <span class="mode-badge ${citation.provider === "fixture" ? "fixture" : "live"}">${escapeHtml(citation.provider)}</span>
                <p>${escapeHtml(citation.evidenceNote)}</p>
              </li>`)
        .join("")}
        </ul>
        <p class="micro-label">Still needed</p>
        <ul class="compact-list">${research.missingInformation.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </details>
    </section>
  `;
}
function renderApproach(approach) {
    return `
    <article class="record ${selectedApproachIds.has(approach.id) ? "is-selected" : ""}">
      <div class="approach-select">
        <input type="checkbox" data-approach-id="${escapeHtml(approach.id)}" ${selectedApproachIds.has(approach.id) ? "checked" : ""} aria-label="Select ${escapeHtml(approach.title)}" />
        <div>
          <div class="record-topline">
            <h3>${escapeHtml(approach.title)}</h3>
            <span class="score">${Math.round(approach.confidence * 100)}</span>
          </div>
          <p>${escapeHtml(approach.summary)}</p>
          <p><strong>Why this path:</strong> ${escapeHtml(approach.rationale)}</p>
          <div class="detail-columns">
            <div><h4>Factory can prepare</h4><ul>${approach.localActions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
            <div><h4>Escalate when</h4><ul>${approach.outsourceTriggers.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
          </div>
          <div class="chip-row" style="margin-top: 12px">${approach.requiredCapabilities.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join("")}</div>
        </div>
      </div>
    </article>
  `;
}
function renderConnect() {
    if (!workspace)
        return "";
    if (workspace.supplierLeads.length === 0) {
        return `<div class="empty-state"><div><h2>No supplier discovery run yet</h2><p>Approve an outsource or hybrid solution path in Find first.</p><button class="button" data-phase="find" type="button">Return to Find</button></div></div>`;
    }
    return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <span class="micro-label">Buyer-controlled supplier discovery</span>
          <h2>Review evidence before outreach</h2>
          <p>Keep this buyer workspace open. Each approved supplier receives a private, one-requirement invitation and returns its response here.</p>
        </div>
        <span class="mode-badge ${workspace.supplierLeads.some((lead) => lead.sourceMode === "live") ? "live" : "fixture"}">${workspace.supplierLeads.some((lead) => lead.sourceMode === "live") ? "live web evidence" : "fixture candidates"}</span>
      </div>
      ${renderConnectHandoff()}
      <div class="record-list">${workspace.supplierLeads.map(renderSupplierLead).join("")}</div>
      <div class="button-row" style="margin-top: 18px">
        <button class="button secondary ${busyAction === "approve-leads" ? "is-loading" : ""}" data-action="approve-leads" type="button" ${selectedLeadIds.size === 0 || busyAction ? "disabled" : ""}>Approve selected for outreach</button>
        <button class="button ${busyAction === "invite-leads" ? "is-loading" : ""}" data-action="invite-leads" type="button" ${selectedApprovedLeadIds().length === 0 || busyAction ? "disabled" : ""}>Send approved invitations</button>
      </div>
    </section>
    ${renderOutreach()}
    ${renderResponses()}
  `;
}
function renderSupplierLead(lead) {
    if (!workspace)
        return "";
    const invitation = workspace.supplierInvitations.find((item) => item.supplierId === lead.id);
    const profile = workspace.supplierProfiles.find((item) => item.supplierLeadId === lead.id);
    const canSelect = ["discovered", "approved_for_outreach"].includes(lead.lifecycleStatus);
    return `
    <article class="record">
      <div class="selection-box">
        <input type="checkbox" data-lead-id="${escapeHtml(lead.id)}" ${selectedLeadIds.has(lead.id) ? "checked" : ""} ${canSelect ? "" : "disabled"} aria-label="Select ${escapeHtml(lead.companyName)}" />
        <div style="width: 100%">
          <div class="record-topline">
            <div>
              <h3>${escapeHtml(lead.companyName)}</h3>
              <p>${escapeHtml(lead.location)} / <a href="${safeHref(lead.website)}" target="_blank" rel="noreferrer">Source website</a></p>
            </div>
            <div class="status-row">
              <span class="score">${Math.round(lead.matchScore)}</span>
              <span class="status-badge ${lead.lifecycleStatus}">${formatStatus(lead.lifecycleStatus)}</span>
            </div>
          </div>
          <div class="detail-columns">
            <div><h4>Why it matched</h4><ul>${lead.matchReasons.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
            <div><h4>Review risks</h4><ul>${lead.risks.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
          </div>
          <div class="chip-row" style="margin-top: 12px">${lead.capabilities.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join("")}</div>
          ${invitation ? `<div class="handoff-action">
            <div><strong>Private supplier invitation created</strong><span>The supplier sees this requirement only. Buyer controls remain in this workspace.</span></div>
            ${localDemo
        ? `<a class="button secondary small" href="${safeHref(invitation.responseUrl)}" target="_blank" rel="noreferrer">Open supplier demo view</a>`
        : `<span class="status-badge ${invitation.status}">${formatStatus(invitation.status)}</span>`}
          </div>` : ""}
          ${profile ? renderProfileApproval(lead, profile) : ""}
        </div>
      </div>
    </article>
  `;
}
function renderProfileApproval(lead, profile) {
    const actions = [];
    if (lead.lifecycleStatus === "supplier_profile_approved") {
        actions.push(`<button class="button small" data-action="buyer-approve-profile" data-lead="${escapeHtml(lead.id)}" type="button">Approve supplier profile</button>`);
    }
    if (lead.lifecycleStatus === "buyer_approved") {
        actions.push(`<button class="button small" data-action="activate-supplier" data-lead="${escapeHtml(lead.id)}" type="button">Activate in RapidMatch</button>`);
    }
    return `
    <div class="banner success" style="margin-top: 14px">
      <strong>Supplier-reviewed profile</strong><br />
      ${escapeHtml(profile.profileSummary)}
      ${actions.length ? `<div class="button-row" style="margin-top: 10px">${actions.join("")}</div>` : ""}
    </div>
  `;
}
function renderConnectHandoff() {
    if (!workspace)
        return "";
    const hasBuyerApproval = workspace.supplierLeads.some((lead) => lead.lifecycleStatus !== "discovered");
    const hasInvitation = workspace.supplierInvitations.length > 0;
    const hasSupplierProfile = workspace.supplierProfiles.length > 0;
    const hasResponse = workspace.supplierResponses.length > 0;
    const stages = [
        {
            title: "Buyer reviews evidence",
            detail: "Approve only candidates relevant to this need.",
            complete: hasBuyerApproval
        },
        {
            title: "Private invitation",
            detail: "Veltact sends one scoped claim link.",
            complete: hasInvitation
        },
        {
            title: "Supplier claims profile",
            detail: "The supplier corrects and approves its own record.",
            complete: hasSupplierProfile
        },
        {
            title: "Response returns here",
            detail: "Buyer activation unlocks the comparable response.",
            complete: hasResponse
        }
    ];
    const activeIndex = stages.findIndex((stage) => !stage.complete);
    return `
    <div class="handoff-guide" aria-label="Buyer and supplier handoff">
      ${stages
        .map((stage, index) => `<div class="handoff-step ${stage.complete ? "is-complete" : index === activeIndex ? "is-active" : ""}">
            <span>${stage.complete ? "OK" : `0${index + 1}`}</span>
            <div><strong>${escapeHtml(stage.title)}</strong><small>${escapeHtml(stage.detail)}</small></div>
          </div>`)
        .join("")}
    </div>
  `;
}
function renderOutreach() {
    if (!workspace || workspace.outreachDeliveries.length === 0)
        return "";
    return `
    <section class="panel">
      <div class="panel-header">
        <div><span class="micro-label">Parallel outreach</span><h2>Delivery evidence</h2><p>Email and mobile delivery states come from backend provider adapters.</p></div>
      </div>
      <div class="outreach-grid">
        ${workspace.outreachDeliveries
        .map((delivery) => {
        const lead = workspace?.supplierLeads.find((item) => item.id === delivery.supplierId);
        return `<div class="outreach-item">
              <strong>${escapeHtml(lead?.companyName ?? delivery.supplierId)}</strong>
              ${escapeHtml(delivery.channel.toUpperCase())} / ${escapeHtml(maskDestination(delivery.destination))}
              <div style="margin-top: 7px"><span class="status-badge ${delivery.deliveryStatus}">${formatStatus(delivery.deliveryStatus)}</span></div>
              ${delivery.errorMessage ? `<p>${escapeHtml(delivery.errorMessage)}</p>` : ""}
            </div>`;
    })
        .join("")}
      </div>
    </section>
  `;
}
function renderResponses() {
    if (!workspace)
        return "";
    return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <span class="micro-label">Comparable commercial responses</span>
          <h2>${workspace.supplierResponses.length ? `${workspace.supplierResponses.length} response(s)` : "Waiting for an active supplier response"}</h2>
          <p>The supplier claim page updates after buyer approval. The active supplier then submits the standard response here.</p>
        </div>
      </div>
      ${workspace.supplierResponses.length === 0
        ? `<div class="empty-state"><div><strong>Buyer workspace waiting for the invited supplier</strong><p>The supplier completes its private claim and response in a separate view. This page updates automatically without exposing buyer controls.</p>${localDemo ? `<p>For the guided demo, use <strong>Open supplier demo view</strong> on the invited candidate above.</p>` : ""}</div></div>`
        : `<div class="record-list">${workspace.supplierResponses.map(renderResponse).join("")}</div>`}
    </section>
  `;
}
function renderResponse(response) {
    if (!workspace)
        return "";
    const profile = workspace.supplierProfiles.find((item) => item.id === response.supplierProfileId);
    return `
    <article class="record">
      <div class="record-topline">
        <div><h3>${escapeHtml(profile?.companyName ?? "Supplier")}</h3><p>${escapeHtml(response.proposedApproach)}</p></div>
        <span class="status-badge ${response.decision === "can_help" ? "active_supplier" : "failed"}">${formatStatus(response.decision)}</span>
      </div>
      <div class="record-meta">
        <div><span>Availability</span>${escapeHtml(response.availability)}</div>
        <div><span>Indicative</span>${money(response.indicativePrice.amount)}</div>
        <div><span>Submitted</span>${formatDateTime(response.submittedAt)}</div>
      </div>
      <p><strong>Relevant experience:</strong> ${escapeHtml(response.relevantExperience)}</p>
      <button class="button" data-action="select-response" data-response="${escapeHtml(response.id)}" type="button" ${workspace.projects.length || response.decision !== "can_help" ? "disabled" : ""}>Select supplier and create project</button>
    </article>
  `;
}
function renderDeploy() {
    if (!workspace)
        return "";
    const project = workspace.projects[0];
    if (!project) {
        return `<div class="empty-state"><div><h2>No delivery project yet</h2><p>Select a submitted supplier response in Connect to create the appropriate industrial project template.</p><button class="button" data-phase="connect" type="button">Return to Connect</button></div></div>`;
    }
    const total = project.milestones.reduce((sum, milestone) => sum + milestone.amount.amount, 0);
    return `
    <section class="panel">
      <div class="project-head">
        <div>
          <span class="micro-label">${formatStatus(project.templateType)}</span>
          <h2 style="font-family: var(--font-display); margin: 5px 0">${escapeHtml(project.title)}</h2>
          <p style="color: var(--muted); max-width: 760px">${escapeHtml(project.objective)}</p>
          <div class="status-row"><span class="status-badge active_supplier">${formatStatus(project.status)}</span><span class="chip">${escapeHtml(project.supplierName)}</span><span class="chip">${escapeHtml(project.siteLocation)}</span></div>
        </div>
        <div class="project-value"><span class="micro-label">Planned milestone value</span><strong>${money(total)}</strong><small>AUD, not escrow</small></div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-header"><div><span class="micro-label">Commercial control</span><h2>Billable milestones</h2><p>Each milestone is funded separately. A browser return never marks it paid; only backend Pinch evidence or an explicit local demo event does.</p></div></div>
      <ol class="milestone-list">${project.milestones.map((milestone) => renderMilestone(project, milestone)).join("")}</ol>
    </section>
    <section class="panel">
      <div class="panel-header"><div><span class="micro-label">Delivery control</span><h2>Tasks and dependencies</h2></div></div>
      ${project.tasks.map((task) => `
        <div class="task-row">
          <div><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(task.owner)} / ${escapeHtml(project.milestones.find((item) => item.id === task.milestoneId)?.title ?? "")}</small></div>
          <select data-task-id="${escapeHtml(task.id)}" aria-label="Status for ${escapeHtml(task.title)}">
            ${["not_started", "in_progress", "blocked", "completed"].map((status) => `<option value="${status}" ${task.status === status ? "selected" : ""}>${formatStatus(status)}</option>`).join("")}
          </select>
        </div>`).join("")}
    </section>
    <section class="panel">
      <div class="panel-header"><div><span class="micro-label">Change control</span><h2>Raise a scoped change</h2><p>Changes stay attached to the delivery project instead of becoming a general messaging product.</p></div></div>
      <form id="change-request-form" class="field-grid">
        ${inputField("Title", "title", "", true)}
        ${inputField("Requested by", "requestedBy", workspace.need.buyerName, true)}
        <label class="field is-wide">Description<textarea name="description" rows="3" required></textarea></label>
        <label class="field is-wide">Schedule / cost impact<textarea name="impact" rows="2" required></textarea></label>
        <button class="button" type="submit" ${busyAction ? "disabled" : ""}>Submit change request</button>
      </form>
      ${project.changeRequests.length ? `<div class="record-list" style="margin-top: 16px">${project.changeRequests.map((change) => `<article class="record"><div class="record-topline"><h3>${escapeHtml(change.title)}</h3><span class="status-badge invited">${formatStatus(change.status)}</span></div><p>${escapeHtml(change.description)}</p><p><strong>Impact:</strong> ${escapeHtml(change.impact)}</p></article>`).join("")}</div>` : ""}
    </section>
  `;
}
function renderMilestone(project, milestone) {
    const actions = [];
    if (["awaiting_payment", "payment_failed"].includes(milestone.status)) {
        actions.push(`<button class="button small" data-action="payment-link" data-project="${escapeHtml(project.id)}" data-milestone="${escapeHtml(milestone.id)}" type="button">Create Pinch link</button>`);
        if (localDemo) {
            actions.push(`<button class="button secondary small" data-action="demo-payment" data-project="${escapeHtml(project.id)}" data-milestone="${escapeHtml(milestone.id)}" type="button">Record local demo payment</button>`);
        }
    }
    if (milestone.hostedCheckoutUrl) {
        actions.push(`<a class="button small" href="${safeHref(milestone.hostedCheckoutUrl)}" target="_blank" rel="noreferrer">Open Pinch checkout</a>`, `<button class="button secondary small" data-action="reconcile-payment" data-project="${escapeHtml(project.id)}" data-milestone="${escapeHtml(milestone.id)}" type="button">Reconcile</button>`);
    }
    if (["funded", "in_progress", "awaiting_acceptance"].includes(milestone.status)) {
        actions.push(`<button class="button small" data-action="accept-milestone" data-project="${escapeHtml(project.id)}" data-milestone="${escapeHtml(milestone.id)}" type="button">Accept milestone</button>`);
    }
    const evidence = workspace?.paymentEvidence.find((item) => item.milestoneId === milestone.id);
    return `
    <li class="milestone">
      <span class="milestone-index">${String(milestone.sequence).padStart(2, "0")}</span>
      <div>
        <h3>${escapeHtml(milestone.title)}</h3>
        <p>${escapeHtml(milestone.description)}</p>
        <div class="status-row">
          <span class="status-badge ${milestone.status}">${formatStatus(milestone.status)}</span>
          <span class="status-badge ${milestone.paymentStatus}">${formatStatus(milestone.paymentStatus)}</span>
          ${evidence ? `<span class="mode-badge ${evidence.provider === "pinch" ? "live" : "fixture"}">${escapeHtml(evidence.provider)} evidence</span>` : ""}
        </div>
        <ul class="compact-list" style="margin-top: 9px">${milestone.acceptanceCriteria.map((criterion) => `<li>${criterion.accepted ? "Accepted: " : ""}${escapeHtml(criterion.description)}</li>`).join("")}</ul>
        ${actions.length ? `<div class="button-row" style="margin-top: 12px">${actions.join("")}</div>` : ""}
      </div>
      <span class="milestone-amount">${money(milestone.amount.amount)}</span>
    </li>
  `;
}
if (app) {
    app.addEventListener("click", (event) => {
        const target = event.target.closest("[data-action], [data-phase]");
        if (!target)
            return;
        const nextPhase = target.dataset.phase;
        if (nextPhase) {
            phase = nextPhase;
            render();
            return;
        }
        const action = target.dataset.action;
        if (!action)
            return;
        event.preventDefault();
        void handleAction(action, target);
    });
    app.addEventListener("change", (event) => {
        const target = event.target;
        if (target.dataset.leadId) {
            if (target instanceof HTMLInputElement && target.checked) {
                selectedLeadIds.add(target.dataset.leadId);
            }
            else {
                selectedLeadIds.delete(target.dataset.leadId);
            }
            render();
            return;
        }
        if (target.dataset.approachId) {
            if (target instanceof HTMLInputElement && target.checked) {
                selectedApproachIds.add(target.dataset.approachId);
            }
            else {
                selectedApproachIds.delete(target.dataset.approachId);
            }
            render();
            return;
        }
        if (target.name === "decision") {
            decisionType = target.value;
            return;
        }
        if (target.dataset.taskId) {
            void runAction("task", async () => {
                const project = workspace?.projects[0];
                if (!project)
                    return;
                await api(`/projects/${encodeURIComponent(project.id)}/tasks/${encodeURIComponent(target.dataset.taskId ?? "")}`, {
                    method: "PATCH",
                    body: JSON.stringify({ status: target.value })
                });
                await loadWorkspace(false);
            });
        }
    });
    app.addEventListener("submit", (event) => {
        event.preventDefault();
        const form = event.target;
        if (form.id === "need-form") {
            void submitNeed(form);
        }
        if (form.id === "change-request-form") {
            void submitChangeRequest(form);
        }
    });
}
async function handleAction(action, target) {
    if (action === "fill-template") {
        intake = templateIntake(target.dataset.template === "robotics" ? "robotics" : "plc");
        notice = undefined;
        render();
        return;
    }
    if (action === "reset-workspace") {
        await runAction("reset", async () => {
            await api("/demo/reset", {
                method: "POST",
                body: JSON.stringify({ seeded: false })
            });
            if (needId)
                localStorage.removeItem(tokenKey(needId));
            needId = "";
            buyerAccessToken = "";
            workspace = undefined;
            selectedLeadIds.clear();
            selectedApproachIds.clear();
            intake = emptyIntake();
            history.replaceState({}, "", window.location.pathname);
            notice = { kind: "success", message: "V2 workspace reset." };
        });
        return;
    }
    if (action === "structure-intake") {
        const raw = document.querySelector("#raw-requirement")?.value.trim() ?? "";
        await runAction("ai-intake", async () => {
            const response = await fetch(`${apiRoot}/ai-intake/structure`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rawRequirement: raw })
            });
            const payload = (await response.json());
            if (!response.ok || !payload.aiIntakeResult) {
                throw new Error(payload.message ?? "AI intake did not return a profile.");
            }
            applyAiIntake(payload.aiIntakeResult);
            notice = {
                kind: "success",
                message: `Requirement structured using ${payload.source === "openai" ? "OpenAI" : "the deterministic local adapter"}. Review every field before submission.`
            };
        });
        return;
    }
    if (action === "research") {
        await runAction("research", async () => {
            await api(`/needs/${encodedNeedId()}/research`, { method: "POST" });
            await loadWorkspace(false);
            notice = {
                kind: "success",
                message: "Solution research is ready with provenance and safety boundaries."
            };
        });
        return;
    }
    if (action === "save-decision") {
        await runAction("decision", async () => {
            await api(`/needs/${encodedNeedId()}/solution-decision`, {
                method: "POST",
                body: JSON.stringify({
                    decision: decisionType,
                    selectedApproachIds: [...selectedApproachIds]
                })
            });
            await loadWorkspace(false);
            notice = { kind: "success", message: "Buyer solution decision recorded." };
        });
        return;
    }
    if (action === "discover") {
        await runAction("discover", async () => {
            await api(`/needs/${encodedNeedId()}/suppliers/discover`, {
                method: "POST"
            });
            await loadWorkspace(false);
            phase = "connect";
            notice = {
                kind: "warning",
                message: "Supplier candidates discovered. Review public evidence before approving outreach."
            };
        });
        return;
    }
    if (action === "approve-leads") {
        await runAction("approve-leads", async () => {
            await api(`/needs/${encodedNeedId()}/suppliers/approve-outreach`, {
                method: "POST",
                body: JSON.stringify({ supplierLeadIds: [...selectedLeadIds] })
            });
            await loadWorkspace(false);
            notice = {
                kind: "success",
                message: "Selected candidates approved for this requirement only."
            };
        });
        return;
    }
    if (action === "invite-leads") {
        await runAction("invite-leads", async () => {
            await api(`/needs/${encodedNeedId()}/invitations/send`, {
                method: "POST",
                body: JSON.stringify({ supplierLeadIds: selectedApprovedLeadIds() })
            });
            await loadWorkspace(false);
            notice = {
                kind: "success",
                message: localDemo
                    ? "Invitations processed. Keep this buyer workspace open and use Open supplier demo view on an invited candidate to continue in a second tab."
                    : "Invitations processed. Keep this buyer workspace open while suppliers respond from their private invitation links."
            };
        });
        return;
    }
    if (action === "buyer-approve-profile") {
        await runAction("profile-approval", async () => {
            await api(`/needs/${encodedNeedId()}/suppliers/${encodeURIComponent(target.dataset.lead ?? "")}/buyer-approve`, { method: "POST" });
            await loadWorkspace(false);
            notice = { kind: "success", message: "Supplier profile approved by buyer." };
        });
        return;
    }
    if (action === "activate-supplier") {
        await runAction("supplier-activation", async () => {
            await api(`/needs/${encodedNeedId()}/suppliers/${encodeURIComponent(target.dataset.lead ?? "")}/activate`, { method: "POST" });
            await loadWorkspace(false);
            notice = {
                kind: "success",
                message: "Supplier activated in RapidMatch. Its claim page can now submit the commercial response."
            };
        });
        return;
    }
    if (action === "select-response") {
        await runAction("select-response", async () => {
            await api(`/needs/${encodedNeedId()}/responses/${encodeURIComponent(target.dataset.response ?? "")}/select`, { method: "POST" });
            await loadWorkspace(false);
            phase = "deploy";
            notice = {
                kind: "success",
                message: "Supplier selected and the industrial delivery template was created."
            };
        });
        return;
    }
    if (["payment-link", "demo-payment", "reconcile-payment", "accept-milestone"].includes(action)) {
        const project = encodeURIComponent(target.dataset.project ?? "");
        const milestone = encodeURIComponent(target.dataset.milestone ?? "");
        const suffix = action === "payment-link"
            ? "payment-link"
            : action === "demo-payment"
                ? "demo-payment"
                : action === "reconcile-payment"
                    ? "reconcile"
                    : "accept";
        await runAction(action, async () => {
            const result = await api(`/projects/${project}/milestones/${milestone}/${suffix}`, {
                method: "POST"
            });
            await loadWorkspace(false);
            if (result.hostedCheckoutUrl) {
                window.open(result.hostedCheckoutUrl, "_blank", "noopener,noreferrer");
            }
            notice = {
                kind: action === "demo-payment" ? "warning" : "success",
                message: action === "demo-payment"
                    ? "Local demo payment evidence recorded. This is explicitly not a live Pinch transaction."
                    : "Milestone state updated."
            };
        });
    }
}
async function submitNeed(form) {
    const values = new FormData(form);
    await runAction("create-need", async () => {
        const rawRequirement = requiredValue(values, "rawRequirement");
        const profile = {
            title: requiredValue(values, "title"),
            description: rawRequirement,
            problemSummary: rawRequirement,
            category: requiredValue(values, "category"),
            industry: requiredValue(values, "industry"),
            equipmentOrTechnology: listValue(values, "equipment"),
            requiredCapabilities: listValue(values, "capabilities"),
            location: requiredValue(values, "location"),
            urgencyDays: Number(requiredValue(values, "urgencyDays")),
            budgetAud: Number(requiredValue(values, "budgetAud")),
            constraints: listValue(values, "constraints"),
            buyerPriority: requiredValue(values, "buyerPriority")
        };
        const created = await api("/needs", {
            method: "POST",
            body: JSON.stringify({
                buyerEmail: requiredValue(values, "buyerEmail"),
                buyerName: requiredValue(values, "buyerName"),
                companyName: requiredValue(values, "companyName"),
                profile
            })
        });
        needId = created.need.id;
        buyerAccessToken = created.buyerAccessToken;
        localStorage.setItem(tokenKey(needId), buyerAccessToken);
        history.replaceState({}, "", `${window.location.pathname}?needId=${encodeURIComponent(needId)}`);
        await loadWorkspace(false);
        notice = {
            kind: "success",
            message: "Need Profile created. Research the solution space before supplier discovery."
        };
    });
}
async function submitChangeRequest(form) {
    const project = workspace?.projects[0];
    if (!project)
        return;
    const values = new FormData(form);
    await runAction("change-request", async () => {
        await api(`/projects/${encodeURIComponent(project.id)}/change-requests`, {
            method: "POST",
            body: JSON.stringify({
                title: requiredValue(values, "title"),
                requestedBy: requiredValue(values, "requestedBy"),
                description: requiredValue(values, "description"),
                impact: requiredValue(values, "impact")
            })
        });
        await loadWorkspace(false);
        notice = { kind: "success", message: "Change request attached to the project." };
    });
}
async function loadWorkspace(shouldRender = true, reportErrors = true) {
    if (!needId)
        return;
    try {
        workspace = await api(`/needs/${encodeURIComponent(needId)}`);
        if (workspace.solutionDecision) {
            decisionType = workspace.solutionDecision.decision;
            selectedApproachIds = new Set(workspace.solutionDecision.selectedApproachIds);
        }
        if (workspace.projects.length > 0 && phase === "find")
            phase = "deploy";
        configureSocket();
        if (shouldRender)
            render();
    }
    catch (error) {
        if (reportErrors) {
            notice = {
                kind: "error",
                message: errorMessage(error)
            };
            render();
        }
    }
}
async function runAction(action, operation) {
    if (busyAction)
        return;
    busyAction = action;
    notice = undefined;
    render();
    try {
        await operation();
    }
    catch (error) {
        notice = { kind: "error", message: errorMessage(error) };
    }
    finally {
        busyAction = "";
        render();
    }
}
async function api(path, init = {}) {
    const response = await fetch(`${v2Api}${path}`, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            ...(buyerAccessToken
                ? { "x-veltact-buyer-token": buyerAccessToken }
                : {}),
            ...(init.headers ?? {})
        }
    });
    const payload = (await response.json().catch(() => ({})));
    if (!response.ok) {
        throw new Error(payload.message ?? `Request failed (${response.status})`);
    }
    return payload;
}
function configurePolling() {
    if (pollHandle)
        window.clearInterval(pollHandle);
    pollHandle = window.setInterval(() => {
        const editingForm = document.activeElement?.closest("form");
        if (workspace &&
            !busyAction &&
            !editingForm &&
            document.visibilityState === "visible") {
            void loadWorkspace(true, false);
        }
    }, 4000);
}
function configureSocket() {
    if (!workspace || socketConnectedNeedId === workspace.need.id || !runtimeWindow.io)
        return;
    const socket = runtimeWindow.io(new URL(apiRoot).origin, {
        transports: ["websocket", "polling"],
        reconnection: true
    });
    socket.emit("veltact:v2:need.join", {
        needProfileId: workspace.need.id,
        buyerAccessToken
    });
    for (const eventName of socketEvents) {
        socket.on(eventName, () => {
            if (!busyAction)
                void loadWorkspace(true, false);
        });
    }
    socketConnectedNeedId = workspace.need.id;
}
function selectedApprovedLeadIds() {
    return (workspace?.supplierLeads
        .filter((lead) => selectedLeadIds.has(lead.id) &&
        lead.lifecycleStatus === "approved_for_outreach")
        .map((lead) => lead.id) ?? []);
}
function applyAiIntake(result) {
    const generated = result.generatedProfile;
    const budgetMatch = generated.budgetRange?.replaceAll(",", "").match(/(\d+)/);
    intake = {
        ...intake,
        rawRequirement: result.rawRequirement,
        title: generated.title,
        location: generated.location ?? intake.location,
        urgencyDays: /today|urgent|immediate/i.test(generated.urgency ?? "") ? 1 : intake.urgencyDays || 14,
        budgetAud: budgetMatch ? Number(budgetMatch[1]) : intake.budgetAud,
        category: generated.category,
        industry: intake.industry || "Manufacturing",
        equipment: generated.equipmentOrTechnology.join(", "),
        capabilities: generated.requiredCapabilities.join(", "),
        constraints: generated.certificationsOrConstraints.join(", "),
        buyerPriority: generated.buyerPriority ?? intake.buyerPriority
    };
}
function emptyIntake() {
    return {
        rawRequirement: "",
        title: "",
        location: "",
        urgencyDays: 1,
        budgetAud: 12000,
        category: "",
        industry: "Manufacturing",
        equipment: "",
        capabilities: "",
        constraints: "",
        buyerPriority: "technical_fit",
        buyerEmail: "",
        buyerName: "",
        companyName: ""
    };
}
function templateIntake(scenario) {
    if (scenario === "robotics") {
        return {
            rawRequirement: "We want to automate mixed-carton pallet loading on our packaging line in Western Sydney. We need a robotic arm cell with vision, safe guarding, operator training and a staged installation that avoids disrupting adjacent production. Target commissioning is within 60 days and the approved budget is AUD 120,000.",
            title: "Automate mixed-carton pallet loading",
            location: "Western Sydney, NSW",
            urgencyDays: 60,
            budgetAud: 120000,
            category: "Robotics integration",
            industry: "Food and beverage manufacturing",
            equipment: "Industrial robot, machine vision, conveyor",
            capabilities: "Robotic systems integration, machinery safety, end-of-arm tooling, commissioning",
            constraints: "Maintain adjacent production access, operator training required",
            buyerPriority: "technical_fit",
            buyerEmail: "engineer@demo-factory.example",
            buyerName: "Alex Morgan",
            companyName: "Veltact Demonstration Factory"
        };
    }
    return {
        rawRequirement: "Our Newcastle packaging line stopped after an intermittent Siemens PLC communications fault. We need safe evidence-led triage, controlled recovery and a validated backup today. No safeguards may be bypassed and every controls change requires site authorisation. Budget is AUD 12,000.",
        title: "Recover a stopped packaging line PLC",
        location: "Newcastle, NSW",
        urgencyDays: 1,
        budgetAud: 12000,
        category: "Industrial automation breakdown",
        industry: "Food and beverage manufacturing",
        equipment: "Siemens PLC, industrial Ethernet, variable speed drives",
        capabilities: "PLC diagnostics, industrial networking, safe isolation",
        constraints: "No safeguard bypass, site authorisation for changes",
        buyerPriority: "speed",
        buyerEmail: "engineer@demo-factory.example",
        buyerName: "Alex Morgan",
        companyName: "Veltact Demonstration Factory"
    };
}
function inputField(label, name, value, required, className = "", type = "text", step = "", placeholder = "") {
    return `<label class="field ${className}">${escapeHtml(label)}
    <input name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" ${required ? "required" : ""} ${step ? `step="${escapeHtml(step)}" min="${type === "number" ? escapeHtml(step) : ""}"` : ""} placeholder="${escapeHtml(placeholder)}" />
  </label>`;
}
function selectPriority() {
    const options = [
        ["speed", "Speed"],
        ["technical_fit", "Technical fit"],
        ["quality", "Quality"],
        ["trust", "Trust"],
        ["price", "Price"]
    ];
    return `<label class="field">Buyer priority<select name="buyerPriority">${options.map(([value, label]) => `<option value="${value}" ${intake.buyerPriority === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>`;
}
function decisionOption(value, label) {
    return `<label><input type="radio" name="decision" value="${value}" ${decisionType === value ? "checked" : ""} /><span>${label}</span></label>`;
}
function requiredValue(values, name) {
    const value = String(values.get(name) ?? "").trim();
    if (!value)
        throw new Error(`${name} is required`);
    return value;
}
function listValue(values, name) {
    return String(values.get(name) ?? "")
        .split(/,|\n/)
        .map((item) => item.trim())
        .filter(Boolean);
}
function encodedNeedId() {
    if (!needId)
        throw new Error("No active requirement");
    return encodeURIComponent(needId);
}
function tokenKey(id) {
    return `veltact:v2:buyer-token:${id}`;
}
function money(amountInCents) {
    return new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: "AUD",
        maximumFractionDigits: 0
    }).format(amountInCents / 100);
}
function formatDateTime(value) {
    return new Intl.DateTimeFormat("en-AU", {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(new Date(value));
}
function formatStatus(value) {
    return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function shortId(value) {
    return value.slice(0, 8);
}
function maskDestination(value) {
    if (value.includes("@")) {
        const [local, domain] = value.split("@");
        return `${local.slice(0, 2)}***@${domain}`;
    }
    return value.length > 7
        ? `${value.slice(0, 4)}***${value.slice(-3)}`
        : value;
}
function safeHref(value) {
    try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol)
            ? escapeHtml(url.toString())
            : "#";
    }
    catch {
        return "#";
    }
}
function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
function errorMessage(error) {
    return error instanceof Error ? error.message : "Unexpected Veltact error";
}
export {};
