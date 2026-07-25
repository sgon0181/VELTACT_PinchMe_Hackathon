const API_BASE =
  window.API_BASE_URL ||
  (["localhost", "127.0.0.1"].includes(window.location.hostname) && window.location.port !== "4000"
    ? "http://localhost:4000/api"
    : `${window.location.origin}/api`);

const token = new URLSearchParams(window.location.search).get("token") || location.pathname.split("/").pop();
const form = document.querySelector("#response-form");
const statusEl = document.querySelector("#form-status");
const receipt = document.querySelector("#submitted-receipt");
const plcDemoResponse = {
  canHelp: "true",
  earliestAvailability: new Date().toISOString().slice(0, 10),
  indicativePriceAud: "1800",
  relevantExperience:
    "We have Siemens PLC and conveyor fault-response experience in food packaging sites, including urgent diagnostics, safe restart support and handover notes for maintenance teams.",
  conditions:
    "Remote fault photos or alarm screenshots requested before dispatch. Onsite support is subject to site induction and safe access to the control panel."
};
const roboticsDemoResponse = {
  canHelp: "true",
  earliestAvailability: new Date().toISOString().slice(0, 10),
  indicativePriceAud: "14500",
  relevantExperience:
    "Our field team has recovered ABB palletising cells integrated with Siemens S7 controls in food-packaging plants, including safety-circuit diagnosis, controlled restart and maintenance handover.",
  conditions:
    "Remote review of robot and PLC alarm history before dispatch. Price covers mobilisation, diagnostics and safe restart support; replacement hardware requires buyer approval."
};
let demoResponse = plcDemoResponse;

if (!token || token === "supplier.html") {
  setStatus("Missing invitation token.");
  form.hidden = true;
} else {
  loadOpportunity(token);
  form.addEventListener("submit", (event) => submitResponse(event, token));
  document.querySelector("#demo-fill-button").addEventListener("click", fillDemoResponse);
}

async function loadOpportunity(invitationToken) {
  try {
    const response = await fetch(`${API_BASE}/supplier-invitations/${encodeURIComponent(invitationToken)}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message || "Supplier invitation not found.");
    }

    renderOpportunity(payload.need, payload.invitation);
    const existingResponse = payload.response || payload.supplierResponse;
    if (existingResponse) {
      showSubmittedReceipt(existingResponse);
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Unable to load opportunity.");
    form.hidden = true;
  }
}

function renderOpportunity(need, invitation) {
  document.title = `${invitation.supplierName} opportunity`;
  text("#need-title", need.profile.title);
  text("#need-location", need.profile.location);
  text("#need-urgency", need.profile.urgencyDays ? `${need.profile.urgencyDays} days` : "Not specified");
  text("#need-budget", need.profile.budgetAud ? formatMoney(need.profile.budgetAud) : "Not specified");
  text("#need-description", need.profile.description);
  demoResponse = /robot|palletis|abb/i.test(
    `${need.profile.title} ${need.profile.description}`
  )
    ? roboticsDemoResponse
    : plcDemoResponse;

  const capabilities = document.querySelector("#capabilities");
  capabilities.replaceChildren(
    ...(need.profile.requiredCapabilities || []).map((capability) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = capability;
      return chip;
    })
  );
}

function fillDemoResponse() {
  const canHelpField = form.querySelector(`input[name="canHelp"][value="${demoResponse.canHelp}"]`);
  if (canHelpField) {
    canHelpField.checked = true;
  }
  setFormValue("earliestAvailability", demoResponse.earliestAvailability);
  setFormValue("indicativePriceAud", demoResponse.indicativePriceAud);
  setFormValue("relevantExperience", demoResponse.relevantExperience);
  setFormValue("conditions", demoResponse.conditions);
  setStatus("Demo response loaded.");
}

async function submitResponse(event, invitationToken) {
  event.preventDefault();
  const submitButton = form.querySelector(`button[type="submit"]`);
  submitButton.disabled = true;
  setStatus("Submitting...");

  const formData = new FormData(form);
  const body = {
    canHelp: formData.get("canHelp") === "true",
    earliestAvailability: String(formData.get("earliestAvailability") || ""),
    indicativePriceAud: Number(formData.get("indicativePriceAud") || 0),
    relevantExperience: String(formData.get("relevantExperience") || ""),
    conditions: String(formData.get("conditions") || "")
  };

  try {
    const response = await fetch(`${API_BASE}/supplier-invitations/${encodeURIComponent(invitationToken)}/responses`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message || "Response was not accepted.");
    }
    showSubmittedReceipt(payload.response || payload.supplierResponse);
  } catch (error) {
    submitButton.disabled = false;
    setStatus(error instanceof Error ? error.message : "Unable to submit response.");
  }
}

function showSubmittedReceipt(supplierResponse) {
  const canHelp = supplierResponse.canHelp ?? supplierResponse.decision === "can_help";
  const availability = supplierResponse.earliestAvailability ?? supplierResponse.availability;
  const indicativePriceAud =
    supplierResponse.indicativePriceAud ??
    (supplierResponse.indicativePrice ? supplierResponse.indicativePrice.amount / 100 : undefined);

  form.querySelectorAll("input, textarea, button").forEach((control) => {
    control.disabled = true;
  });
  form.hidden = true;

  text("#receipt-decision", canHelp ? "Can help" : "Cannot help");
  text("#receipt-availability", availability);
  text("#receipt-price", indicativePriceAud === undefined ? "-" : formatMoney(indicativePriceAud));
  receipt.hidden = false;
  setStatus("");
}

function text(selector, value) {
  document.querySelector(selector).textContent = value || "-";
}

function setStatus(message) {
  statusEl.textContent = message;
}

function setFormValue(name, value) {
  const field = form.elements.namedItem(name);
  if (field) {
    field.value = value;
  }
}

function formatMoney(amount) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0
  }).format(amount);
}
